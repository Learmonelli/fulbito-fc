// Capa de datos de Fulbito FC. Por ahora guarda en este navegador (localStorage); la interfaz
// solo usa estas funciones, así que sumar Supabase después toca este archivo y no las vistas.
import { roundRobin } from './logic/fixture.js';
import { buildBracket, buildBracketPairs, propagate } from './logic/bracket.js';
import { splitGroups, groupName, qualifiers, worldCupPairs } from './logic/groups.js';
import { standings } from './logic/standings.js';
import { sanitizeFace, randomFace } from './pmAvatar.js';
import { EVENT_TYPES, eventGoals } from './domain/stats.js';

export const FORMATS = ['league', 'cup', 'league_cup', 'groups'];
export const PATTERNS = ['solid', 'halves', 'stripes', 'band', 'chevron', 'quarters'];

const KEY = 'fulbito_fc_v1';
const HEX = /^#[0-9a-fA-F]{6}$/;
// Solo imágenes raster que la app generó (nunca SVG, que puede traer scripts).
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PALETTE = [
  ['#1f4fbf', '#b8f03c'], ['#1b3a8c', '#ffffff'], ['#1b9e4b', '#ffffff'], ['#6a2c91', '#f2b705'],
  ['#e5484d', '#111111'], ['#1f9bd1', '#ffffff'], ['#111111', '#f2b705'], ['#f3ead6', '#7d2233'],
];

const listeners = new Set();
let errorHandler = () => {};
const uid = () => crypto.randomUUID();
const clean = (s, max = 60) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const empty = () => ({ teams: [], players: [], tournaments: [], currentId: null, friendlies: [] });

function shuffled(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Normalización (datos guardados, importados o de versiones anteriores) ----
function normalizeTeam(t, i = 0) {
  const [c1, c2] = PALETTE[i % PALETTE.length];
  return {
    id: String(t.id || uid()), name: clean(t.name) || `Equipo ${i + 1}`,
    color1: HEX.test(t.color1) ? t.color1 : c1, color2: HEX.test(t.color2) ? t.color2 : c2,
    pattern: PATTERNS.includes(t.pattern) ? t.pattern : PATTERNS[i % PATTERNS.length],
    logo: typeof t.logo === 'string' && LOGO.test(t.logo) ? t.logo : '',
  };
}

const cleanNumber = (n) => {
  const v = Math.trunc(Number(n));
  return Number.isFinite(v) && v >= 0 && v <= 99 && String(n).trim() !== '' ? v : null;
};

function normalizePlayer(p) {
  return {
    id: String(p.id || uid()), teamId: String(p.teamId || ''), name: clean(p.name) || 'Jugador',
    nickname: clean(p.nickname, 30), number: cleanNumber(p.number), face: sanitizeFace(p.face),
  };
}

function normalizeMatch(m) {
  return {
    ...m,
    homeGoals: Number(m.homeGoals) || 0, awayGoals: Number(m.awayGoals) || 0,
    penHome: m.penHome ?? null, penAway: m.penAway ?? null,
    played: !!m.played, bye: !!m.bye,
    lineup: m.lineup && typeof m.lineup === 'object' ? m.lineup : {},
    events: Array.isArray(m.events) ? m.events.filter((e) => e && EVENT_TYPES.includes(e.type)) : [],
    date: typeof m.date === 'string' && DATE.test(m.date) ? m.date : '',
  };
}

function normalize(raw) {
  if (!raw || !Array.isArray(raw.teams) || !Array.isArray(raw.players) || !Array.isArray(raw.tournaments)) return null;
  const teams = raw.teams.map(normalizeTeam);
  const ids = new Set(teams.map((t) => t.id));
  const players = raw.players.map(normalizePlayer).filter((p) => ids.has(p.teamId));
  const tournaments = raw.tournaments.filter((t) => t && Array.isArray(t.matches)).map((t) => ({
    ...t, name: clean(t.name) || 'Campeonato', season: clean(t.season, 20),
    format: FORMATS.includes(t.format) ? t.format : 'league',
    teamIds: (t.teamIds || []).filter((id) => ids.has(id)), matches: t.matches.map(normalizeMatch),
  }));
  const currentId = tournaments.some((t) => t.id === raw.currentId) ? raw.currentId : tournaments.at(-1)?.id ?? null;
  const playerIds = new Set(players.map((p) => p.id));
  const friendlies = (Array.isArray(raw.friendlies) ? raw.friendlies : [])
    .filter((f) => f && ids.has(f.teamId))
    .map((f) => normalizeFriendly(f, playerIds));
  return { teams, players, tournaments, currentId, friendlies };
}

// Amistoso interno: un equipo (anfitrión) partido en dos lados; puede tener invitados de otros equipos.
// Tiene la misma forma que un partido (lineup/events), pero va aparte: no suma en tablas ni cuadros.
function normalizeFriendly(f, playerIds = null) {
  const m = normalizeMatch(f);
  const lineup = {};
  for (const [pid, side] of Object.entries(m.lineup)) {
    if ((side === 'home' || side === 'away') && (!playerIds || playerIds.has(pid))) lineup[pid] = side;
  }
  return {
    id: String(f.id || uid()), teamId: String(f.teamId), kind: 'friendly',
    homeName: clean(f.homeName, 24) || 'Claros', awayName: clean(f.awayName, 24) || 'Oscuros',
    date: m.date, homeGoals: m.homeGoals, awayGoals: m.awayGoals, played: m.played,
    lineup, events: m.events.filter((e) => lineup[e.playerId]), createdAt: f.createdAt || new Date().toISOString(),
  };
}

function load() {
  try { return normalize(JSON.parse(localStorage.getItem(KEY))) ?? empty(); } catch { return empty(); }
}

let state = load();

// Ganchos de "se guardó un cambio local" (la nube los usa para subir). fromCloud = vino de la nube:
// se guarda y se repinta, pero no se vuelve a subir.
const commitHooks = new Set();
function commit({ fromCloud = false } = {}) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {
    errorHandler('No se pudo guardar en este navegador (almacenamiento lleno o bloqueado). Probá con un escudo más liviano.');
  }
  listeners.forEach((fn) => fn(state));
  if (!fromCloud) commitHooks.forEach((fn) => fn(state));
}

