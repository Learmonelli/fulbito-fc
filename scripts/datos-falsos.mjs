// Genera un juego de datos FALSOS para probar Fulbito FC y lo guarda en datos-falsos.json.
// Se importa desde la app: 💾 → "Importar copia". Uso: npm run datos-falsos
// Usa la misma capa de datos que la app (store.js), así el archivo respeta todas sus reglas.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// La app guarda en localStorage: acá alcanza con uno en memoria.
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { store, mulberry32, playDemoMatch, playDemoFriendly } = await import('../src/store.js');
const { randomFace } = await import('../src/pmAvatar.js');

const rnd = mulberry32(2026); // siempre sale el mismo archivo

const TEAMS = [
  ['Los Cracks FC', '#1f4fbf', '#b8f03c', 'halves'], ['Deportivo Asado', '#e5484d', '#111111', 'stripes'],
  ['Atlético Fernet', '#111111', '#f2b705', 'band'], ['Real Birra', '#f2b705', '#1b3a8c', 'chevron'],
  ['Sacachispas del Barrio', '#1f9bd1', '#ffffff', 'stripes'], ['Club Choripán', '#6a2c91', '#f3ead6', 'quarters'],
  ['Juventud Unida', '#1b9e4b', '#ffffff', 'halves'], ['Los Pibes FC', '#1b3a8c', '#f3ead6', 'solid'],
  ['Sportivo Mate Cocido', '#8b4513', '#f3ead6', 'band'], ['Inter de la Esquina', '#00838f', '#111111', 'stripes'],
  ['Unión Picadito', '#f57c00', '#ffffff', 'chevron'], ['Racing de los Jueves', '#6fc0e8', '#ffffff', 'halves'],
];
const FIRST = ['Juan', 'Nacho', 'Bruno', 'Facundo', 'Luciano', 'Santiago', 'Maximiliano', 'Tomás', 'Gonzalo', 'Pablo',
  'Damián', 'Ezequiel', 'Matías', 'Nicolás', 'Rodrigo', 'Joaquín', 'Federico', 'Leandro', 'Agustín', 'Iván',
  'Emiliano', 'Franco', 'Lautaro', 'Marcos', 'Cristian', 'Diego', 'Hernán', 'Javier', 'Kevin', 'Mauro',
  'Óscar', 'Ramiro', 'Sebastián', 'Thiago', 'Valentín', 'Walter', 'Alan', 'Brian', 'Ciro', 'Dylan'];
const LAST = ['Pérez', 'Ruiz', 'Díaz', 'Gómez', 'Sosa', 'Vera', 'Paz', 'Luna', 'Ibarra', 'Núñez', 'Cruz', 'Rey', 'Ortiz',
  'Ferro', 'Sanz', 'Mena', 'Toledo', 'Ríos', 'Vidal', 'Godoy', 'Paredes', 'Medina', 'Benítez', 'Acosta', 'Molina',
  'Romero', 'Castro', 'Ledesma', 'Herrera', 'Quiroga', 'Aguirre', 'Suárez', 'Ponce', 'Silva', 'Arias', 'Correa'];
const NICKS = ['Tuti', 'Colo', 'Pancho', 'Cabezón', 'Tano', 'Rulo', 'Chino', 'Flaco', 'Gordo', 'Pelado', 'Mono', 'Ruso',
  'Negro', 'Turco', 'Loco', 'Pipa', 'Chueco', 'Toti', 'Lechuga', 'Bichi', 'Polaco', 'Facha', 'Cebolla', 'Pitu'];
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

// ---- Equipos y planteles (10 por equipo, con número y cara) ----
const teams = TEAMS.map(([name, color1, color2, pattern]) => store.addTeam(name, { color1, color2, pattern }));
const used = new Set();
for (const t of teams) {
  const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 17, 19, 21, 23].sort(() => rnd() - 0.5).slice(0, 10);
  for (const number of numbers) {
    let name;
    do { name = `${pick(FIRST)} ${pick(LAST)}`; } while (used.has(name));
    used.add(name);
    const nick = rnd() < 0.55 ? pick(NICKS).replace(/^(.)(.*)$/, (_, a, b) => a.toUpperCase() + b.toLowerCase()) : '';
    store.addPlayer(t.id, { name, nickname: nick, number, face: randomFace(rnd) });
  }
}

