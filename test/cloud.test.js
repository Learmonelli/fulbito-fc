// Nube por grupo con un cliente de Supabase FALSO en memoria (no toca ninguna base real).
// La base falsa aplica las mismas reglas que supabase/schema.sql + interno.sql:
//   leer: cualquiera · cargar jugadores y partidos: cualquiera (solo en grupos de modo interno)
//   finalizar, reabrir y borrar: solo el dueño y los admins del grupo · finalizado: solo comentarios
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
globalThis.document = { documentElement: { dataset: {} } }; // lo mínimo que pide theme.js (colores)

const { store } = await import('../src/store.js');
const { createCloud, checkConfig, canEditLeague } = await import('../src/cloud.js');
const { makeSession } = await import('../src/cloudSession.js');
const { parseLeagueInput, leagueIdFromUrl, ligaFcLink, slugify } = await import('../src/league.js');
const { getGroupSettings } = await import('../src/groupSettings.js');
const { getLeaguePalette } = await import('../src/theme.js');
const { scoreOf } = await import('../src/domain/domain.js');

const CFG = { url: 'https://prueba.supabase.co', key: 'sb_publishable_test' };
const OWNER = { id: 'u-own', email: 'dueno@mail.com', app_metadata: {} };
const ADMIN = { id: 'u-adm', email: 'admin@mail.com', app_metadata: {} };
const FAN = { id: 'u-fan', email: 'fan@mail.com', app_metadata: {} };
const USERS = [OWNER, ADMIN, FAN];
const G = 'los-jueves-abcd';

const player = (id, name) => ({ id, name, nickname: '', number: '', positions: [], guest: false });
const match = (id, extra = {}) => ({
  id, date: '2099-01-01', mode: 'interno', teamAName: 'Claros', teamBName: 'Oscuros', rivalName: '',
  teamA: ['p1', 'p2'], teamB: ['p3', 'p4'], events: [], assists: {}, bets: {}, escabioTotal: 0, comments: [], closed: false, ...extra,
});

