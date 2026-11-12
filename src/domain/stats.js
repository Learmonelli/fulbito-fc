// Estadísticas de Fulbito FC (lógica pura, sin DOM).
// Un partido: { homeId, awayId, homeGoals, awayGoals, penHome, penAway, played, bye, lineup, events, date }.
// lineup: { [playerId]: 'home' | 'away' } = quién jugó y para qué lado.
// events: [{ playerId, type }] con type 'goal' | 'assist' | 'mvp' | 'yellow' | 'red' | 'own' (gol en contra).
import { standings } from '../logic/standings.js';
import { podium as koPodium } from '../logic/bracket.js';

export const EVENT_TYPES = ['goal', 'assist', 'mvp', 'yellow', 'red', 'own'];

// Partidos reales que ya se jugaron (sin pases directos ni cruces por definir).
export const isReal = (m) => m.played && !m.bye && m.homeId && m.awayId;

// Todos los partidos de todos los campeonatos (o de uno), con datos para ordenarlos.
export function allMatches(tournaments, tournamentId = null) {
  const out = [];
  tournaments.forEach((t, ti) => {
    if (tournamentId && t.id !== tournamentId) return;
    t.matches.forEach((m, mi) => out.push({ ...m, tournamentId: t.id, tournamentName: t.name, order: ti * 10000 + mi }));
  });
  return out;
}

// Amistosos como partidos (misma forma), para sacar estadísticas SOLO de amistosos.
// teamId = filtrar por equipo anfitrión (opcional). Nunca se mezclan con los de campeonatos.
export function friendlyMatches(friendlies = [], teamId = null) {
  return friendlies
    .filter((f) => !teamId || f.teamId === teamId)
    .map((f, i) => ({ ...f, homeId: f.teamId, awayId: f.teamId, bye: false, order: i, label: 'Amistoso', tournamentName: 'Amistoso' }));
}

// Orden cronológico: por fecha si la tienen; si no, por orden de carga.
export const chrono = (a, b) => (a.date || '').localeCompare(b.date || '') || a.order - b.order;

