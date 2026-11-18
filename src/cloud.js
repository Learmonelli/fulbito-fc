// Nube de Fulbito FC (Supabase), por grupo.
// Un grupo es una fila de public.fulbito_state (su nombre, su dueño, sus administradores y sus ajustes);
// sus jugadores y partidos son filas de public.fulbito_players y public.fulbito_matches con su league_id.
// Permisos (los exige la base, ver supabase/interno.sql): cualquiera lee y carga jugadores y partidos;
// solo el dueño y los admins del grupo finalizan, reabren y borran.
// Solo claves PUBLICABLES (sb_publishable_... o la anon): nunca la secret / service_role.
import { createClient as realCreateClient } from '@supabase/supabase-js';
import { slugify, cleanEmail, isEmail } from './league.js';

// Proyecto de Supabase de Fulbito FC y Liga FC (el mismo; cada app usa sus propias tablas y grupos).
export const DEFAULT_CONFIG = {
  url: 'https://gzrmlghresdarqeaonir.supabase.co',
  key: 'sb_publishable_-2mCf7RHOPVwNwzWbx7r1Q_80PJz3OL',
};
export const GROUP_MODE = 'interno';
const TABLE = { players: 'fulbito_players', matches: 'fulbito_matches' };
const LEAGUE_COLS = 'id, name, owner, owner_email, admins, mode:data->>mode, settings:data->settings';

// ¿Este usuario puede finalizar, reabrir y borrar en este grupo? (mismo criterio que fulbito_can_edit en SQL)
export function canEditLeague(user, league) {
  if (!user || !league?.exists) return false;
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
  if (/relation .* does not exist|fulbito_(state|players|matches)/i.test(msg) && /does not exist/i.test(msg)) return 'Faltan las tablas: corré supabase/schema.sql e interno.sql en el proyecto.';
  if (/finalizado/i.test(msg)) return 'El partido está finalizado: solo un administrador del grupo puede cambiarlo.';
  if (/Solo un administrador/i.test(msg)) return 'Solo un administrador del grupo puede hacer eso.';
  if (/row-level security|permission denied|violates/i.test(msg)) return 'La nube no dejó guardar: revisá que estés en un grupo válido.';
  if (/invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/email not confirmed/i.test(msg)) return 'Primero confirmá tu email con el link que te llegó.';
  if (/rate limit|too many/i.test(msg)) return 'Se mandaron muchos mails seguidos: esperá un rato o entrá con tu contraseña.';
  if (/20 administradores/i.test(msg)) return 'Como mucho 20 administradores por grupo.';
  if (/máximo de filas/i.test(msg)) return 'Este grupo llegó al máximo de jugadores o partidos.';
  return msg || 'Error desconocido.';
};
const isRejection = (e) => ['42501', 'PGRST301', '401', '403'].includes(String(e?.code || e?.status || ''))
  || /row-level security|permission denied|finalizado|administrador/i.test(String(e?.message || ''));
const isDuplicate = (e) => /duplicate|23505|already exists/i.test(`${e?.code} ${e?.message}`);
const isBadToken = (e) => /JWT|PGRST30/i.test(`${e?.code} ${e?.message}`);