const findTour = (id) => state.tournaments.find((t) => t.id === id);
const teamUsed = (teamId) => state.tournaments.some((t) => t.teamIds.includes(teamId))
  || state.friendlies.some((f) => f.teamId === teamId);
const inMatch = (m, playerId) => m.lineup?.[playerId] || (m.events || []).some((e) => e.playerId === playerId);
const playerUsed = (playerId) => state.tournaments.some((t) => t.matches.some((m) => inMatch(m, playerId)))
  || state.friendlies.some((f) => inMatch(f, playerId));

const newKoMatch = (m) => normalizeMatch({ id: uid(), stage: 'ko', lineup: {}, events: [], ...m });

// ---- Ayudas para ajustar el fixture ----
const groupStage = (t) => t.matches.filter((m) => m.stage !== 'ko');
const teamName = (id) => state.teams.find((x) => x.id === id)?.name ?? 'Un equipo';

// Motivo por el que un partido no se puede tocar ('' si se puede).
function editable(t, m) {
  if (!t || !m) return 'No se encontró el partido.';
  if (m.stage === 'ko') return 'Los cruces del cuadro no se mueven.';
  if (t.playoffsStarted) return 'La fase de liga ya está cerrada porque empezó el cuadro.';
  if (m.played) return 'Ese partido ya se jugó: reabrilo para cambiarlo.';
  return '';
}

// ¿Alguno de esos equipos ya juega en la fecha `round`? (sin contar los partidos de `ignore`).
function clash(t, round, teamIds, ignore = []) {
  const busy = groupStage(t).filter((m) => m.round === round && !ignore.includes(m.id))
    .flatMap((m) => [m.homeId, m.awayId]);
  const hit = teamIds.find((id) => busy.includes(id));
  return hit ? `${teamName(hit)} ya juega en la Fecha ${round}.` : '';
}