const ids = teams.map((t) => t.id);
const S = store.get();
const tour = (id) => S.tournaments.find((t) => t.id === id) ?? store.get().tournaments.find((t) => t.id === id);
const play = (t, m, date) => playDemoMatch(store, store.get(), t, m, rnd, date);
const weekly = (start, n) => {
  const d = new Date(`${start}T12:00:00`);
  d.setDate(d.getDate() + (n - 1) * 7);
  return d.toISOString().slice(0, 10);
};
const playRound = (t, filter, date) => tour(t.id).matches.filter(filter).forEach((m) => play(t, m, date));

// 1) Liga 2024 de 8 equipos, ida y vuelta, terminada.
const liga24 = store.createTournament('Liga Fulbito', ids.slice(0, 8), { format: 'league', season: '2024', doubleRound: true });
for (const r of new Set(tour(liga24.id).matches.map((m) => m.round))) playRound(liga24, (m) => m.round === r, weekly('2024-03-02', r));

// 2) Copa 2024 de 12 equipos (con pases directos), terminada con 3.er puesto.
const copa24 = store.createTournament('Copa Invierno', ids, { format: 'cup', season: '2024', thirdPlace: true, shuffle: true, rnd });
for (const r of [1, 2, 3, 4]) playRound(copa24, (m) => m.stage === 'ko' && m.round === r && !m.bye, weekly('2024-07-06', r));

// 3) Mundialito 2025: 4 grupos de 3, pasan 2 por grupo (cuartos), terminado.
const mundial = store.createTournament('Mundialito', ids, { format: 'groups', season: '2025', groups: 4, advance: 2, thirdPlace: true, shuffle: true, rnd });
for (const r of new Set(tour(mundial.id).matches.map((m) => m.round))) playRound(mundial, (m) => m.stage !== 'ko' && m.round === r, weekly('2025-02-01', r));
store.startPlayoffs(mundial.id);
for (const r of [1, 2, 3]) playRound(mundial, (m) => m.stage === 'ko' && m.round === r, weekly('2025-03-01', r));

// 4) Apertura 2025 de 12 equipos: liga + cuadro (semis), terminado.
const ap25 = store.createTournament('Torneo Apertura', ids, { format: 'league_cup', season: '2025', advance: 4 });
for (const r of new Set(tour(ap25.id).matches.map((m) => m.round))) playRound(ap25, (m) => m.stage !== 'ko' && m.round === r, weekly('2025-04-05', r));
store.startPlayoffs(ap25.id);
for (const r of [1, 2]) playRound(ap25, (m) => m.stage === 'ko' && m.round === r, weekly('2025-07-05', r));

// 5) Clausura 2026 de 12 equipos: liga + cuadro (cuartos), EN JUEGO (fecha 7 de 11 a medio jugar).
const cl26 = store.createTournament('Torneo Clausura', ids, { format: 'league_cup', season: '2026', advance: 8 });
for (let r = 1; r <= 6; r++) playRound(cl26, (m) => m.round === r, weekly('2026-08-01', r));
tour(cl26.id).matches.filter((m) => m.round === 7).slice(0, 3).forEach((m) => play(cl26, m, weekly('2026-08-01', 7)));
for (const m of tour(cl26.id).matches.filter((x) => !x.played)) store.setMatchDate(cl26.id, m.id, weekly('2026-08-01', m.round));
store.setCurrent(cl26.id);

// 6) Amistosos internos (aparte de los campeonatos): 4 equipos, 3 o 4 cada uno, a veces con invitados.
teams.slice(0, 4).forEach((t, ti) => {
  for (let i = 0; i < 3 + (ti % 2); i++) playDemoFriendly(store, store.get(), t.id, rnd, weekly('2026-06-06', i + 1 + ti), i % 2);
});

const out = fileURLToPath(new URL('../datos-falsos.json', import.meta.url));
writeFileSync(out, store.exportJson());
const s = store.get();
const played = s.tournaments.reduce((n, t) => n + t.matches.filter((m) => m.played && !m.bye).length, 0);
console.log(`Listo: ${s.teams.length} equipos, ${s.players.length} jugadores, ${s.tournaments.length} campeonatos, ${played} partidos jugados, ${s.friendlies.length} amistosos.`);
console.log(`Archivo: ${out}`);