export function createCloud({ createClient = realCreateClient, timers = globalThis } = {}) {
  let client = null; let channel = null; let user = null; let groupId = null;
  let league = null; // { id, name, owner, ownerEmail, admins, mode, settings, exists }
  let status = 'off'; let detail = '';
  const queue = new Map(); // `${tipo}:${id}` -> { kind, op, row | id }
  const known = new Set(); // filas que ya están en la nube (para saber si se crean o se actualizan)
  let running = null; let retryTimer = null; let retryDelay = 2000; let liveDown = false;
  const statusFns = new Set(); const authFns = new Set(); const leagueFns = new Set();
  let onRemote = () => {}; let onReject = () => {};

  const setStatus = (s, d = '') => { status = s; detail = d; statusFns.forEach((fn) => fn(s, d)); };
  const setUser = (u) => { user = u ?? null; authFns.forEach((fn) => fn(user)); };
  const setLeague = (row, id) => {
    league = row
      ? {
        id: row.id, name: row.name || 'Mi grupo', owner: row.owner ?? null, ownerEmail: row.owner_email ?? '',
        admins: row.admins ?? [], mode: row.mode ?? row.data?.mode ?? null, settings: row.settings ?? row.data?.settings ?? {}, exists: true,
      }
      : { id, name: 'Mi grupo', owner: null, ownerEmail: '', admins: [], mode: null, settings: {}, exists: false };
    leagueFns.forEach((fn) => fn(league));
  };

  async function fetchAll(kind) {
    const out = []; const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await client.from(TABLE[kind]).select('id, data').eq('league_id', groupId).order('id').range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of data || []) { out.push({ ...(r.data || {}), id: r.id }); known.add(`${kind}:${r.id}`); }
      if (!data || data.length < PAGE) break;
    }
    return out;
  }

  async function refetchRow(kind, id) {
    const { data, error } = await client.from(TABLE[kind]).select('id, data').eq('league_id', groupId).eq('id', id);
    if (error) return;
    const row = (data || [])[0];
    if (row) known.add(`${kind}:${id}`); else known.delete(`${kind}:${id}`);
    onRemote(kind, row ? { ...(row.data || {}), id: row.id } : null, id);
  }

  // Una escritura. Se crea con insert y se actualiza con update (nunca upsert): un upsert de un partido
  // finalizado se vería como "crear un partido finalizado" y la base se lo rechazaría a quien solo comenta.
  async function write(job) {
    const table = TABLE[job.kind];
    if (job.op === 'delete') {
      const res = await client.from(table).delete().eq('league_id', groupId).eq('id', job.id).select('id');
      if (res.error) return { error: res.error };
      known.delete(`${job.kind}:${job.id}`);
      // Con RLS, un borrado no permitido no da error: simplemente no borra ninguna fila.
      return Array.isArray(res.data) && res.data.length === 0 ? { rejected: true } : {};
    }
    const { row } = job; const key = `${job.kind}:${row.id}`;
    const update = () => client.from(table).update({ data: row }).eq('league_id', groupId).eq('id', row.id).select('id');
    if (known.has(key)) {
      const u = await update();
      if (u.error) return { error: u.error };
      if (u.data?.length) return {};
      known.delete(key); // ya no está: se vuelve a crear
    }
    const ins = await client.from(table).insert({ league_id: groupId, id: row.id, data: row }).select('id');
    if (!ins.error) { known.add(key); return {}; }
    if (isDuplicate(ins.error)) { // otro celular la creó antes
      const u = await update();
      if (u.error) return { error: u.error };
      if (u.data?.length) { known.add(key); return {}; }
      return { rejected: true };
    }
    return { error: ins.error };
  }

  function scheduleRetry() {
    if (retryTimer) return;
    retryTimer = timers.setTimeout(() => { retryTimer = null; flush(); }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60000);
  }

  // Si ya hay un envío en curso, se devuelve ESE envío (así quien espera no se cuelga).
  function flush() {
    if (!client) return Promise.resolve();
    if (running) return running;
    running = runQueue().finally(() => { running = null; });
    return running;
  }

  async function runQueue() {
    while (queue.size) {
      const [key, job] = queue.entries().next().value;
      queue.delete(key); // se saca antes de enviar: un cambio más nuevo de la misma fila queda en la cola
      setStatus('saving', `${queue.size + 1} cambio(s) por guardar`);
      const res = await write(job);
      if (res.error && !isRejection(res.error)) {
        // Red u otro problema: vuelve a la cola (salvo que ya haya una versión más nueva) y se reintenta.
        if (!queue.has(key)) {
          const rest = [...queue.entries()];
          queue.clear(); queue.set(key, job); rest.forEach(([k, v]) => queue.set(k, v));
        }
        setStatus('error', friendly(res.error));
        scheduleRetry();
        return;
      }
      if (res.error || res.rejected) {
        const id = job.op === 'upsert' ? job.row.id : job.id;
        onReject(job.kind, id, job.op === 'delete'
          ? 'Solo un administrador del grupo puede borrar.'
          : res.error ? friendly(res.error) : 'La nube no dejó guardar ese cambio.');
        await refetchRow(job.kind, id); // la pantalla vuelve a mostrar lo que de verdad quedó guardado
      }
    }
    retryDelay = 2000;
    if (liveDown) setStatus('error', 'Se cortó la actualización en vivo; se reconecta sola.');
    else setStatus('ok');
  }

  const enqueue = (kind, job) => {
    const id = job.op === 'upsert' ? job.row.id : job.id;
    queue.set(`${kind}:${id}`, { kind, ...job }); // el último cambio de una fila reemplaza al anterior
    flush();
  };
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', () => { if (queue.size) flush(); });
  }

  const api = {
    status: () => status,
    detail: () => detail,
    pending: () => queue.size,
    user: () => user,
    league: () => league,
    canEdit: () => canEditLeague(user, league),
    isOwner: () => !!user && !!league?.exists && user.id === league.owner,
    onStatus(fn) { statusFns.add(fn); return () => statusFns.delete(fn); },
    onAuth(fn) { authFns.add(fn); return () => authFns.delete(fn); },
    onLeague(fn) { leagueFns.add(fn); return () => leagueFns.delete(fn); },

    // Conecta. Sin grupo (pantalla de inicio) solo prepara el login. Con grupo, baja sus datos.
    // Devuelve { players, matches } (vacíos si el grupo no existe o no es de este modo).
    async connect(cfg, { leagueId = null, onRemote: remote, onReject: reject } = {}) {
      const c = checkConfig(cfg);
      if (!c.ok) throw new Error(c.error);
      onRemote = remote || onRemote; onReject = reject || onReject;
      groupId = leagueId; known.clear();
      setStatus('connecting');
      // La sesión se guarda con una clave por proyecto (la comparte Liga FC: una sola cuenta para las dos apps).
      const ref = new URL(c.url).hostname.split('.')[0];
      client = createClient(c.url, c.key, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: `fulbito-auth-${ref}`, detectSessionInUrl: true, flowType: 'implicit' },
      });
      try {
        if (client.auth) {
          const { data } = await client.auth.getSession();
          setUser(data?.session?.user);
          client.auth.onAuthStateChange((_e, session) => setUser(session?.user));
        }
        if (!leagueId) { setLeague(null, null); setStatus('ok'); return { players: [], matches: [] }; }
        let res = await client.from('fulbito_state').select(LEAGUE_COLS).eq('id', leagueId);
        // Sesión vencida o de otro proyecto: se descarta y se sigue sin login (se puede mirar igual).
        if (res.error && isBadToken(res.error) && client.auth) {
          await client.auth.signOut({ scope: 'local' }).catch(() => {});
          setUser(null);
          res = await client.from('fulbito_state').select(LEAGUE_COLS).eq('id', leagueId);
        }
        if (res.error) throw res.error;
        const row = Array.isArray(res.data) ? res.data[0] : res.data;
        setLeague(row, leagueId);
        if (!league.exists || league.mode !== GROUP_MODE) { setStatus('ok'); return { players: [], matches: [] }; }
        const [players, matches] = await Promise.all([fetchAll('players'), fetchAll('matches')]);
        return { players, matches };
      } catch (e) {
        client = null;
        setStatus('error', friendly(e));
        throw new Error(friendly(e));
      }
    },

    // Escucha los cambios de otros celulares (jugadores, partidos y ajustes del grupo).
    listen() {
      if (!client || !groupId) return;
      channel = client.channel(`ffc-${groupId}`);
      for (const kind of ['players', 'matches']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table: TABLE[kind], filter: `league_id=eq.${groupId}` }, (p) => {
          if (p.eventType === 'DELETE') { known.delete(`${kind}:${p.old?.id}`); onRemote(kind, null, p.old?.id); }
          else if (p.new?.id) { known.add(`${kind}:${p.new.id}`); onRemote(kind, { ...(p.new.data || {}), id: p.new.id }, p.new.id); }
        });
      }
      channel.on('postgres_changes', { event: '*', schema: 'public', table: 'fulbito_state', filter: `id=eq.${groupId}` }, (p) => {
        if (p.new?.id) setLeague({ ...p.new, mode: p.new.data?.mode, settings: p.new.data?.settings }, groupId);
      });
      // Supabase reintenta solo la conexión en vivo; si se corta se avisa y cuando vuelve el indicador regresa a verde.
      channel.subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          liveDown = false;
          if (status === 'error' && !queue.size) setStatus('ok');
        } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          liveDown = true;
          if (status !== 'saving') setStatus('error', 'Se cortó la actualización en vivo; se reconecta sola.');
        }
      });
      if (status !== 'error') setStatus('ok');
    },

    // Adaptador que usa el store para mandar cambios (tipo = 'players' | 'matches').
    adapter: {
      upsert: (kind, row) => enqueue(kind, { op: 'upsert', row }),
      remove: (kind, id) => enqueue(kind, { op: 'delete', id }),
    },
    retry: () => { retryDelay = 2000; return flush(); },
    whenIdle: async () => {
      while (running || queue.size) {
        await (running || flush());
        if (status === 'error') return;
      }
    },

    // ---- Grupos ----
    // Crea un grupo nuevo: quien lo crea queda como dueño. Devuelve su id (para el link).
    async createLeague(name, settings = {}, rnd = Math.random) {
      if (!client) throw new Error('La nube no está conectada.');
      if (!user) throw new Error('Primero entrá con tu email.');
      const n = String(name ?? '').trim().slice(0, 60);
      if (n.length < 3) throw new Error('Poné un nombre de al menos 3 letras.');
      const data = { mode: GROUP_MODE, settings: { teamAName: 'Claros', teamBName: 'Oscuros', palette: 'clasico', ...settings } };
      for (let i = 0; i < 4; i++) {
        const id = slugify(n, rnd);
        const { error } = await client.from('fulbito_state').insert({ id, name: n, data }).select('id');
        if (!error) return id;
        if (!isDuplicate(error)) throw new Error(friendly(error));
      }
      throw new Error('No se pudo crear el grupo. Probá con otro nombre.');
    },
    // Grupos donde el usuario es dueño o administrador.
    async myLeagues() {
      if (!client || !user) return [];
      const email = cleanEmail(user.email);
      const cols = 'id, name, owner, mode:data->>mode';
      const [own, adm] = await Promise.all([
        client.from('fulbito_state').select(cols).eq('owner', user.id),
        email ? client.from('fulbito_state').select(cols).contains('admins', [email]) : { data: [] },
      ]);
      const seen = new Set();
      return [...(own.data || []), ...(adm.data || [])]
        .filter((l) => l.mode === GROUP_MODE && !seen.has(l.id) && seen.add(l.id))
        .map((l) => ({ id: l.id, name: l.name, role: l.owner === user.id ? 'dueño' : 'admin' }));
    },
    // Cambia la lista de administradores (por email). Lo puede hacer el dueño o cualquier admin.
    async setAdmins(emails) {
      if (!client || !league?.exists) throw new Error('El grupo todavía no está en la nube.');
      if (!api.canEdit()) throw new Error('Solo los administradores del grupo pueden cambiar eso.');
      const list = [...new Set((emails || []).map(cleanEmail).filter(isEmail))].filter((e) => e !== league.ownerEmail);
      if (list.length > 20) throw new Error('Como mucho 20 administradores por grupo.');
      const { data, error } = await client.from('fulbito_state').update({ admins: list }).eq('id', league.id).select(LEAGUE_COLS);
      if (error) throw new Error(friendly(error));
      if (!(data || []).length) throw new Error(friendly('row-level security'));
      setLeague(data[0], league.id);
      return league.admins;
    },
    async renameLeague(name) {
      if (!client || !league?.exists || !api.canEdit()) throw new Error('Solo los administradores pueden cambiar el nombre.');
      const n = String(name ?? '').trim().slice(0, 60);
      if (n.length < 3) throw new Error('Poné un nombre de al menos 3 letras.');
      const { data, error } = await client.from('fulbito_state').update({ name: n }).eq('id', league.id).select(LEAGUE_COLS);
      if (error) throw new Error(friendly(error));
      if (data?.[0]) setLeague(data[0], league.id);
    },
    // Nombres de los equipos y colores del grupo: los ven todos.
    async updateSettings(patch) {
      if (!client || !league?.exists || !api.canEdit()) throw new Error('Solo los administradores pueden cambiar los ajustes del grupo.');
      const settings = { ...league.settings, ...patch };
      const { data, error } = await client.from('fulbito_state').update({ data: { mode: GROUP_MODE, settings } }).eq('id', league.id).select(LEAGUE_COLS);
      if (error) throw new Error(friendly(error));
      if (!(data || []).length) throw new Error(friendly('row-level security'));
      setLeague(data[0], league.id);
      return league.settings;
    },

    // ---- Copias de seguridad (la diaria la hace el servidor; ver supabase/interno.sql) ----
    async listBackups() {
      if (!client || !league?.exists || !api.canEdit()) return [];
      const { data, error } = await client.from('fulbito_backups').select('id, kind, created_at')
        .eq('league_id', league.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw new Error(friendly(error));
      return data || [];
    },
    async getBackup(id) {
      if (!client || !api.canEdit()) throw new Error('Solo los administradores del grupo ven sus copias.');
      const { data, error } = await client.from('fulbito_backups').select('data').eq('id', id).limit(1);
      if (error) throw new Error(friendly(error));
      if (!data?.[0]) throw new Error('No se encontró esa copia.');
      return data[0].data;
    },
    async saveBackup(data) {
      if (!client || !league?.exists || !api.canEdit()) throw new Error('Solo los administradores pueden guardar copias.');
      const { error } = await client.from('fulbito_backups').insert({ league_id: league.id, kind: 'manual', data });
      if (error) throw new Error(friendly(error));
    },
    // Reemplaza los jugadores y partidos del grupo por los de una copia (solo dueño y admins).
    async restoreBackup(data) {
      if (!client || !league?.exists || !api.canEdit()) throw new Error('Solo los administradores pueden restaurar copias.');
      const { error } = await client.rpc('fulbito_restore_interno', {
        p_league: league.id, p_players: data?.players || [], p_matches: data?.matches || [],
      });
      if (error) throw new Error(friendly(error));
    },

    // ---- Cuenta ----
    async signInWithPassword(email, password) {
      if (!client?.auth) throw new Error('La nube no está conectada.');
      if (!String(email || '').trim() || !password) throw new Error('Escribí tu email y tu contraseña.');
      const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim(), password });
      if (error) throw new Error(friendly(error));
      setUser(data?.session?.user ?? data?.user);
    },
    // Link al mail: entra (y si es la primera vez, crea la cuenta). Vuelve a esta misma página.
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
      channel = null; client = null; queue.clear(); known.clear();
      if (retryTimer) { timers.clearTimeout(retryTimer); retryTimer = null; }
      setStatus('off');
    },
  };
  return api;
}
