// Nube de Fulbito FC (Supabase). Todo el estado viaja como un documento en public.fulbito_state
// (fila 'main', ver supabase/schema.sql). Cualquiera lee y ve los cambios en vivo; solo el admin escribe.
// Solo claves PUBLICABLES (sb_publishable_... o la anon): nunca la secret / service_role.
import { createClient as realCreateClient } from '@supabase/supabase-js';

export const ADMIN_EMAIL = 'leandroarmonelli@gmail.com';
export const ROW_ID = 'main';
// Proyecto de Supabase de Fulbito FC. Por ahora comparte el proyecto de prueba de Piel Morena v2
// (tabla propia: fulbito_state). Si se deja vacío, la app funciona solo en el navegador.
// La clave es la PUBLICABLE (va en el navegador de todos); la seguridad la ponen las políticas RLS.
export const DEFAULT_CONFIG = {
  url: 'https://sylhlksbxnjwswgjohbp.supabase.co',
  key: 'sb_publishable_BbY4PgfsKHP7K8J4Zz7UIA_Gjbm8VNw',
};

export const isAdminUser = (user) => !!user && (
  String(user.email || '').toLowerCase() === ADMIN_EMAIL || user.app_metadata?.is_admin === true);

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
  if (/row-level security|permission denied|violates/i.test(msg)) return 'La nube no dejó guardar: solo el administrador puede cargar datos.';
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  return msg || 'Error desconocido.';
};

export function createCloud({ createClient = realCreateClient, timers = globalThis, debounceMs = 700 } = {}) {
  let client = null; let channel = null; let user = null;
  let status = 'off'; let detail = '';
  let pending = null; let timer = null; let saving = null; let lastSent = '';
  const statusFns = new Set(); const authFns = new Set();
  let onRemote = () => {};

  const setStatus = (s, d = '') => { status = s; detail = d; statusFns.forEach((fn) => fn(s, d)); };
  const setUser = (u) => { user = u ?? null; authFns.forEach((fn) => fn(user)); };

  async function flush() {
    if (!pending || !client) return;
    const data = pending; pending = null;
    const text = JSON.stringify(data);
    if (text === lastSent) return;
    setStatus('saving');
    saving = (async () => {
      const { error } = await client.from('fulbito_state').upsert({ id: ROW_ID, data });
      if (error) { pending = pending ?? data; setStatus('error', friendly(error)); return; }
      lastSent = text;
      setStatus(pending ? 'saving' : 'ok');
    })();
    await saving;
    saving = null;
    if (pending) await flush();
  }

  return {
    status: () => status,
    detail: () => detail,
    user: () => user,
    isAdmin: () => isAdminUser(user),
    connected: () => !!client && status !== 'error-connect',
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    onAuth(fn) { authFns.add(fn); return () => authFns.delete(fn); },

    // Conecta, lee el documento (o null si todavía no hay) y queda escuchando cambios en vivo.
    async connect(cfg, handlers = {}) {
      const c = checkConfig(cfg);
      if (!c.ok) throw new Error(c.error);
      onRemote = handlers.onRemote || onRemote;
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
        const { data, error } = await client.from('fulbito_state').select('data, updated_at').eq('id', ROW_ID);
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.data) lastSent = JSON.stringify(row.data);
        channel = client.channel('fulbito')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'fulbito_state', filter: `id=eq.${ROW_ID}` }, (p) => {
            const d = p?.new?.data;
            if (!d) return;
            const text = JSON.stringify(d);
            if (text === lastSent) return; // es el eco de lo que subí yo
            lastSent = text;
            onRemote(d);
          })
          .subscribe();
        setStatus('ok');
        return row?.data ?? null;
      } catch (e) {
        client = null;
        setStatus('error', friendly(e));
        throw new Error(friendly(e));
      }
    },

    // Sube el estado (agrupa cambios seguidos). Solo si el que está logueado es el admin.
    push(data) {
      if (!client || !isAdminUser(user)) return false;
      pending = data;
      if (timer) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => { timer = null; flush(); }, debounceMs);
      return true;
    },
    // Sube ya lo pendiente (antes de cerrar o en las pruebas).
    async flushNow() {
      if (timer) { timers.clearTimeout(timer); timer = null; }
      if (saving) await saving;
      await flush();
    },

    async signInWithPassword(email, password) {
      if (!client?.auth) throw new Error('La nube no está conectada.');
      if (!String(email || '').trim() || !password) throw new Error('Escribí tu email y tu contraseña.');
      const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
      if (error) throw new Error(friendly(error));
      setUser(data?.session?.user ?? data?.user);
    },
    async signInWithEmail(email) {
      if (!client?.auth) throw new Error('La nube no está conectada.');
      const addr = String(email || '').trim();
      if (!addr) throw new Error('Escribí tu email.');
      const emailRedirectTo = typeof location !== 'undefined' ? location.origin + location.pathname : undefined;
      const { error } = await client.auth.signInWithOtp({ email: addr, options: { emailRedirectTo, shouldCreateUser: true } });
      if (error) throw new Error(friendly(error));
    },
    async setPassword(password) {
      if (!client?.auth || !user) throw new Error('Primero entrá como administrador.');
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
}