// Renumera las fechas sin huecos (si una quedó vacía) y actualiza los nombres.
function compactRounds(t) {
  const rounds = [...new Set(groupStage(t).map((m) => m.round))].sort((a, b) => a - b);
  const map = new Map(rounds.map((r, i) => [r, i + 1]));
  for (const m of groupStage(t)) {
    m.round = map.get(m.round);
    m.label = t.format === 'groups' ? `${t.groups[m.group]?.name ?? 'Grupo'} · Fecha ${m.round}` : `Fecha ${m.round}`;
  }
}

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  onError(fn) { errorHandler = fn; },
  current: () => findTour(state.currentId) ?? null,
  setCurrent(id) {
    if (!findTour(id) || state.currentId === id) return false;
    state.currentId = id;
    commit();
    return true;
  },

  // ---- Equipos ----
  addTeam(name, patch = {}) {
    const n = clean(name);
    if (!n) return null;
    if (state.teams.some((t) => t.name.toLowerCase() === n.toLowerCase())) return null;
    const team = normalizeTeam({ ...patch, id: uid(), name: n }, state.teams.length);
    state.teams.push(team);
    commit();
    return team;
  },

  // Cambia nombre, colores, patrón del escudo o logo subido. Valida cada campo.
  updateTeam(id, patch) {
    const t = state.teams.find((x) => x.id === id);
    if (!t) return false;
    if (patch.name !== undefined && clean(patch.name)) t.name = clean(patch.name);
    if (HEX.test(patch.color1)) t.color1 = patch.color1;
    if (HEX.test(patch.color2)) t.color2 = patch.color2;
    if (PATTERNS.includes(patch.pattern)) t.pattern = patch.pattern;
    if (patch.logo === '' || (typeof patch.logo === 'string' && LOGO.test(patch.logo))) t.logo = patch.logo;
    commit();
    return true;
  },

  // Solo si no juega ningún campeonato (para no dejar partidos sin equipo).
  deleteTeam(id) {
    if (!state.teams.some((t) => t.id === id) || teamUsed(id)) return false;
    state.teams = state.teams.filter((t) => t.id !== id);
    state.players = state.players.filter((p) => p.teamId !== id);
    commit();
    return true;
  },
  teamInUse: (id) => teamUsed(id),

  // ---- Jugadores ----
  addPlayer(teamId, { name, nickname = '', number = '', face = null } = {}) {
    const n = clean(name);
    if (!n || !state.teams.some((t) => t.id === teamId)) return null;
    const player = normalizePlayer({ id: uid(), teamId, name: n, nickname, number, face });
    state.players.push(player);
    commit();
    return player;
  },

  updatePlayer(id, patch) {
    const p = state.players.find((x) => x.id === id);
    if (!p) return false;
    if (patch.name !== undefined && clean(patch.name)) p.name = clean(patch.name);
    if (patch.nickname !== undefined) p.nickname = clean(patch.nickname, 30);
    if (patch.number !== undefined) p.number = cleanNumber(patch.number);
    if (patch.face !== undefined) p.face = sanitizeFace(patch.face);
    if (patch.teamId !== undefined && state.teams.some((t) => t.id === patch.teamId)) p.teamId = patch.teamId;
    commit();
    return true;
  },

  // Solo si nunca jugó: así no se pierden goles ya cargados.
  deletePlayer(id) {
    if (!state.players.some((p) => p.id === id) || playerUsed(id)) return false;
    state.players = state.players.filter((p) => p.id !== id);
    commit();
    return true;
  },
  playerInUse: (id) => playerUsed(id),

  // ---- Campeonatos ----
  // Formatos:
  //  league     liga (todos contra todos)
  //  cup        copa (eliminación directa)
  //  league_cup liga y después cuadro entre los primeros `advance` (2 = final, 4 = semis, 8 = cuartos)
  //  groups     fase de grupos y después cuadro con los mejores de cada grupo (tipo Mundial)
  createTournament(name, teamIds, opts = {}) {
    const n = clean(name);
    const ids = [...new Set(teamIds)].filter((id) => state.teams.some((t) => t.id === id));
    const format = FORMATS.includes(opts.format) ? opts.format : 'league';
    if (!n || ids.length < 2) return null;
    const order = opts.shuffle ? shuffled(ids, opts.rnd) : ids;
    const t = {
      id: uid(), name: n, season: clean(opts.season, 20), format, teamIds: ids, matches: [],
      thirdPlace: format !== 'league' && !!opts.thirdPlace, createdAt: new Date().toISOString(),
    };

    if (format === 'cup') {
      t.matches = buildBracket(order, { thirdPlace: t.thirdPlace }).map(newKoMatch);
      propagate(t.matches);
    } else {
      const groupCount = format === 'groups' ? Math.max(2, Math.min(8, Math.trunc(Number(opts.groups)) || 2)) : 1;
      if (ids.length < groupCount * 2) return null;
      const lists = splitGroups(order, groupCount);
      t.groups = lists.map((gIds, i) => ({ name: format === 'groups' ? groupName(i) : 'Tabla', teamIds: gIds }));
      t.groups.forEach((g, gi) => {
        for (const r of roundRobin(g.teamIds, { doubleRound: !!opts.doubleRound })) {
          for (const game of r.games) {
            t.matches.push(normalizeMatch({
              id: uid(), stage: 'group', group: gi, round: r.round,
              label: format === 'groups' ? `${g.name} · Fecha ${r.round}` : `Fecha ${r.round}`,
              homeId: game.homeId, awayId: game.awayId,
            }));
          }
        }
      });
      if (format !== 'league') {
        const minGroup = Math.min(...t.groups.map((g) => g.teamIds.length));
        const wanted = Math.trunc(Number(opts.advance)) || 2;
        t.advance = Math.max(1, Math.min(wanted, minGroup));
        if (t.advance * groupCount < 2) return null;
        t.playoffsStarted = false;
      }
    }
    state.tournaments.push(t);
    state.currentId = t.id;
    commit();
    return t;
  },

  renameTournament(id, name, season) {
    const t = findTour(id);
    if (!t || !clean(name)) return false;
    t.name = clean(name);
    if (season !== undefined) t.season = clean(season, 20);
    commit();
    return true;
  },

  deleteTournament(id) {
    if (!findTour(id)) return false;
    state.tournaments = state.tournaments.filter((t) => t.id !== id);
    if (state.currentId === id) state.currentId = state.tournaments.at(-1)?.id ?? null;
    commit();
    return true;
  },

  // Cuando terminó la fase de liga/grupos, arma el cuadro con los clasificados.
  startPlayoffs(tournamentId) {
    const t = findTour(tournamentId);
    if (!t || !['league_cup', 'groups'].includes(t.format) || t.playoffsStarted) return false;
    const groupMatches = t.matches.filter((m) => m.stage !== 'ko');
    if (!groupMatches.length || !groupMatches.every((m) => m.played)) return false;
    const tables = t.groups.map((g, gi) => standings(
      state.teams.filter((x) => g.teamIds.includes(x.id)),
      groupMatches.filter((m) => (m.group ?? 0) === gi),
    ));
    // Mundial (2 por grupo): cruces 1°A-2°B, 1°B-2°A... Si no aplica, siembra estándar.
    const pairs = t.format === 'groups' && t.advance === 2 ? worldCupPairs(tables) : null;
    const o = { thirdPlace: !!t.thirdPlace };
    const bracket = pairs ? buildBracketPairs(pairs, o) : buildBracket(qualifiers(tables, t.advance), o);
    if (!bracket.length) return false;
    t.matches.push(...bracket.map(newKoMatch));
    propagate(t.matches);
    t.playoffsStarted = true;
    commit();
    return true;
  },

  // Guarda resultado, fecha y detalle de un partido. Devuelve '' si salió bien o el motivo si no.
  // En el cuadro, un empate se define por penales. Los goles cargados por jugador no pueden
  // superar el marcador de su equipo (los goles en contra suman al rival).
  saveMatch(tournamentId, matchId, { homeGoals, awayGoals, penHome, penAway, events, lineup, date }) {
    const t = findTour(tournamentId);
    const m = t?.matches.find((x) => x.id === matchId);
    if (!m || m.bye) return 'No se encontró el partido.';
    const ko = m.stage === 'ko';
    if (!ko && t.playoffsStarted) return 'La fase de liga ya está cerrada porque empezó el cuadro.';
    if (ko && (!m.homeId || !m.awayId)) return 'Este cruce todavía no tiene sus dos equipos.';
    const num = (v) => Math.max(0, Math.min(99, Math.trunc(Number(v)) || 0));
    const pen = (v) => (v === '' || v == null ? null : Math.max(0, Math.min(30, Math.trunc(Number(v)) || 0)));
    const hg = num(homeGoals);
    const ag = num(awayGoals);
    let ph = null; let pa = null;
    if (ko && hg === ag) {
      ph = pen(penHome); pa = pen(penAway);
      if (ph == null || pa == null || ph === pa) return 'En el cuadro no puede haber empate: cargá los penales con un ganador.';
    }
    // Pueden jugar los planteles actuales y quienes ya figuraban en este partido aunque después
    // hayan cambiado de equipo (si no, al editar un partido viejo se borrarían sus goles).
    const ids = new Set(state.players.filter((p) => p.teamId === m.homeId || p.teamId === m.awayId).map((p) => p.id));
    for (const pid of Object.keys(m.lineup || {})) if (state.players.some((p) => p.id === pid)) ids.add(pid);
    const lu = {};
    for (const [pid, side] of Object.entries(lineup ?? m.lineup ?? {})) {
      if (ids.has(pid) && (side === 'home' || side === 'away')) lu[pid] = side;
    }
    const evs = (events ?? m.events ?? []).filter((e) => e && EVENT_TYPES.includes(e.type) && lu[e.playerId])
      .map((e) => ({ playerId: e.playerId, type: e.type }));
    if (evs.filter((e) => e.type === 'mvp').length > 1) return 'Elegí una sola figura del partido.';
    const g = eventGoals(evs, lu);
    if (g.home > hg || g.away > ag) return 'Hay más goles cargados por jugador que en el marcador. Revisá los goles.';
    if (date !== undefined) {
      if (date && !DATE.test(date)) return 'La fecha no es válida.';
      m.date = date || '';
    }
    Object.assign(m, { homeGoals: hg, awayGoals: ag, penHome: ph, penAway: pa, events: evs, lineup: lu, played: true });
    if (ko) propagate(t.matches);
    commit();
    return '';
  },

  // ---- Ajustar el fixture de la liga/grupos ----
  // Solo partidos sin jugar, antes de que arranque el cuadro. Regla: nadie juega dos veces en una fecha.
  // checkMove devuelve '' si se puede mover a esa fecha o el motivo si no (sirve para la interfaz).
  checkMove(tournamentId, matchId, toRound) {
    const t = findTour(tournamentId);
    const m = t?.matches.find((x) => x.id === matchId);
    const why = editable(t, m);
    if (why) return why;
    const r = Math.trunc(Number(toRound));
    const last = Math.max(...groupStage(t).map((x) => x.round));
    if (!(r >= 1 && r <= last + 1)) return 'Esa fecha no existe.';
    if (r === m.round) return 'Ya está en esa fecha.';
    return clash(t, r, [m.homeId, m.awayId], [m.id]);
  },

  moveMatch(tournamentId, matchId, toRound) {
    const why = this.checkMove(tournamentId, matchId, toRound);
    if (why) return why;
    const t = findTour(tournamentId);
    t.matches.find((x) => x.id === matchId).round = Math.trunc(Number(toRound));
    compactRounds(t);
    commit();
    return '';
  },

  // Intercambia las fechas de dos partidos. En una liga todos contra todos casi nunca es posible
  // (dejaría a un equipo jugando dos veces); la interfaz usa swapRounds. Queda para casos con fechas incompletas.
  swapMatches(tournamentId, aId, bId) {
    const t = findTour(tournamentId);
    const a = t?.matches.find((x) => x.id === aId);
    const b = t?.matches.find((x) => x.id === bId);
    const why = editable(t, a) || editable(t, b);
    if (why) return why;
    if (a.id === b.id) return 'Elegí otro partido.';
    if (a.round === b.round) return 'Los dos partidos ya están en la misma fecha.';
    const c = clash(t, b.round, [a.homeId, a.awayId], [a.id, b.id]) || clash(t, a.round, [b.homeId, b.awayId], [a.id, b.id]);
    if (c) return c;
    [a.round, b.round] = [b.round, a.round];
    compactRounds(t);
    commit();
    return '';
  },

  // Intercambia dos fechas completas (p. ej. que la 5 se juegue antes que la 2). Siempre respeta el
  // fixture: cada fecha conserva sus partidos. Solo fechas sin partidos jugados.
  checkSwapRounds(tournamentId, r1, r2) {
    const t = findTour(tournamentId);
    if (!t) return 'No se encontró el campeonato.';
    if (t.playoffsStarted) return 'La fase de liga ya está cerrada porque empezó el cuadro.';
    if (r1 === r2) return 'Es la misma fecha.';
    const ms = groupStage(t);
    for (const r of [r1, r2]) {
      if (!ms.some((m) => m.round === r)) return `La Fecha ${r} no existe.`;
      if (ms.some((m) => m.round === r && m.played)) return `La Fecha ${r} ya tiene partidos jugados.`;
    }
    return '';
  },

  swapRounds(tournamentId, r1, r2) {
    const why = this.checkSwapRounds(tournamentId, r1, r2);
    if (why) return why;
    const t = findTour(tournamentId);
    for (const m of groupStage(t)) {
      if (m.round === r1) m.round = r2; else if (m.round === r2) m.round = r1;
    }
    compactRounds(t);
    commit();
    return '';
  },

  // Invierte local y visitante.
  flipHome(tournamentId, matchId) {
    const t = findTour(tournamentId);
    const m = t?.matches.find((x) => x.id === matchId);
    const why = editable(t, m);
    if (why) return why;
    [m.homeId, m.awayId] = [m.awayId, m.homeId];
    [m.homeGoals, m.awayGoals] = [m.awayGoals, m.homeGoals];
    for (const pid of Object.keys(m.lineup)) m.lineup[pid] = m.lineup[pid] === 'home' ? 'away' : 'home';
    commit();
    return '';
  },

  // Fecha (YYYY-MM-DD) de un partido sin jugar. Cadena vacía la borra.
  setMatchDate(tournamentId, matchId, date) {
    const m = findTour(tournamentId)?.matches.find((x) => x.id === matchId);
    if (!m || (date && !DATE.test(date))) return false;
    m.date = date || '';
    commit();
    return true;
  },

  // Vuelve el partido a "sin jugar" (conserva lo cargado para editarlo). En el cuadro, los cruces
  // siguientes se vacían.
  reopenMatch(tournamentId, matchId) {
    const t = findTour(tournamentId);
    const m = t?.matches.find((x) => x.id === matchId);
    if (!m || m.bye || !m.played) return false;
    if (m.stage !== 'ko' && t.playoffsStarted) return false;
    m.played = false;
    if (m.stage === 'ko') propagate(t.matches);
    commit();
    return true;
  },

  // ---- Amistosos (internos) ----
  // Un equipo anfitrión partido en dos lados. Se registran aparte: no tocan tablas ni cuadros.
  addFriendly(teamId, { homeName = 'Claros', awayName = 'Oscuros', date = '' } = {}) {
    if (!state.teams.some((t) => t.id === teamId)) return null;
    if (date && !DATE.test(date)) return null;
    const f = normalizeFriendly({ id: uid(), teamId, homeName, awayName, date, lineup: {}, events: [], played: false });
    state.friendlies.push(f);
    commit();
    return f;
  },

  // Guarda nombres de los lados, fecha, quién jugó en cada lado, marcador y detalle.
  // Devuelve '' si salió bien o el motivo si no (mismas reglas que un partido de campeonato).
  saveFriendly(id, { homeName, awayName, date, homeGoals, awayGoals, lineup, events }) {
    const f = state.friendlies.find((x) => x.id === id);
    if (!f) return 'No se encontró el amistoso.';
    const ids = new Set(state.players.map((p) => p.id));
    const lu = {};
    for (const [pid, side] of Object.entries(lineup ?? f.lineup)) {
      if (ids.has(pid) && (side === 'home' || side === 'away')) lu[pid] = side;
    }
    if (!Object.values(lu).includes('home') || !Object.values(lu).includes('away')) return 'Armá los dos lados: cada uno necesita al menos un jugador.';
    const num = (v) => Math.max(0, Math.min(99, Math.trunc(Number(v)) || 0));
    const hg = num(homeGoals); const ag = num(awayGoals);
    const evs = (events ?? f.events).filter((e) => e && EVENT_TYPES.includes(e.type) && lu[e.playerId])
      .map((e) => ({ playerId: e.playerId, type: e.type }));
    if (evs.filter((e) => e.type === 'mvp').length > 1) return 'Elegí una sola figura del partido.';
    const g = eventGoals(evs, lu);
    if (g.home > hg || g.away > ag) return 'Hay más goles cargados por jugador que en el marcador. Revisá los goles.';
    if (date && !DATE.test(date)) return 'La fecha no es válida.';
    Object.assign(f, {
      homeName: clean(homeName ?? f.homeName, 24) || 'Claros', awayName: clean(awayName ?? f.awayName, 24) || 'Oscuros',
      date: date ?? f.date, homeGoals: hg, awayGoals: ag, lineup: lu, events: evs, played: true,
    });
    commit();
    return '';
  },

  deleteFriendly(id) {
    if (!state.friendlies.some((f) => f.id === id)) return false;
    state.friendlies = state.friendlies.filter((f) => f.id !== id);
    commit();
    return true;
  },

  // ---- Copias ----
  exportJson: () => JSON.stringify({ app: 'fulbito-fc', version: 1, ...state }, null, 2),
  importJson(text) {
    let next = null;
    try { next = normalize(JSON.parse(text)); } catch { return false; }
    if (!next) return false;
    state = next;
    commit();
    return true;
  },
  clearAll() { state = empty(); commit(); },

  // Datos de ejemplo: 8 equipos con planteles, una liga y una copa terminadas, y un torneo
  // (liga + cuadro) con la final por jugarse. Solo si todavía no hay equipos.
  loadDemo() {
    if (state.teams.length) return false;
    const rnd = mulberry32(7);
    const TEAMS = [
      ['Los Cracks FC', '#1f4fbf', '#b8f03c', 'halves'], ['Deportivo Asado', '#e5484d', '#111111', 'stripes'],
      ['Atlético Fernet', '#111111', '#f2b705', 'band'], ['Real Birra', '#f2b705', '#1b3a8c', 'chevron'],
      ['Sacachispas del Barrio', '#1f9bd1', '#ffffff', 'stripes'], ['Club Choripán', '#6a2c91', '#f3ead6', 'quarters'],
      ['Juventud Unida', '#1b9e4b', '#ffffff', 'halves'], ['Los Pibes FC', '#1b3a8c', '#f3ead6', 'solid'],
    ];
    const NAMES = [['Juan Pérez', 'Tuti'], ['Nacho Ruiz', 'Nacho'], ['Bruno Díaz', 'Bruno'], ['Facundo Gómez', 'Facu'],
      ['Luciano Sosa', 'Lucho'], ['Santiago Vera', 'Santi'], ['Maximiliano Paz', 'Maxi'], ['Tomás Luna', 'Tomi'],
      ['Gonzalo Ibarra', 'Gonza'], ['Pablo Núñez', ''], ['Damián Cruz', 'Dami'], ['Ezequiel Rey', 'Eze'],
      ['Matías Ortiz', 'Mati'], ['Nicolás Ferro', 'Nico'], ['Rodrigo Sanz', 'Rodri'], ['Joaquín Mena', 'Joaco'],
      ['Federico Toledo', 'Fede'], ['Leandro Ríos', 'Lea'], ['Agustín Vidal', 'Agus'], ['Iván Godoy', ''],
      ['Emiliano Paredes', 'Emi'], ['Franco Medina', 'Pancho'], ['Lautaro Benítez', 'Lauti'], ['Marcos Acosta', ''],
      ['Cristian Molina', 'Colo'], ['Diego Romero', 'Cabezón'], ['Hernán Castro', 'Tano'], ['Javier Ledesma', 'Javi'],
      ['Kevin Herrera', ''], ['Mauro Quiroga', 'Mauri'], ['Óscar Aguirre', 'Oski'], ['Ramiro Suárez', 'Rama']];
    const teams = TEAMS.map(([name, color1, color2, pattern]) => this.addTeam(name, { color1, color2, pattern }));
    let k = 0;
    const NUMS = [1, 2, 4, 5, 7, 9, 10];
    for (const t of teams) {
      for (let i = 0; i < 7; i++) {
        const [name, nickname] = NAMES[(k * 5 + 3) % NAMES.length];
        k++;
        const p = normalizePlayer({ id: uid(), teamId: t.id, name, nickname, number: NUMS[i], face: randomFace(rnd) });
        state.players.push(p);
      }
    }
    const ids = teams.map((t) => t.id);
    const tour = (id) => findTour(id);
    const play = (t, m, date) => playDemoMatch(this, state, t, m, rnd, date);
    const dates = (start, round) => {
      const d = new Date(`${start}T12:00:00`);
      d.setDate(d.getDate() + (round - 1) * 7);
      return d.toISOString().slice(0, 10);
    };

    const liga = this.createTournament('Liga Fulbito', ids, { format: 'league', season: '2025' });
    tour(liga.id).matches.forEach((m) => play(liga, m, dates('2025-03-01', m.round)));

    const copa = this.createTournament('Copa de Verano', ids, { format: 'cup', season: '2026', thirdPlace: true, shuffle: true, rnd });
    for (const r of [1, 2, 3]) {
      tour(copa.id).matches.filter((m) => m.stage === 'ko' && m.round === r).forEach((m) => play(copa, m, dates('2026-01-10', r)));
    }

    const apertura = this.createTournament('Torneo Apertura', ids, { format: 'league_cup', season: '2026', advance: 4, thirdPlace: false });
    tour(apertura.id).matches.forEach((m) => play(apertura, m, dates('2026-03-07', m.round)));
    this.startPlayoffs(apertura.id);
    tour(apertura.id).matches.filter((m) => m.stage === 'ko' && m.round === 1).forEach((m) => play(apertura, m, '2026-05-02'));
    const final = tour(apertura.id).matches.find((m) => m.stage === 'ko' && m.round === 2);
    if (final) this.setMatchDate(apertura.id, final.id, '2026-05-09');
    this.setCurrent(apertura.id);
    // Amistosos internos de Los Cracks FC (algunos con un invitado de otro equipo).
    ['2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28'].forEach((d, i) => playDemoFriendly(this, state, teams[0].id, rnd, d, i % 2));
    return true;
  },
};

