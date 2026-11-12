// Nube con un cliente de Supabase FALSO en memoria (no toca ningún proyecto real).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { store, LOCK_MSG } = await import('../src/store.js');
const { createCloud, checkConfig, isAdminUser } = await import('../src/cloud.js');
const { makeCloudSync } = await import('../src/cloudSync.js');

const CFG = { url: 'https://prueba.supabase.co', key: 'sb_publishable_test' };
const ADMIN = { id: 'u1', email: 'leandroarmonelli@gmail.com', app_metadata: {} };
const OTHER = { id: 'u2', email: 'otro@mail.com', app_metadata: {} };

// Base falsa: una fila, RLS como en schema.sql (solo el admin escribe) y Realtime.
function fakeSupabase({ row = null, session = null } = {}) {
  const db = { row, writes: 0, listeners: [], user: session };
  db.client = {
    auth: {
      getSession: async () => ({ data: { session: db.user ? { user: db.user } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async ({ email, password }) => (password === 'secreta123'
        ? (db.user = email === ADMIN.email ? ADMIN : OTHER, { data: { session: { user: db.user } }, error: null })
        : { data: {}, error: { message: 'Invalid login credentials' } }),
      signOut: async () => { db.user = null; },
    },
    from: () => ({
      select: () => ({ eq: async () => ({ data: db.row ? [{ data: db.row }] : [], error: null }) }),
      upsert: async ({ data }) => {
        if (!isAdminUser(db.user)) return { error: { message: 'new row violates row-level security policy' } };
        db.row = structuredClone(data); db.writes++;
        return { error: null };
      },
    }),
    channel: () => {
      const ch = { on: (_e, _f, cb) => { db.listeners.push(cb); return ch; }, subscribe: () => ch };
      return ch;
    },
    removeChannel() {},
  };
  // Otro celular (el admin desde otro lado) guarda: llega por Realtime.
  db.remote = (data) => { db.row = structuredClone(data); db.listeners.forEach((cb) => cb({ new: { data: db.row } })); };
  return db;
}
const now = { setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {} }; // sin esperas

beforeEach(() => { store.setLocked(false); store.clearAll(); });

test('config: solo URL de supabase y claves publicables (nunca la secreta)', () => {
  assert.equal(checkConfig({ url: 'https://abc.supabase.co/rest/v1/', key: 'sb_publishable_x' }).url, 'https://abc.supabase.co');
  assert.match(checkConfig({ url: 'https://abc.supabase.co', key: 'sb_secret_x' }).error, /SECRETA/);
  assert.match(checkConfig({ url: 'http://evil.com', key: 'sb_publishable_x' }).error, /supabase\.co/);
  assert.equal(checkConfig({ url: '', key: '' }).ok, false);
});

test('sin proyecto configurado: la app sigue local y se puede editar', async () => {
  const sync = makeCloudSync({ config: { url: '', key: '' } });
  assert.equal(await sync.start(), false);
  assert.equal(store.isLocked(), false);
  assert.ok(store.addTeam('Local FC'));
});

test('visitante: baja los datos de la nube, queda en solo lectura y ve los cambios en vivo', async () => {
  // Datos "del admin" ya publicados.
  store.loadDemo();
  const published = store.snapshot();
  store.clearAll();
  const db = fakeSupabase({ row: published });
  const sync = makeCloudSync({ cloud: createCloud({ createClient: () => db.client, timers: now }), config: CFG });
  assert.equal(await sync.start(), true);
  assert.equal(store.get().teams.length, 8, 'bajó los datos');
  assert.equal(store.isLocked(), true, 'no es admin: solo lectura');
  assert.equal(store.addTeam('Intruso'), null);
  const m = store.current().matches.find((x) => !x.played && x.homeId && x.awayId);
  assert.equal(store.saveMatch(store.current().id, m.id, { homeGoals: 9, awayGoals: 0 }), LOCK_MSG);
  assert.equal(db.writes, 0, 'nunca intentó escribir');
  // El admin carga algo desde otro lado: llega en vivo.
  const next = structuredClone(published);
  next.teams[0].name = 'Los Cracks Campeones';
  db.remote(next);
  assert.equal(store.get().teams[0].name, 'Los Cracks Campeones');
  // Elegir campeonato sí se puede (es solo para mirar).
  assert.equal(store.setCurrent(store.get().tournaments[0].id), true);
});

test('admin: entra, sus cambios se suben y la nube vacía se puede publicar', async () => {
  const db = fakeSupabase();
  const cloud = createCloud({ createClient: () => db.client, timers: now });
  const sync = makeCloudSync({ cloud, config: CFG });
  store.setLocked(false);
  store.loadDemo(); // datos de este navegador
  await sync.start();
  assert.equal(sync.remoteEmpty(), true);
  assert.equal(store.isLocked(), true, 'antes de entrar, solo lectura');
  await assert.rejects(cloud.signInWithPassword(ADMIN.email, 'mal'), /incorrectos/);
  await cloud.signInWithPassword(ADMIN.email, 'secreta123');
  assert.equal(store.isLocked(), false, 'el admin edita');
  await sync.publishLocal();
  assert.equal(db.row.teams.length, 8);
  assert.equal(sync.remoteEmpty(), false);
  // Un cambio local del admin se sube solo.
  store.addTeam('Nuevo FC');
  await cloud.flushNow();
  assert.ok(db.row.teams.some((t) => t.name === 'Nuevo FC'));
  // Al salir vuelve a solo lectura.
  await cloud.signOut();
  assert.equal(store.isLocked(), true);
});

test('otra cuenta que no es la del admin no puede escribir', async () => {
  const db = fakeSupabase({ row: { teams: [], players: [], tournaments: [], friendlies: [] } });
  const cloud = createCloud({ createClient: () => db.client, timers: now });
  const sync = makeCloudSync({ cloud, config: CFG });
  await sync.start();
  await cloud.signInWithPassword(OTHER.email, 'secreta123');
  assert.equal(store.isLocked(), true);
  assert.equal(cloud.push(store.snapshot()), false);
  await assert.rejects(sync.publishLocal(), /Solo el administrador/);
  assert.equal(db.writes, 0);
});
