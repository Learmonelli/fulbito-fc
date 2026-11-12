// Nube de Fulbito FC (Supabase). Cada fila de public.fulbito_state es una LIGA (?liga=<id>):
// sus datos (jsonb), su dueño y sus administradores (ver supabase/schema.sql).
// Cualquiera lee y ve los cambios en vivo; solo el dueño y los admins de esa liga escriben.
// Solo claves PUBLICABLES (sb_publishable_... o la anon): nunca la secret / service_role.
import { createClient as realCreateClient } from '@supabase/supabase-js';
import { MAIN, slugify, cleanEmail, isEmail } from './league.js';

export const ADMIN_EMAIL = 'leandroarmonelli@gmail.com'; // superadmin de la liga original
// Proyecto de Supabase de Fulbito FC. Por ahora comparte el proyecto de prueba de Piel Morena v2
// (tabla propia: fulbito_state). Si se deja vacío, la app funciona solo en el navegador.
// La clave es la PUBLICABLE (va en el navegador de todos); la seguridad la ponen las políticas RLS.
export const DEFAULT_CONFIG = {
  url: 'https://sylhlksbxnjwswgjohbp.supabase.co',
  key: 'sb_publishable_BbY4PgfsKHP7K8J4Zz7UIA_Gjbm8VNw',
};

export const isAdminUser = (user) => !!user && (
  cleanEmail(user.email) === ADMIN_EMAIL || user.app_metadata?.is_admin === true);

// ¿Este usuario puede cargar datos en esta liga? (mismo criterio que fulbito_can_edit en SQL)
export function canEditLeague(user, league) {
  if (!user || !league) return false;
  if (league.id === MAIN && isAdminUser(user)) return true;
  if (!league.exists) return false;
  return user.id === league.owner || (league.admins || []).includes(cleanEmail(user.email));
}

export function checkConfig(cfg) {
  const url = String(cfg?.url || '').trim().replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/, '');
  const key = String(cfg?.key || '').trim();
  if (!url || !key) return { ok: false, error: 'Falta la URL o la clave del proyecto.' };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) return { ok: false, error: 'La URL tiene que ser https://<proyecto>.supabase.co' };
  if (/^sb_secret_/.test(key) || /service_role/.test(atobSafe(key.split('.')[1]))) {
    return { ok: false, error: 'Esa es una clave SECRETA: nunca va en la app. Usá la publishable (sb_publishable_…).' };
  }
  return { ok: true, url, key };
}
function atobSafe(s) { try { return s ? globalThis.atob(s.replace(/-/g, '+').replace(/_/g, '/')) : ''; } catch { return ''; } }

const friendly = (e) => {
  const msg = String(e?.message || e || '');
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'Sin conexión con la nube.';
  if (/relation .* does not exist|fulbito_state/i.test(msg)) return 'Falta crear la tabla: corré supabase/schema.sql en el proyecto.';
  if (/row-level security|permission denied|violates/i.test(msg)) return 'La nube no dejó guardar: solo los administradores de esta liga pueden cargar datos.';
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Primero confirmá tu email con el link que te llegó.';
  if (/20 administradores/i.test(msg)) return 'Como mucho 20 administradores por liga.';
  return msg || 'Error desconocido.';
};

const META = 'id, name, owner, owner_email, admins';