// ---- Nube: solo lectura para quien no es administrador ----
// Con la nube conectada, solo el admin carga o cambia datos (la base también lo impide; esto evita
// que alguien cargue algo que después no se guarda). Elegir campeonato (setCurrent) sí se permite.
export const LOCK_MSG = 'Solo el administrador puede cargar o cambiar datos. Entrá desde 💾.';
let locked = false;
const LOCKED_OPS = {
  text: ['saveMatch', 'moveMatch', 'swapMatches', 'swapRounds', 'flipHome', 'saveFriendly', 'checkMove', 'checkSwapRounds'],
  none: ['addTeam', 'addPlayer', 'createTournament', 'addFriendly'],
  no: ['updateTeam', 'deleteTeam', 'updatePlayer', 'deletePlayer', 'renameTournament', 'deleteTournament', 'startPlayoffs',
    'setMatchDate', 'reopenMatch', 'deleteFriendly', 'importJson', 'clearAll', 'loadDemo'],
};
for (const [kind, names] of Object.entries(LOCKED_OPS)) {
  for (const name of names) {
    const fn = store[name];
    store[name] = function guarded(...args) {
      if (!locked) return fn.apply(store, args);
      if (kind === 'text') return LOCK_MSG;
      errorHandler(LOCK_MSG);
      return kind === 'none' ? null : false;
    };
  }
}
Object.assign(store, {
  isLocked: () => locked,
  setLocked(v) {
    if (locked === !!v) return;
    locked = !!v;
    listeners.forEach((fn) => fn(state));
  },
  onCommit(fn) { commitHooks.add(fn); return () => commitHooks.delete(fn); },
  // Estado que llegó de la nube: reemplaza lo local (conservando el campeonato que se estaba mirando).
  replaceFromCloud(raw) {
    const next = normalize(raw);
    if (!next) return false;
    if (next.tournaments.some((t) => t.id === state.currentId)) next.currentId = state.currentId;
    state = next;
    commit({ fromCloud: true });
    return true;
  },
  // Lo que se sube a la nube (sin el campeonato elegido por cada uno... salvo el del admin, como inicial).
  snapshot: () => JSON.parse(JSON.stringify({ app: 'fulbito-fc', version: 1, ...state })),
});

