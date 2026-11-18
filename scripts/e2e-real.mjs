// Prueba de punta a punta contra la base REAL de Fulbito (clave pública, sin login).
// Necesita un grupo de prueba 'test-e2e-grupo' creado con scripts/e2e-setup.sql (y borrarlo después).
// Uso:  node scripts/e2e-real.mjs
globalThis.document = { documentElement: { dataset: {} } };
const { createCloud, DEFAULT_CONFIG } = await import('../src/cloud.js');

const G = 'test-e2e-grupo';
const rejects = [];
const remote = [];
const cloud = createCloud({});
const first = await cloud.connect(DEFAULT_CONFIG, {
  leagueId: G,
  onRemote: (kind, row, id) => remote.push([kind, id, !!row]),
  onReject: (kind, id, msg) => rejects.push([kind, id, msg]),
});
const lg = cloud.league();
const out = [];
const check = (name, ok, extra = '') => { out.push(`${ok ? 'ok  ' : 'FALLA'} ${name}${extra ? ` (${extra})` : ''}`); };

check('el grupo existe y es de modo interno', lg.exists && lg.mode === 'interno', JSON.stringify(lg.settings));
check('sin login nadie es administrador', cloud.canEdit() === false);
check('se bajó el partido finalizado de prueba', first.matches.some((m) => m.id === 'mc'));

const match = (id, extra = {}) => ({
  id, date: '2099-01-01', mode: 'interno', teamAName: 'Claros', teamBName: 'Oscuros', rivalName: '',
  teamA: [], teamB: [], events: [], assists: {}, bets: {}, escabioTotal: 0, comments: [], closed: false, ...extra,
});
const rest = async (path) => (await fetch(`${DEFAULT_CONFIG.url}/rest/v1/${path}`, { headers: { apikey: DEFAULT_CONFIG.key, Authorization: `Bearer ${DEFAULT_CONFIG.key}` } })).json();
const rows = (kind, id) => rest(`fulbito_${kind}?select=id,data&league_id=eq.${G}&id=eq.${id}`);

// 1) cualquiera suma un jugador y crea un partido, y le carga un gol
cloud.adapter.upsert('players', { id: 'e1', name: 'Jugador de prueba', nickname: '', number: '', positions: [], guest: false });
cloud.adapter.upsert('matches', match('m-nuevo'));
await cloud.whenIdle();
check('suma un jugador sin login', (await rows('players', 'e1')).length === 1);
check('crea un partido sin login', (await rows('matches', 'm-nuevo')).length === 1);
cloud.adapter.upsert('matches', match('m-nuevo', { events: [{ id: 'g1', side: 'A', scorerId: null }] }));
await cloud.whenIdle();
check('carga un gol (sin autor) sin login', (await rows('matches', 'm-nuevo'))[0]?.data.events.length === 1);

// 2) no puede finalizarlo
cloud.adapter.upsert('matches', match('m-nuevo', { events: [{ id: 'g1', side: 'A', scorerId: null }], closed: true }));
await cloud.whenIdle();
check('NO puede finalizar un partido', (await rows('matches', 'm-nuevo'))[0]?.data.closed === false, rejects.map((r) => r[2]).join(' | '));

// 3) no puede crear un partido ya finalizado ni borrar
cloud.adapter.upsert('matches', match('m-cerrado', { closed: true }));
await cloud.whenIdle();
check('NO puede crear un partido ya finalizado', (await rows('matches', 'm-cerrado')).length === 0);
cloud.adapter.remove('matches', 'm-nuevo');
cloud.adapter.remove('players', 'e1');
await cloud.whenIdle();
check('NO puede borrar partidos ni jugadores', (await rows('matches', 'm-nuevo')).length === 1 && (await rows('players', 'e1')).length === 1);

// 4) partido finalizado: sí comenta, no cambia goles
const mc = first.matches.find((m) => m.id === 'mc');
cloud.adapter.upsert('matches', { ...mc, comments: [{ id: 'c1', author: 'Tuti', text: 'qué partidazo', ts: 1 }] });
await cloud.whenIdle();
check('en un partido finalizado sí puede comentar', (await rows('matches', 'mc'))[0]?.data.comments.length === 1);
cloud.adapter.upsert('matches', { ...mc, events: [{ id: 'g9', side: 'A', scorerId: null }], comments: [{ id: 'c1', author: 'Tuti', text: 'qué partidazo', ts: 1 }] });
await cloud.whenIdle();
check('en un partido finalizado NO puede cambiar goles', (await rows('matches', 'mc'))[0]?.data.events.length === 0);

// 5) no puede tocar los ajustes del grupo ni crear grupos
await cloud.updateSettings({ teamAName: 'X' }).then(() => check('NO cambia ajustes', false), () => check('NO puede cambiar los ajustes del grupo', true));
const g2 = await fetch(`${DEFAULT_CONFIG.url}/rest/v1/fulbito_state`, { method: 'POST', headers: { apikey: DEFAULT_CONFIG.key, Authorization: `Bearer ${DEFAULT_CONFIG.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'anon-intruso', data: { mode: 'interno' } }) });
check('sin login NO se puede crear un grupo', g2.status === 401 || g2.status === 403, String(g2.status));

// 6) se escribió en otra liga que no es de modo interno? (Liga FC 'main')
const intr = await fetch(`${DEFAULT_CONFIG.url}/rest/v1/fulbito_players`, { method: 'POST', headers: { apikey: DEFAULT_CONFIG.key, Authorization: `Bearer ${DEFAULT_CONFIG.key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ league_id: 'main', id: 'intruso', data: {} }) });
check('NO se puede cargar en una liga de campeonato', intr.status >= 400, String(intr.status));

console.log(out.join('\n'));
console.log(`\nrechazos avisados a la app: ${rejects.length}`);
const bad = out.filter((l) => l.startsWith('FALLA')).length;
console.log(bad ? `\n${bad} FALLAS` : '\nTODO OK');
cloud.disconnect();
process.exit(bad ? 1 : 0);