export function createCloud({ createClient = realCreateClient, timers = globalThis, debounceMs = 700 } = {}) {
  let client = null; let channel = null; let user = null;
  let league = null; // { id, name, owner, ownerEmail, admins, exists }
  let status = 'off'; let detail = '';
  let pending = null; let timer = null; let saving = null; let lastSent = '';
  const statusFns = new Set(); const authFns = new Set(); const leagueFns = new Set();
  let onRemote = () => {};

  const setStatus = (s, d = '') => { status = s; detail = d; statusFns.forEach((fn) => fn(s, d)); };
  const setUser = (u) => { user = u ?? null; authFns.forEach((fn) => fn(user)); };
  const setLeague = (row, id) => {
    league = row
      ? { id: row.id, name: row.name || 'Fulbito FC', owner: row.owner ?? null, ownerEmail: row.owner_email ?? '', admins: row.admins ?? [], exists: true }
      : { id, name: 'Fulbito FC', owner: null, ownerEmail: '', admins: [], exists: false };
    leagueFns.forEach((fn) => fn(league));
  };

  async function flush() {
    if (!pending || !client || !league) return;
    const data = pending; pending = null;
    const text = JSON.stringify(data);
    if (text === lastSent) return;
    setStatus('saving');
    saving = (async () => {
      let res;
      if (league.exists) {
        // Con RLS, un update sin permiso no da error: devuelve 0 filas. Por eso se pide la fila.
        res = await client.from('fulbito_state').update({ data }).eq('id', league.id).select('id');
        if (!res.error && !(res.data || []).length) res = { error: { message: 'row-level security' } };
      } else {
        res = await client.from('fulbito_state').insert({ id: league.id, name: 'Fulbito FC', data }).select(META);
        if (!res.error) setLeague(res.data?.[0] ?? { id: league.id, name: 'Fulbito FC', owner: user?.id, admins: [] }, league.id);
      }
      if (res.error) { pending = pending ?? data; setStatus('error', friendly(res.error)); return; }
      lastSent = text;
      setStatus(pending ? 'saving' : 'ok');
    })();
    await saving;
    saving = null;
    if (pending) await flush();
  }

  const api = {
    status: () => status,
    detail: () => detail,
    user: () => user,
    league: () => league,
    canEdit: () => canEditLeague(user, league),
    isOwner: () => !!user && !!league?.exists && user.id === league.owner,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    onAuth(fn) { authFns.add(fn); return () => authFns.delete(fn); },
    onLeague(fn) { leagueFns.add(fn); return () => leagueFns.delete(fn); },

    // Conecta a una liga: lee sus datos (o null si está vacía o no existe) y queda escuchando.
    async connect(cfg, { onRemote: handler, leagueId = MAIN } = {}) {
      const c = checkConfig(cfg);
      if (!c.ok) throw new Error(c.error);
      onRemote = handler || onRemote;
      setStatus('connecting');
      client = createClient(c.url, c.key, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'fulbito-auth', detectSessionInUrl: true, flowType: 'implicit' },
      });
      try {
        if (client.auth) {
          const { data } = await client.auth.getSession();
          setUser(data?.session?.user);
          client.auth.onAuthStateChange((_e, session) => setUser(session?.user));
        }
        const { data, error } = await client.from('fulbito_state').select(`data, ${META}`).eq('id', leagueId);
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        setLeague(row, leagueId);
        const hasData = row?.data && Array.isArray(row.data.teams);
        if (hasData) lastSent = JSON.stringify(row.data);
        channel = client.channel(`fulbito-${leagueId}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'fulbito_state', filter: `id=eq.${leagueId}` }, (p) => {
            const r = p?.new;
            if (!r?.id) return;
            setLeague(r, leagueId); // nombre y administradores pueden cambiar
            const text = JSON.stringify(r.data);
            if (!r.data || text === lastSent) return; // eco de lo que subí yo
            lastSent = text;
            onRemote(r.data);
          })
          .subscribe();
        setStatus('ok');
        return hasData ? row.data : null;
      } catch (e) {
        client = null;
        setStatus('error', friendly(e));
        throw new Error(friendly(e));
      }
    },

    // Sube el estado (agrupa cambios seguidos). Solo si quien está logueado puede editar esta liga.
    push(data) {
      if (!client || !api.canEdit()) return false;
      pending = data;
      if (timer) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => { timer = null; flush(); }, debounceMs);
      return true;
    },
    async flushNow() {
      if (timer) { timers.clearTimeout(timer); timer = null; }
      if (saving) await saving;
      await flush();
    },

    // ---- Ligas ----
    // Crea una liga nueva: quien la crea queda como dueño. Devuelve su id (para el link).
    async createLeague(name, data, rnd = Math.random) {
      if (!client) throw new Error('La nube no está conectada.');
      if (!user) throw new Error('Primero entrá con tu email.');
      const n = String(name ?? '').trim().slice(0, 60);
      if (n.length < 3) throw new Error('Poné un nombre de al menos 3 letras.');
      for (let i = 0; i < 4; i++) {
        const id = slugify(n, rnd);
        const { error } = await client.from('fulbito_state').insert({ id, name: n, data }).select('id');
        if (!error) return id;
        if (!/duplicate|23505|already exists/i.test(`${error.code} ${error.message}`)) throw new Error(friendly(error));
      }
      throw new Error('No se pudo crear la liga. Probá con otro nombre.');
    },
    // Ligas donde el usuario es dueño o administrador.
    async myLeagues() {
      if (!client || !user) return [];
      const email = cleanEmail(user.email);
      const [own, adm] = await Promise.all([
        client.from('fulbito_state').select('id, name, owner').eq('owner', user.id),
        email ? client.from('fulbito_state').select('id, name, owner').contains('admins', [email]) : { data: [] },
      ]);
      const all = [...(own.data || []), ...(adm.data || [])];
      if (isAdminUser(user) && !all.some((l) => l.id === MAIN)) all.unshift({ id: MAIN, name: 'Fulbito FC (original)', owner: null });
      const seen = new Set();
      return all.filter((l) => !seen.has(l.id) && seen.add(l.id))
        .map((l) => ({ id: l.id, name: l.name, role: l.owner === user.id ? 'dueño' : 'admin' }));
    },
    // Cambia la lista de administradores (por email). Lo puede hacer el dueño o cualquier admin.
    async setAdmins(emails) {
      if (!client || !league?.exists) throw new Error('La liga todavía no está en la nube.');
      if (!api.canEdit()) throw new Error('Solo los administradores de esta liga pueden cambiar eso.');
      const list = [...new Set((emails || []).map(cleanEmail).filter(isEmail))].filter((e) => e !== league.ownerEmail);
      if (list.length > 20) throw new Error('Como mucho 20 administradores por liga.');
      const { data, error } = await client.from('fulbito_state').update({ admins: list }).eq('id', league.id).select(META);
      if (error) throw new Error(friendly(error));
      if (!(data || []).length) throw new Error(friendly('row-level security'));
      setLeague(data[0], league.id);
      return league.admins;
    },
    async renameLeague(name) {
      if (!client || !league?.exists || !api.canEdit()) throw new Error('Solo los administradores pueden cambiar el nombre.');
      const n = String(name ?? '').trim().slice(0, 60);
      if (n.length < 3) throw new Error('Poné un nombre de al menos 3 letras.');
      const { data, error } = await client.from('fulbito_state').update({ name: n }).eq('id', league.id).select(META);
      if (error) throw new Error(friendly(error));
      if (data?.[0]) setLeague(data[0], league.id);
    },

    // ---- Cuenta ----
    async signInWithPassword(email, password) {
      if (!client?.auth) throw new Error('La nube no está conectada.');
      if (!String(email || '').trim() || !password) throw new Error('Escribí tu email y tu contraseña.');
      const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
      if (error) throw new Error(friendly(error));
      setUser(data?.session?.user ?? data?.user);
    },
    // Link al mail: entra (y si es la primera vez, crea la cuenta). Vuelve a esta misma liga.
    async signInWithEmail(email) {
      if (!client?.auth) throw new Error('La nube no está conectada.');
      const addr = String(email || '').trim();
      if (!isEmail(addr)) throw new Error('Escribí un email válido.');
      const emailRedirectTo = typeof location !== 'undefined' ? location.origin + location.pathname + location.search : undefined;
      const { error } = await client.auth.signInWithOtp({ email: addr, options: { emailRedirectTo, shouldCreateUser: true } });
      if (error) throw new Error(friendly(error));
    },
    async setPassword(password) {
      if (!client?.auth || !user) throw new Error('Primero entrá con tu email.');
      if (String(password || '').length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error(friendly(error));
    },
    async signOut() {
      if (client?.auth) await client.auth.signOut();
      setUser(null);
    },
    disconnect() {
      if (channel && client?.removeChannel) client.removeChannel(channel);
      channel = null; client = null; pending = null;
      if (timer) { timers.clearTimeout(timer); timer = null; }
      setStatus('off');
    },
  };
  return api;
}