// Generador repetible (mulberry32): los datos de ejemplo salen siempre iguales.
export function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// Simula un amistoso interno: reparte el plantel del equipo en dos lados (más `guests` invitados
// de otros equipos) y carga un resultado con goles, asistencias, figura y tarjetas.
export function playDemoFriendly(api, st, teamId, rnd, date, guests = 0) {
  const own = st.players.filter((p) => p.teamId === teamId);
  const others = st.players.filter((p) => p.teamId !== teamId);
  const people = [...own];
  for (let i = 0; i < guests && others.length; i++) people.push(others.splice(Math.floor(rnd() * others.length), 1)[0]);
  const order = shuffled(people, rnd);
  const lineup = {};
  order.forEach((p, i) => { lineup[p.id] = i % 2 ? 'away' : 'home'; });
  const sides = { home: order.filter((p) => lineup[p.id] === 'home'), away: order.filter((p) => lineup[p.id] === 'away') };
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const goals = { home: Math.floor(rnd() * 7), away: Math.floor(rnd() * 7) };
  const events = [];
  for (const side of ['home', 'away']) {
    for (let i = 0; i < goals[side]; i++) {
      const scorer = pick(sides[side]);
      events.push({ playerId: scorer.id, type: 'goal' });
      const mates = sides[side].filter((p) => p.id !== scorer.id);
      if (mates.length && rnd() < 0.6) events.push({ playerId: pick(mates).id, type: 'assist' });
    }
  }
  for (const p of people) if (rnd() < 0.06) events.push({ playerId: p.id, type: 'yellow' });
  events.push({ playerId: pick(goals.home >= goals.away ? sides.home : sides.away).id, type: 'mvp' });
  const f = api.addFriendly(teamId, { homeName: 'Claros', awayName: 'Oscuros', date });
  api.saveFriendly(f.id, { homeGoals: goals.home, awayGoals: goals.away, lineup, events, date });
  return f;
}