function fakeDb() {
  const db = {
    user: null, listeners: [], writes: 0, fail: 0, failFetch: false, backups: [],
    state: new Map(), players: new Map(), matches: new Map(),
  };
  db.state.set(G, { id: G, name: 'Los del jueves', owner: OWNER.id, owner_email: OWNER.email, admins: [ADMIN.email], data: { mode: 'interno', settings: { teamAName: 'Claros', teamBName: 'Oscuros', palette: 'selva' } } });
  db.state.set('copa-xyz1', { id: 'copa-xyz1', name: 'Copa', owner: OWNER.id, owner_email: OWNER.email, admins: [], data: { teams: [] } });
  const isAdmin = (lid) => { const lg = db.state.get(lid); return !!(db.user && lg && (db.user.id === lg.owner || lg.admins.includes(db.user.email))); };
  const clone = (x) => structuredClone(x);
  const emit = (table, payload) => db.listeners.filter((l) => l.table === table).forEach((l) => l.cb(payload));
  const seed = (kind, lid, row) => db[kind].set(`${lid}|${row.id}`, { league_id: lid, id: row.id, data: clone(row) });
  db.seed = seed;
  db.rows = (kind, lid = G) => [...db[kind].values()].filter((r) => r.league_id === lid).map((r) => r.data);
  db.remote = (kind, lid, row) => { // otro celular cambió algo
    seed(kind, lid, row);
    emit(`fulbito_${kind}`, { eventType: 'UPDATE', new: { id: row.id, league_id: lid, data: clone(row) } });
  };
  const view = (r) => ({ id: r.id, name: r.name, owner: r.owner, owner_email: r.owner_email, admins: clone(r.admins), mode: r.data.mode ?? null, settings: clone(r.data.settings ?? null) });
  const netFail = () => { if (db.fail > 0) { db.fail--; return { error: { message: 'Failed to fetch' } }; } return null; };

  const stateApi = {
    select: () => {
      const api = {
        eq: async (c, v) => (db.failFetch ? { data: null, error: { message: 'Failed to fetch' } } : { data: [...db.state.values()].filter((r) => r[c] === v).map(view), error: null }),
        contains: async (c, arr) => ({ data: [...db.state.values()].filter((r) => arr.every((x) => r[c].includes(x))).map(view), error: null }),
      };
      return api;
    },
    insert: (obj) => ({
      select: async () => {
        if (!db.user) return { error: { message: 'permission denied for table fulbito_state' } };
        if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(obj.id)) return { error: { message: 'new row violates row-level security policy' } };
        if (db.state.has(obj.id)) return { error: { code: '23505', message: 'duplicate key value' } };
        db.state.set(obj.id, { id: obj.id, name: obj.name, owner: db.user.id, owner_email: db.user.email, admins: [], data: clone(obj.data) });
        return { data: [{ id: obj.id }], error: null };
      },
    }),
    update: (patch) => ({
      eq: (_c, id) => ({
        select: async () => {
          const row = db.state.get(id);
          if (!row || !isAdmin(id)) return { data: [], error: null }; // RLS: 0 filas, sin error
          if (patch.name) row.name = patch.name;
          if (patch.admins) row.admins = [...new Set(patch.admins)];
          if (patch.data) row.data = clone(patch.data);
          return { data: [view(row)], error: null };
        },
      }),
    }),
  };

  const rowsApi = (kind) => ({
    select: () => {
      const q = { f: [], rng: null };
      const run = () => {
        let rows = [...db[kind].values()].filter((r) => q.f.every(([c, v]) => r[c] === v)).sort((a, b) => a.id.localeCompare(b.id));
        if (q.rng) rows = rows.slice(q.rng[0], q.rng[1] + 1);
        return { data: rows.map((r) => ({ id: r.id, data: clone(r.data) })), error: null };
      };
      const api = { eq: (c, v) => { q.f.push([c, v]); return api; }, order: () => api, range: (a, b) => { q.rng = [a, b]; return api; }, then: (ok, ko) => Promise.resolve().then(run).then(ok, ko) };
      return api;
    },
    insert: (obj) => ({
      select: async () => {
        const nf = netFail(); if (nf) return nf;
        const lg = db.state.get(obj.league_id);
        if (!lg || lg.data.mode !== 'interno') return { error: { code: '42501', message: 'new row violates row-level security policy' } };
        if (db[kind].has(`${obj.league_id}|${obj.id}`)) return { error: { code: '23505', message: 'duplicate key value' } };
        if (kind === 'matches' && obj.data.closed && !isAdmin(obj.league_id)) return { error: { code: '42501', message: 'Solo un administrador de la liga puede finalizar partidos' } };
        seed(kind, obj.league_id, obj.data); db.writes++;
        emit(`fulbito_${kind}`, { eventType: 'INSERT', new: { id: obj.id, league_id: obj.league_id, data: clone(obj.data) } });
        return { data: [{ id: obj.id }], error: null };
      },
    }),
    update: (patch) => {
      const q = [];
      const api = {
        eq: (c, v) => { q.push([c, v]); return api; },
        select: async () => {
          const nf = netFail(); if (nf) return nf;
          const rows = [...db[kind].values()].filter((r) => q.every(([c, v]) => r[c] === v));
          if (!rows.length) return { data: [], error: null };
          const r = rows[0];
          if (kind === 'matches' && !isAdmin(r.league_id)) {
            if (r.data.closed) {
              const strip = (d) => { const c = clone(d); delete c.comments; return JSON.stringify(c); };
              if (strip(patch.data) !== strip(r.data)) return { error: { code: '42501', message: 'El partido está finalizado: solo se pueden agregar comentarios' } };
            } else if (patch.data.closed) return { error: { code: '42501', message: 'Solo un administrador de la liga puede finalizar partidos' } };
          }
          r.data = clone(patch.data); db.writes++;
          emit(`fulbito_${kind}`, { eventType: 'UPDATE', new: { id: r.id, league_id: r.league_id, data: clone(r.data) } });
          return { data: [{ id: r.id }], error: null };
        },
      };
      return api;
    },
    delete: () => {
      const q = [];
      const api = {
        eq: (c, v) => { q.push([c, v]); return api; },
        select: async () => {
          const rows = [...db[kind].values()].filter((r) => q.every(([c, v]) => r[c] === v));
          if (!rows.length || !isAdmin(rows[0].league_id)) return { data: [], error: null }; // RLS: no borra y no da error
          db[kind].delete(`${rows[0].league_id}|${rows[0].id}`); db.writes++;
          return { data: [{ id: rows[0].id }], error: null };
        },
      };
      return api;
    },
  });

  const backupsApi = {
    select: () => {
      const q = { f: [] };
      const api = { eq: (c, v) => { q.f.push([c, v]); return api; }, order: () => api,
        limit: async () => ({ data: db.backups.filter((b) => q.f.every(([c, v]) => b[c] === v) && isAdmin(b.league_id)).map((b) => ({ id: b.id, kind: b.kind, created_at: b.created_at })), error: null }) };
      return api;
    },
    insert: async (obj) => {
      if (!isAdmin(obj.league_id) || obj.kind !== 'manual') return { error: { code: '42501', message: 'new row violates row-level security policy' } };
      db.backups.push({ id: db.backups.length + 1, created_at: new Date().toISOString(), ...clone(obj) });
      return { error: null };
    },
  };

  db.client = {
    auth: {
      getSession: async () => ({ data: { session: db.user ? { user: db.user } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async ({ email, password }) => {
        const u = USERS.find((x) => x.email === email);
        if (!u || password !== 'secreta123') return { data: {}, error: { message: 'Invalid login credentials' } };
        db.user = u; return { data: { session: { user: u } }, error: null };
      },
      signOut: async () => { db.user = null; },
    },
    from: (t) => (t === 'fulbito_state' ? stateApi : t === 'fulbito_backups' ? backupsApi : rowsApi(t === 'fulbito_players' ? 'players' : 'matches')),
    rpc: async (name, args) => {
      if (name !== 'fulbito_restore_interno') return { error: { message: 'no existe' } };
      if (!isAdmin(args.p_league)) return { error: { code: '42501', message: 'Solo los administradores de la liga pueden restaurar copias' } };
      for (const kind of ['players', 'matches']) for (const k of [...db[kind].keys()]) if (k.startsWith(`${args.p_league}|`)) db[kind].delete(k);
      args.p_players.forEach((r) => seed('players', args.p_league, r));
      args.p_matches.forEach((r) => seed('matches', args.p_league, r));
      return { error: null };
    },
    channel: () => {
      const ch = { on: (_e, f, cb) => { db.listeners.push({ table: f.table, cb }); return ch; }, subscribe: (cb) => { cb?.('SUBSCRIBED'); return ch; } };
      return ch;
    },
    removeChannel() { db.listeners.length = 0; },
  };
  db.seedGroup = () => {
    ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => seed('players', G, player(id, `Jugador ${i + 1}`)));
    seed('matches', G, match('m1'));
  };
  return db;
}

const noTimers = { setTimeout: () => 0, clearTimeout() {} };
const notes = [];
function setup(db, leagueId = G) {
  const cloud = createCloud({ createClient: () => db.client, timers: noTimers });
  const gone = [];
  const session = makeSession({ cloud, notify: (m) => notes.push(m), leagueId, config: CFG, goto: (u) => gone.push(u) });
  return { cloud, session, gone };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { store.detachSync(); store.clearAll(); mem.clear(); notes.length = 0; });

test('config y links: rechaza la clave secreta, entiende links y códigos de grupo', () => {
  assert.equal(checkConfig({ url: 'https://abc.supabase.co/rest/v1/', key: 'sb_publishable_x' }).url, 'https://abc.supabase.co');
  assert.match(checkConfig({ url: 'https://abc.supabase.co', key: 'sb_secret_x' }).error, /SECRETA/);
  assert.equal(parseLeagueInput('https://learmonelli.github.io/fulbito-fc/?liga=los-jueves-abcd'), 'los-jueves-abcd');
  assert.equal(parseLeagueInput('  Los-Jueves-ABCD '), 'los-jueves-abcd');
  assert.equal(parseLeagueInput('hola que tal'), null);
  assert.equal(leagueIdFromUrl({ search: '?liga=los-jueves-abcd' }), 'los-jueves-abcd');
  assert.equal(leagueIdFromUrl({ search: '?liga=<script>' }), null);
  assert.equal(leagueIdFromUrl({ search: '' }), null);
  assert.equal(ligaFcLink('copa-xyz1'), 'https://learmonelli.github.io/liga-fc/?liga=copa-xyz1');
  assert.equal(ligaFcLink('main'), 'https://learmonelli.github.io/liga-fc/');
  assert.match(slugify('Los del Jueves', () => 0), /^los-del-jueves-[a-z0-9]{4}$/);
});

test('quién administra: el dueño y los emails de admins (sin importar mayúsculas)', () => {
  const lg = { exists: true, owner: OWNER.id, admins: [ADMIN.email] };
  assert.equal(canEditLeague(OWNER, lg), true);
  assert.equal(canEditLeague({ id: 'x', email: 'ADMIN@mail.com' }, lg), true);
  assert.equal(canEditLeague(FAN, lg), false);
  assert.equal(canEditLeague(null, lg), false);
  assert.equal(canEditLeague(OWNER, { exists: false }), false);
});

test('abrir un grupo: baja jugadores, partidos y ajustes; sin login nadie es administrador', async () => {
  const db = fakeDb(); db.seedGroup();
  const { session } = setup(db);
  assert.equal(await session.start(), 'ok');
  assert.equal(store.get().players.length, 4);
  assert.equal(store.get().matches.length, 1);
  assert.deepEqual([getGroupSettings().teamAName, getGroupSettings().teamBName], ['Claros', 'Oscuros']);
  assert.equal(getLeaguePalette(), 'selva', 'los colores del grupo llegan con los datos');
  assert.equal(store.isSynced(), true);
  assert.equal(store.canAdmin(), false);
});

test('cualquiera (sin login) crea partidos y carga goles; cada cambio manda solo su fila', async () => {
  const db = fakeDb(); db.seedGroup();
  const { session, cloud } = setup(db);
  await session.start();
  const m = store.createMatch({ date: '2099-02-02', teamAName: 'Claros', teamBName: 'Oscuros' });
  await cloud.whenIdle();
  assert.equal(db.rows('matches').length, 2, 'el partido nuevo se creó en la nube');
  store.setTeamSide(m.id, 'p1', 'A'); store.setTeamSide(m.id, 'p3', 'B');
  assert.ok(store.addGoal(m.id, 'A', 'p1'));
  assert.ok(store.addUnknownGoal(m.id, 'B'), 'también un gol sin autor');
  await cloud.whenIdle();
  const row = db.rows('matches').find((r) => r.id === m.id);
  assert.equal(scoreOf(row, 'A'), 1);
  assert.equal(scoreOf(row, 'B'), 1);
  assert.equal(db.rows('matches').find((r) => r.id === 'm1').events.length, 0, 'el otro partido no se tocó');
  const p = store.addPlayer({ name: 'Nuevo Jugador' });
  await cloud.whenIdle();
  assert.ok(db.rows('players').some((r) => r.id === p.id), 'sumar un jugador también va a la nube');
});

test('quien no es administrador no puede finalizar: el store lo frena y la base también', async () => {
  const db = fakeDb(); db.seedGroup();
  const { session, cloud } = setup(db);
  await session.start();
  assert.equal(store.closeMatch('m1'), false);
  assert.equal(store.reopenMatch('m1'), false);
  assert.equal(store.deleteMatch('m1'), false);
  // Aunque alguien se saltee la pantalla, la base lo rechaza, se avisa y el partido vuelve a como estaba.
  cloud.adapter.upsert('matches', match('m1', { closed: true }));
  await cloud.whenIdle();
  assert.equal(db.rows('matches')[0].closed, false);
  assert.ok(notes.some((n) => /administrador/i.test(n)), `avisa: ${notes.join(' | ')}`);
  assert.equal(store.match('m1').closed, false, 'la pantalla vuelve a lo que de verdad quedó guardado');
});

test('el dueño finaliza y reabre; los admins invitados también', async () => {
  for (const who of [OWNER, ADMIN]) {
    store.detachSync();
    const db = fakeDb(); db.seedGroup(); db.user = who;
    const { session, cloud } = setup(db);
    await session.start();
    assert.equal(store.canAdmin(), true, `${who.email} es admin`);
    assert.equal(store.closeMatch('m1'), true);
    await cloud.whenIdle();
    assert.equal(db.rows('matches')[0].closed, true);
    assert.equal(store.reopenMatch('m1'), true);
    await cloud.whenIdle();
    assert.equal(db.rows('matches')[0].closed, false);
  }
});

test('partido finalizado: cualquiera puede comentar, pero no cambiar goles', async () => {
  const db = fakeDb(); db.seedGroup(); db.seed('matches', G, match('m1', { closed: true }));
  const { session, cloud } = setup(db);
  await session.start();
  assert.equal(store.addComment('m1', 'Tuti', 'Qué partidazo'), true);
  await cloud.whenIdle();
  const row = db.rows('matches')[0];
  assert.equal(row.comments.length, 1);
  assert.equal(row.closed, true, 'sigue finalizado');
  assert.equal(notes.length, 0, 'sin avisos de rechazo');
  // Un gol en un partido finalizado: la base lo rechaza y la pantalla vuelve atrás.
  cloud.adapter.upsert('matches', { ...store.match('m1'), events: [{ id: 'e1', side: 'A', scorerId: 'p1' }] });
  await cloud.whenIdle();
  assert.equal(db.rows('matches')[0].events.length, 0);
  assert.ok(notes.some((n) => /finalizado/i.test(n)));
});

test('borrar sin ser administrador: la base no borra, se avisa y el partido vuelve', async () => {
  const db = fakeDb(); db.seedGroup();
  const { session, cloud } = setup(db);
  await session.start();
  cloud.adapter.remove('matches', 'm1');
  await cloud.whenIdle();
  assert.equal(db.rows('matches').length, 1);
  assert.ok(notes.some((n) => /administrador/i.test(n)));
});

test('cambios de otro celular llegan en vivo y no se reenvían (sin eco)', async () => {
  const db = fakeDb(); db.seedGroup();
  const { session, cloud } = setup(db);
  await session.start();
  const before = db.writes;
  db.remote('matches', G, match('m1', { events: [{ id: 'e1', side: 'A', scorerId: 'p1' }] }));
  db.remote('players', G, player('p9', 'Llegó de otro celular'));
  await cloud.whenIdle();
  assert.equal(scoreOf(store.match('m1'), 'A'), 1);
  assert.ok(store.get().players.some((p) => p.id === 'p9'));
  assert.equal(db.writes, before, 'lo que llega de otro celular no se reenvía a la nube');
});

test('si falla la red, el cambio queda en cola y se manda al reintentar', async () => {
  const db = fakeDb(); db.seedGroup();
  const { session, cloud } = setup(db);
  await session.start();
  db.fail = 1;
  assert.ok(store.addUnknownGoal('m1', 'A'));
  await cloud.whenIdle();
  assert.equal(cloud.status(), 'error');
  assert.equal(db.rows('matches')[0].events.length, 0);
  await cloud.retry();
  assert.equal(cloud.status(), 'ok');
  assert.equal(db.rows('matches')[0].events.length, 1);
});

test('links que no son de este modo: campeonatos y "main" van a Liga FC; uno inexistente avisa', async () => {
  let r = setup(fakeDb(), 'copa-xyz1');
  assert.equal(await r.session.start(), 'redirect');
  assert.deepEqual(r.gone, ['https://learmonelli.github.io/liga-fc/?liga=copa-xyz1']);
  assert.equal(store.isSynced(), false);
  r = setup(fakeDb(), 'main');
  assert.equal(await r.session.start(), 'redirect');
  assert.deepEqual(r.gone, ['https://learmonelli.github.io/liga-fc/']);
  r = setup(fakeDb(), 'no-existe-1234');
  assert.equal(await r.session.start(), 'missing');
  assert.equal(r.gone.length, 0);
});

test('sin conexión al abrir: avisa y deja ver la copia guardada en el celular', async () => {
  const db = fakeDb(); db.failFetch = true;
  const { session } = setup(db);
  assert.equal(await session.start(), 'offline');
  assert.ok(notes.some((n) => /No se pudo conectar/.test(n)));
  assert.equal(store.isSynced(), false);
});

test('al abrir, el cierre automático de partidos viejos lo hace solo un administrador', async () => {
  let db = fakeDb(); db.seedGroup(); db.seed('matches', G, match('m1', { date: '2020-01-01' }));
  let r = setup(db);
  await r.session.start(); await r.cloud.whenIdle();
  assert.equal(db.rows('matches')[0].closed, false, 'sin ser admin no intenta cerrar (lo hace el servidor de madrugada)');
  assert.equal(notes.length, 0, 'y no hay avisos de rechazo');

  store.detachSync();
  db = fakeDb(); db.seedGroup(); db.seed('matches', G, match('m1', { date: '2020-01-01' })); db.user = OWNER;
  r = setup(db);
  await r.session.start(); await r.cloud.whenIdle();
  assert.equal(db.rows('matches')[0].closed, true);
});

test('crear un grupo: hace falta entrar, queda como dueño y de modo interno', async () => {
  const db = fakeDb();
  const { session, cloud } = setup(db, null);
  assert.equal(await session.start(), 'landing');
  await assert.rejects(() => cloud.createLeague('Los del martes'), /entrá con tu email/);
  await assert.rejects(() => cloud.signInWithPassword('dueno@mail.com', 'mala'), /incorrectos/);
  await cloud.signInWithPassword('dueno@mail.com', 'secreta123');
  await assert.rejects(() => cloud.createLeague('ab'), /al menos 3 letras/);
  const id = await cloud.createLeague('Los del martes', {}, () => 0);
  const row = db.state.get(id);
  assert.equal(row.owner, OWNER.id);
  assert.equal(row.data.mode, 'interno');
  assert.deepEqual([row.data.settings.teamAName, row.data.settings.teamBName], ['Claros', 'Oscuros']);
  // Un nombre repetido (mismo id sorteado) se reintenta con otro sufijo.
  let n = 0;
  const id2 = await cloud.createLeague('Los del martes', {}, () => (n++ < 4 ? 0 : 0.5));
  assert.notEqual(id2, id);
  assert.equal((await cloud.myLeagues()).length, 3, 'el grupo de siempre y los dos nuevos');
});

test('administradores y ajustes: los cambian el dueño y los admins, nadie más', async () => {
  const db = fakeDb(); db.seedGroup(); db.user = FAN;
  let r = setup(db);
  await r.session.start();
  await assert.rejects(() => r.cloud.setAdmins(['otro@mail.com']), /Solo los administradores/);
  await assert.rejects(() => r.cloud.updateSettings({ teamAName: 'X' }), /Solo los administradores/);

  store.detachSync();
  db.user = OWNER; r = setup(db);
  await r.session.start();
  await r.cloud.setAdmins(['admin@mail.com', 'Nuevo@Mail.com', 'esto no es un mail']);
  assert.deepEqual(db.state.get(G).admins, ['admin@mail.com', 'nuevo@mail.com'], 'se guardan los emails válidos, en minúscula');
  await r.cloud.updateSettings({ teamAName: 'Remeras', teamBName: 'Pecheras', palette: 'noche' });
  assert.deepEqual([getGroupSettings().teamAName, getGroupSettings().teamBName], ['Remeras', 'Pecheras']);
  assert.equal(getLeaguePalette(), 'noche');
  await r.cloud.renameLeague('Los del jueves FC');
  assert.equal(db.state.get(G).name, 'Los del jueves FC');
});

test('copias de seguridad: las ven y restauran solo los admins; restaurar reemplaza jugadores y partidos', async () => {
  const db = fakeDb(); db.seedGroup();
  let r = setup(db);
  await r.session.start();
  assert.deepEqual(await r.cloud.listBackups(), [], 'quien no es admin no ve copias');
  await assert.rejects(() => r.cloud.saveBackup({ players: [], matches: [] }), /Solo los administradores/);
  await assert.rejects(() => r.cloud.restoreBackup({ players: [], matches: [] }), /Solo los administradores/);

  store.detachSync();
  db.user = OWNER; r = setup(db);
  await r.session.start();
  await r.cloud.saveBackup(r.session.backupPayload());
  assert.equal((await r.cloud.listBackups()).length, 1);
  await r.cloud.restoreBackup({ players: [player('q1', 'Único')], matches: [] });
  assert.deepEqual(db.rows('players').map((p) => p.id), ['q1']);
  assert.equal(db.rows('matches').length, 0);
});

test('modo grupo: no se puede importar ni cargar ejemplos ni borrar todo', async () => {
  const db = fakeDb(); db.seedGroup();
  const { session } = setup(db);
  await session.start();
  assert.equal(store.importJson('{"players":[],"matches":[]}'), false);
  assert.equal(store.loadDemo(), false);
  assert.equal(store.clearAll(), false);
  assert.equal(store.get().players.length, 4);
});