// Resultado desde el punto de vista de un lado: 'W' | 'D' | 'L'. Los goles definen (los penales no).
export function resultFor(m, side) {
  const mine = side === 'home' ? Number(m.homeGoals) : Number(m.awayGoals);
  const theirs = side === 'home' ? Number(m.awayGoals) : Number(m.homeGoals);
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

const emptyPlayer = () => ({ pj: 0, goals: 0, assists: 0, mvp: 0, yellow: 0, red: 0, own: 0, w: 0, d: 0, l: 0 });

// Totales por jugador: { [playerId]: { pj, goals, assists, mvp, yellow, red, own, w, d, l } }.
export function playerTotals(players, matches) {
  const out = Object.fromEntries(players.map((p) => [p.id, emptyPlayer()]));
  const key = { goal: 'goals', assist: 'assists', mvp: 'mvp', yellow: 'yellow', red: 'red', own: 'own' };
  for (const m of matches) {
    if (!isReal(m)) continue;
    for (const [pid, side] of Object.entries(m.lineup || {})) {
      const s = out[pid];
      if (!s) continue;
      s.pj++;
      const r = resultFor(m, side);
      if (r === 'W') s.w++; else if (r === 'L') s.l++; else s.d++;
    }
    for (const e of m.events || []) {
      const s = out[e.playerId];
      if (s && key[e.type]) s[key[e.type]]++;
    }
  }
  return out;
}

// Rachas a partir de los resultados en orden cronológico ('W' | 'D' | 'L').
// current: lo que viene pasando ahora (desde el último partido hacia atrás).
// best: el récord en esa lista. "Invicto" = sin perder (ganados y empatados).
export function streaks(results) {
  const best = { wins: 0, unbeaten: 0, losses: 0, winless: 0 };
  const run = { wins: 0, unbeaten: 0, losses: 0, winless: 0 };
  for (const r of results) {
    run.wins = r === 'W' ? run.wins + 1 : 0;
    run.unbeaten = r !== 'L' ? run.unbeaten + 1 : 0;
    run.losses = r === 'L' ? run.losses + 1 : 0;
    run.winless = r !== 'W' ? run.winless + 1 : 0;
    for (const k of Object.keys(best)) best[k] = Math.max(best[k], run[k]);
  }
  return { current: { ...run }, best };
}

// La racha actual más llamativa, para mostrar como etiqueta (o null si no hay nada que contar).
// Desde 2 partidos: victorias > invicto > derrotas > sin ganar.
export function streakLabel(st, min = 2) {
  const c = st?.current;
  if (!c) return null;
  if (c.wins >= min) return { kind: 'wins', n: c.wins, icon: '🔥', text: `${c.wins} victorias seguidas` };
  if (c.unbeaten >= min) return { kind: 'unbeaten', n: c.unbeaten, icon: '🛡️', text: `${c.unbeaten} sin perder` };
  if (c.losses >= min) return { kind: 'losses', n: c.losses, icon: '🥶', text: `${c.losses} derrotas seguidas` };
  if (c.winless >= min + 1) return { kind: 'winless', n: c.winless, icon: '😬', text: `${c.winless} sin ganar` };
  return null;
}

// Rachas de cada jugador en los partidos en que jugó: { [playerId]: { current, best } }.
export function playerStreaks(players, matches) {
  const res = Object.fromEntries(players.map((p) => [p.id, []]));
  for (const m of [...matches].filter(isReal).sort(chrono)) {
    for (const [pid, side] of Object.entries(m.lineup || {})) if (res[pid]) res[pid].push(resultFor(m, side));
  }
  return Object.fromEntries(Object.entries(res).map(([id, r]) => [id, streaks(r)]));
}

const emptyTeam = () => ({ pj: 0, w: 0, d: 0, l: 0, gf: 0, gc: 0, dg: 0, pts: 0, form: [], results: [] });

// Totales por equipo en todos los partidos (liga y copa). form = últimos 5 resultados, del más viejo al último.
export function teamTotals(teams, matches) {
  const out = Object.fromEntries(teams.map((t) => [t.id, emptyTeam()]));
  for (const m of [...matches].filter(isReal).sort(chrono)) {
    for (const side of ['home', 'away']) {
      const s = out[side === 'home' ? m.homeId : m.awayId];
      if (!s) continue;
      const gf = Number(side === 'home' ? m.homeGoals : m.awayGoals) || 0;
      const gc = Number(side === 'home' ? m.awayGoals : m.homeGoals) || 0;
      const r = resultFor(m, side);
      s.pj++; s.gf += gf; s.gc += gc;
      if (r === 'W') { s.w++; s.pts += 3; } else if (r === 'L') s.l++; else { s.d++; s.pts++; }
      s.results.push(r);
    }
  }
  for (const s of Object.values(out)) {
    s.dg = s.gf - s.gc;
    s.form = s.results.slice(-5);
    s.streak = streaks(s.results); // racha actual y récords del equipo
  }
  return out;
}

// Partidos jugados por un equipo, del más reciente al más viejo.
export function teamHistory(teamId, matches) {
  return matches.filter((m) => isReal(m) && (m.homeId === teamId || m.awayId === teamId))
    .sort(chrono).reverse()
    .map((m) => ({ match: m, side: m.homeId === teamId ? 'home' : 'away', result: resultFor(m, m.homeId === teamId ? 'home' : 'away') }));
}

// Ranking de jugadores por un campo de playerTotals. Solo quienes tienen algo; empates comparten puesto.
export function rankPlayers(players, totals, field) {
  const rows = players
    .map((p) => ({ player: p, value: totals[p.id]?.[field] ?? 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.player.name.localeCompare(b.player.name, 'es'));
  let pos = 0; let last = null;
  rows.forEach((r, i) => { if (r.value !== last) { pos = i + 1; last = r.value; } r.pos = pos; });
  return rows;
}

// Estado de un campeonato: fase, si terminó y el podio (ids de equipos o null).
export function tournamentStatus(tour, teams) {
  const groupMatches = tour.matches.filter((m) => m.stage !== 'ko');
  const ko = tour.matches.filter((m) => m.stage === 'ko');
  const pendingGroup = groupMatches.filter((m) => !m.played).length;
  if (tour.format === 'league') {
    const table = standings(teams.filter((t) => tour.teamIds.includes(t.id)), groupMatches);
    const finished = groupMatches.length > 0 && pendingGroup === 0;
    return {
      phase: 'league', finished, pending: pendingGroup,
      first: finished ? table[0]?.teamId ?? null : null,
      second: finished ? table[1]?.teamId ?? null : null,
      third: finished ? table[2]?.teamId ?? null : null,
    };
  }
  if (tour.format !== 'cup' && !tour.playoffsStarted) {
    return { phase: 'group', finished: false, pending: pendingGroup, first: null, second: null, third: null };
  }
  const p = koPodium(ko);
  const pending = ko.filter((m) => !m.played).length;
  return { phase: 'ko', finished: !!p.first, pending, first: p.first, second: p.second, third: p.third };
}

// Goleador de un campeonato (puede haber empate: devuelve todos los que tienen el máximo).
export function topScorers(players, matches) {
  const totals = playerTotals(players, matches);
  const best = Math.max(0, ...players.map((p) => totals[p.id].goals));
  if (!best) return { goals: 0, players: [] };
  return { goals: best, players: players.filter((p) => totals[p.id].goals === best) };
}

// Goles que cuentan para cada lado según los eventos: los del lado + goles en contra del rival.
export function eventGoals(events, lineup) {
  const out = { home: 0, away: 0 };
  for (const e of events || []) {
    const side = lineup?.[e.playerId];
    if (!side) continue;
    if (e.type === 'goal') out[side]++;
    if (e.type === 'own') out[side === 'home' ? 'away' : 'home']++;
  }
  return out;
}
