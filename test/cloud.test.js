// Nube y ligas con un cliente de Supabase FALSO en memoria (no toca ningún proyecto real).
// La base falsa aplica las mismas reglas que supabase/schema.sql: leer cualquiera; crear una liga
// cualquier usuario logueado; editar solo el dueño y los admins (por email); el dueño no cambia.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { store, LOCK_MSG } = await import('../src/store.js');
const { createCloud, checkConfig, canEditLeague } = await import('../src/cloud.js');
const { makeCloudSync } = await import('../src/cloudSync.js');
const { slugify, leagueIdFromUrl, leagueLink } = await import('../src/league.js');

const CFG = { url: 'https://prueba.supabase.co', key: 'sb_publishable_test' };
const LEANDRO = { id: 'u-lea', email: 'leandroarmonelli@gmail.com', app_metadata: {} };
const ORGA = { id: 'u-orga', email: 'orga@mail.com', app_metadata: {} };
const AYUDA = { id: 'u-ayuda', email: 'ayuda@mail.com', app_metadata: {} };
const HINCHA = { id: 'u-hincha', email: 'hincha@mail.com', app_metadata: {} };
const USERS = [LEANDRO, ORGA, AYUDA, HINCHA];

function fakeSupabase() {
  const db = { rows: new Map(), user: null, listeners: [], writes: 0 };
  const can = (row) => !!db.user && (db.user.id === row.owner || row.admins.includes(db.user.email)
    || (row.id === 'main' && db.user.email === LEANDRO.email));
  const pick = (row, cols) => (cols === '*' ? { ...row } : Object.fromEntries(cols.split(',').map((c) => c.trim()).map((c) => [c, structuredClone(row[c])])));
  const emit = (row) => db.listeners.forEach((l) => { if (l.id === row.id) l.cb({ new: structuredClone(row) }); });
  const query = (filterFn = () => true) => ({ select: (cols = '*') => Promise.resolve({ data: [...db.rows.values()].filter(filterFn).map((r) => pick(r, cols)), error: null }) });
  db.client = {
    auth: {
      getSession: async () => ({ data: { session: db.user ? { user: db.user } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async ({ email, password }) => {
        const u = USERS.find((x) => x.email === email);
        if (!u || password !== 'secreta123') return { data: {}, error: { message: 'Invalid login credentials' } };
        db.user = u;
        return { data: { session: { user: u } }, error: null };
      },
      signOut: async () => { db.user = null; },
    },
    from: (table) => (table === 'fulbito_backups' ? backupsApi : leaguesApi),
  };
  // Copias: solo los admins de la liga ven y guardan (como las políticas de backups.sql).
  db.backups = [];
  const backupsApi = {
    select: () => {
      const q = { filters: [], eq(c, v) { q.filters.push([c, v]); return q; }, order() { return q; },
        limit: async (n) => {
          const rows = db.backups.filter((b) => q.filters.every(([c, v]) => b[c] === v))
            .filter((b) => { const lg = db.rows.get(b.league_id); return lg && can(lg); })
            .sort((x, y) => y.id - x.id).slice(0, n);
          return { data: rows.map((b) => ({ ...b, data: structuredClone(b.data) })), error: null };
        } };
      return q;
    },
    insert: async (obj) => {
      const lg = db.rows.get(obj.league_id);
      if (!lg || !can(lg) || obj.kind !== 'manual') return { error: { message: 'new row violates row-level security policy' } };
      db.backups.push({ id: db.backups.length + 1, created_at: new Date(Date.now() + db.backups.length).toISOString(), ...structuredClone(obj) });
      return { error: null };
    },
  };
  // El reloj del servidor (pg_cron): una copia por liga si cambió desde la última.
  db.dailyBackup = () => {
    for (const r of db.rows.values()) {
      const last = db.backups.filter((b) => b.league_id === r.id).at(-1);
      if (!last || JSON.stringify(last.data) !== JSON.stringify(r.data)) db.backups.push({ id: db.backups.length + 1, league_id: r.id, kind: 'auto', data: structuredClone(r.data), created_at: new Date().toISOString() });
    }
  };
  const leaguesApi = {
      select: (cols) => ({
        eq: async (col, v) => ({ data: [...db.rows.values()].filter((r) => r[col] === v).map((r) => pick(r, cols.replace(/\s/g, ''))), error: null }),
        contains: async (col, arr) => ({ data: [...db.rows.values()].filter((r) => arr.every((x) => r[col].includes(x))).map((r) => pick(r, cols.replace(/\s/g, ''))), error: null }),
      }),
      insert: (obj) => ({
        select: async (cols) => {
          if (!db.user) return { error: { message: 'permission denied for table fulbito_state' } };
          if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(obj.id) || (obj.id === 'main' && db.user.email !== LEANDRO.email)) return { error: { message: 'new row violates row-level security policy' } };
          if (db.rows.has(obj.id)) return { error: { code: '23505', message: 'duplicate key value' } };
          const row = { id: obj.id, name: obj.name || 'Fulbito FC', data: structuredClone(obj.data), owner: db.user.id, owner_email: db.user.email, admins: [] };
          db.rows.set(row.id, row); db.writes++;
          return { data: [pick(row, cols.replace(/\s/g, ''))], error: null };
        },
      }),
      update: (patch) => ({
        eq: (_c, id) => ({
          select: async (cols) => {
            const row = db.rows.get(id);
            if (!row || !can(row)) return { data: [], error: null }; // RLS: 0 filas, sin error
            const { owner, owner_email, ...rest } = patch; // el trigger no deja cambiar al dueño
            Object.assign(row, structuredClone(rest));
            if (rest.admins) row.admins = [...new Set(rest.admins.map((e) => e.toLowerCase()))];
            db.writes++;
            emit(row);
            return { data: [pick(row, cols.replace(/\s/g, ''))], error: null };
          },
        }),
      }),
  };
  Object.assign(db.client, {
    channel: (name) => {
      const id = name.replace('fulbito-', '');
      const ch = { on: (_e, _f, cb) => { db.listeners.push({ id, cb }); return ch; }, subscribe: () => ch };
      return ch;
    },
    removeChannel() {},
  });
  db.query = query;
  return db;
}
const now = { setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} }; // sin esperas
const setup = (db, leagueId) => {
  const cloud = createCloud({ createClient: () => db.client, timers: now });
  return { cloud, sync: makeCloudSync({ cloud, config: CFG, leagueId }) };
};

beforeEach(() => { store.setLocked(false); store.clearAll(); });

test('config y links de liga', () => {
  assert.equal(checkConfig({ url: 'https://abc.supabase.co/rest/v1/', key: 'sb_publishable_x' }).url, 'https://abc.supabase.co');
  assert.match(checkConfig({ url: 'https://abc.supabase.co', key: 'sb_secret_x' }).error, /SECRETA/);
  assert.equal(leagueIdFromUrl({ search: '?liga=los-jueves-ab12' }), 'los-jueves-ab12');
  assert.equal(leagueIdFromUrl({ search: '?liga=<script>' }), 'main', 'ids raros: liga original');
  assert.equal(leagueIdFromUrl({ search: '' }), 'main');
  assert.match(slugify('Liga de los Jueves', () => 0.1), /^liga-de-los-jueves-[a-z0-9]{4}$/);
  assert.match(slugify('¡¡!!', () => 0.5), /^liga-[a-z0-9]{4}$/);
  assert.equal(leagueLink('x-123', { origin: 'https://a.io', pathname: '/fulbito-fc/' }), 'https://a.io/fulbito-fc/?liga=x-123');
  assert.equal(leagueLink('main', { origin: 'https://a.io', pathname: '/fulbito-fc/' }), 'https://a.io/fulbito-fc/');
});

test('liga original: solo Leandro la carga; el resto mira en vivo', async () => {
  const db = fakeSupabase();
  const { cloud, sync } = setup(db, 'main');
  store.loadDemo();
  await sync.start();
  assert.equal(sync.remoteEmpty(), true);
  assert.equal(store.isLocked(), true, 'sin entrar: solo lectura');
  await cloud.signInWithPassword(LEANDRO.email, 'secreta123');
  assert.equal(store.isLocked(), false);
  await sync.publishLocal();
  assert.equal(db.rows.get('main').data.teams.length, 8);
  store.addTeam('Nuevo FC');
  await cloud.flushNow();
  assert.ok(db.rows.get('main').data.teams.some((t) => t.name === 'Nuevo FC'));
  // Otro usuario logueado no puede cargar la liga original.
  await cloud.signOut();
  await cloud.signInWithPassword(ORGA.email, 'secreta123');
  assert.equal(store.isLocked(), true);
  assert.equal(store.addTeam('Intruso'), null);
});

test('otro organizador crea su liga, suma admins y sus jugadores miran', async () => {
  const db = fakeSupabase();
  // 1) El organizador entra (en la liga original no es admin) y crea su liga.
  const a = setup(db, 'main');
  await a.sync.start();
  await a.cloud.signInWithPassword(ORGA.email, 'secreta123');
  assert.equal(a.cloud.canEdit(), false);
  await assert.rejects(a.sync.createLeague('ab'), /3 letras/);
  const id = await a.sync.createLeague('Liga de los Jueves');
  assert.equal(db.rows.get(id).owner, ORGA.id);
  assert.deepEqual(await a.cloud.myLeagues(), [{ id, name: 'Liga de los Jueves', role: 'dueño' }]);

  // 2) Abre el link de su liga: arranca vacía y él la carga.
  store.clearAll();
  const b = setup(db, id);
  await b.sync.start();
  assert.equal(b.sync.missing(), false);
  assert.equal(store.get().teams.length, 0);
  assert.equal(store.isLocked(), false, 'el dueño edita');
  assert.ok(store.addTeam('Los Pibes'));
  await b.cloud.flushNow();
  assert.equal(db.rows.get(id).data.teams[0].name, 'Los Pibes');

  // 3) Suma a un ayudante como admin.
  await assert.rejects(b.cloud.setAdmins(['no-es-un-mail']).then((l) => { if (!l.length) throw new Error('vacía'); }), /vacía/);
  assert.deepEqual(await b.cloud.setAdmins(['Ayuda@Mail.com']), ['ayuda@mail.com']);
  await b.cloud.signOut();
  assert.equal(store.isLocked(), true, 'sin sesión: solo lectura');

  // 4) El ayudante entra y también carga; puede sumar a otro admin.
  await b.cloud.signInWithPassword(AYUDA.email, 'secreta123');
  assert.equal(store.isLocked(), false);
  assert.ok(store.addTeam('Atlético Jueves'));
  await b.cloud.flushNow();
  assert.equal(db.rows.get(id).data.teams.length, 2);
  assert.deepEqual((await b.cloud.myLeagues()).map((l) => l.role), ['admin']);
  await b.cloud.setAdmins(['ayuda@mail.com', 'hincha@mail.com']);
  await b.cloud.setAdmins(['ayuda@mail.com']); // y lo saca
  assert.equal(db.rows.get(id).owner, ORGA.id, 'el dueño no cambia nunca');

  // 5) Un jugador (sin cuenta) mira y ve en vivo; no puede cargar.
  await b.cloud.signOut();
  assert.equal(store.isLocked(), true);
  const m = store.saveMatch('x', 'y', {});
  assert.equal(m, LOCK_MSG);
  // 6) Otro usuario cualquiera no puede escribir esta liga aunque lo intente.
  await b.cloud.signInWithPassword(HINCHA.email, 'secreta123');
  assert.equal(b.cloud.push(store.snapshot()), false);
  await assert.rejects(b.cloud.setAdmins(['hincha@mail.com']), /Solo los administradores/);
});

test('link a una liga que no existe: se avisa y nadie edita', async () => {
  const db = fakeSupabase();
  const { sync, cloud } = setup(db, 'no-existe-1234');
  await sync.start();
  assert.equal(sync.missing(), true);
  await cloud.signInWithPassword(ORGA.email, 'secreta123');
  assert.equal(store.isLocked(), true);
  assert.equal(canEditLeague(ORGA, cloud.league()), false);
});

test('copias de seguridad: diarias del servidor, a mano, y solo para los admins de la liga', async () => {
  const db = fakeSupabase();
  const { cloud, sync } = setup(db, 'main');
  store.loadDemo();
  await sync.start();
  await cloud.signInWithPassword(LEANDRO.email, 'secreta123');
  await sync.publishLocal();
  // El servidor guarda la copia diaria; si no hubo cambios, no repite.
  db.dailyBackup(); db.dailyBackup();
  let list = await cloud.listBackups();
  assert.equal(list.length, 1);
  assert.equal(list[0].kind, 'auto');
  // Un cambio, una copia a mano y restaurar la de antes.
  store.addTeam('Equipo Nuevo');
  await cloud.flushNow();
  await cloud.saveBackup(store.snapshot());
  list = await cloud.listBackups();
  assert.deepEqual(list.map((b) => b.kind), ['manual', 'auto']);
  const old = await cloud.getBackup(list.at(-1).id);
  assert.equal(old.teams.length, 8, 'la automática es de antes del cambio');
  assert.equal(store.importJson(JSON.stringify(old)), true);
  await cloud.flushNow();
  assert.equal(db.rows.get('main').data.teams.length, 8, 'restaurada en la nube');
  // Otro usuario no ve ni guarda copias de esta liga.
  await cloud.signOut();
  await cloud.signInWithPassword(HINCHA.email, 'secreta123');
  assert.deepEqual(await cloud.listBackups(), []);
  await assert.rejects(cloud.saveBackup({}), /Solo los administradores/);
  await assert.rejects(cloud.getBackup(1), /Solo los administradores/);
});