// Simula un partido de ejemplo con goles, asistencias, figura y tarjetas.
// (También lo usa scripts/datos-falsos.mjs para armar un juego de datos más grande.)
export function playDemoMatch(api, st, t, m, rnd, date) {
  if (m.bye || !m.homeId || !m.awayId) return;
  const roster = (teamId) => st.players.filter((p) => p.teamId === teamId);
  const lineup = {};
  const present = (teamId, side) => roster(teamId).filter(() => rnd() > 0.12).map((p) => { lineup[p.id] = side; return p; });
  const home = present(m.homeId, 'home');
  const away = present(m.awayId, 'away');
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  let hg = Math.floor(rnd() * 5);
  let ag = Math.floor(rnd() * 5);
  const events = [];
  const score = (mine, theirs, n) => {
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.06 && theirs.length) { events.push({ playerId: pick(theirs).id, type: 'own' }); continue; }
      const scorer = pick(mine);
      events.push({ playerId: scorer.id, type: 'goal' });
      const mates = mine.filter((p) => p.id !== scorer.id);
      if (mates.length && rnd() < 0.6) events.push({ playerId: pick(mates).id, type: 'assist' });
    }
  };
  if (!home.length) hg = 0;
  if (!away.length) ag = 0;
  score(home, away, hg);
  score(away, home, ag);
  for (const p of [...home, ...away]) {
    if (rnd() < 0.1) events.push({ playerId: p.id, type: 'yellow' });
    else if (rnd() < 0.015) events.push({ playerId: p.id, type: 'red' });
  }
  const best = hg >= ag ? home : away;
  if (best.length) events.push({ playerId: pick(best).id, type: 'mvp' });
  let penHome = null; let penAway = null;
  if (m.stage === 'ko' && hg === ag) { penHome = 4; penAway = rnd() < 0.5 ? 3 : 5; }
  api.saveMatch(t.id, m.id, { homeGoals: hg, awayGoals: ag, penHome, penAway, events, lineup, date });
}
