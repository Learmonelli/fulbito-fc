import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  playerTotals, teamTotals, rankPlayers, tournamentStatus, topScorers, eventGoals, teamHistory, resultFor,
} from '../src/domain/stats.js';

const M = (o) => ({ played: true, bye: false, homeId: 'A', awayId: 'B', homeGoals: 0, awayGoals: 0, lineup: {}, events: [], date: '', order: 0, ...o });
const players = [{ id: 'a1', name: 'Ana', teamId: 'A' }, { id: 'a2', name: 'Beto', teamId: 'A' }, { id: 'b1', name: 'Caro', teamId: 'B' }];
const teams = [{ id: 'A', name: 'Alfa' }, { id: 'B', name: 'Beta' }, { id: 'C', name: 'Gama' }];

test('playerTotals: partidos, goles, asistencias, figura, tarjetas, goles en contra y resultados', () => {
  const ms = [
    M({ homeGoals: 2, awayGoals: 1, lineup: { a1: 'home', a2: 'home', b1: 'away' },
      events: [{ playerId: 'a1', type: 'goal' }, { playerId: 'a2', type: 'assist' }, { playerId: 'b1', type: 'own' },
        { playerId: 'b1', type: 'goal' }, { playerId: 'a1', type: 'mvp' }, { playerId: 'b1', type: 'yellow' }] }),
    M({ homeGoals: 0, awayGoals: 0, lineup: { a1: 'home' } }),
    M({ played: false, lineup: { a1: 'home' }, events: [{ playerId: 'a1', type: 'goal' }] }), // sin jugar: no cuenta
  ];
  const t = playerTotals(players, ms);
  assert.deepEqual(t.a1, { pj: 2, goals: 1, assists: 0, mvp: 1, yellow: 0, red: 0, own: 0, w: 1, d: 1, l: 0 });
  assert.equal(t.a2.assists, 1);
  assert.deepEqual([t.b1.goals, t.b1.own, t.b1.yellow, t.b1.l], [1, 1, 1, 1]);
});

test('teamTotals: puntos, goles y racha de los últimos 5 en orden cronológico', () => {
  const ms = [
    M({ homeGoals: 1, awayGoals: 0, date: '2026-01-03' }),
    M({ homeGoals: 0, awayGoals: 2, date: '2026-01-01' }),
    M({ homeGoals: 2, awayGoals: 2, date: '2026-01-02' }),
    M({ homeId: 'A', awayId: null, played: true }), // cruce sin rival: no cuenta
  ];
  const t = teamTotals(teams, ms);
  assert.deepEqual([t.A.pj, t.A.w, t.A.d, t.A.l, t.A.gf, t.A.gc, t.A.pts], [3, 1, 1, 1, 3, 4, 4]);
  assert.deepEqual(t.A.form, ['L', 'D', 'W']);
  assert.deepEqual(t.B.form, ['W', 'D', 'L']);
  assert.equal(t.C.pj, 0);
  const hist = teamHistory('A', ms);
  assert.equal(hist[0].match.date, '2026-01-03');
  assert.equal(resultFor(ms[1], 'away'), 'W');
});

test('rankPlayers: solo con valor, ordenado y con puestos compartidos', () => {
  const totals = { a1: { goals: 3 }, a2: { goals: 3 }, b1: { goals: 1 } };
  const r = rankPlayers([...players, { id: 'x', name: 'Cero' }], { ...totals, x: { goals: 0 } }, 'goals');
  assert.deepEqual(r.map((x) => [x.player.name, x.pos]), [['Ana', 1], ['Beto', 1], ['Caro', 3]]);
});

test('tournamentStatus: liga terminada da campeón por tabla; en juego no', () => {
  const tour = { format: 'league', teamIds: ['A', 'B', 'C'], matches: [
    M({ stage: 'group', homeGoals: 3, awayGoals: 0 }), M({ stage: 'group', homeId: 'B', awayId: 'C', homeGoals: 1, awayGoals: 0 }),
    M({ stage: 'group', homeId: 'C', awayId: 'A', homeGoals: 1, awayGoals: 1 }),
  ] };
  const st = tournamentStatus(tour, teams);
  assert.deepEqual([st.finished, st.first, st.second, st.third], [true, 'A', 'B', 'C']);
  tour.matches[2].played = false;
  const live = tournamentStatus(tour, teams);
  assert.deepEqual([live.finished, live.first, live.pending], [false, null, 1]);
});

test('tournamentStatus: copa con final jugada; liga + cuadro antes del cuadro', () => {
  const final = { stage: 'ko', round: 1, index: 0, homeId: 'A', awayId: 'B', homeGoals: 1, awayGoals: 1, penHome: 3, penAway: 4, played: true, bye: false };
  const cup = tournamentStatus({ format: 'cup', teamIds: ['A', 'B'], matches: [final] }, teams);
  assert.deepEqual([cup.finished, cup.first, cup.second], [true, 'B', 'A']);
  const lc = tournamentStatus({ format: 'league_cup', playoffsStarted: false, teamIds: ['A', 'B'], matches: [M({ stage: 'group', played: false })] }, teams);
  assert.deepEqual([lc.phase, lc.finished, lc.pending], ['group', false, 1]);
});

test('topScorers y eventGoals (los goles en contra suman al rival)', () => {
  const ms = [M({ homeGoals: 2, awayGoals: 0, lineup: { a1: 'home', a2: 'home', b1: 'away' },
    events: [{ playerId: 'a1', type: 'goal' }, { playerId: 'a2', type: 'goal' }] })];
  assert.deepEqual(topScorers(players, ms).players.map((p) => p.id), ['a1', 'a2']);
  assert.deepEqual(topScorers(players, []), { goals: 0, players: [] });
  assert.deepEqual(eventGoals([{ playerId: 'b1', type: 'own' }, { playerId: 'a1', type: 'goal' }], { a1: 'home', b1: 'away' }), { home: 2, away: 0 });
});

test('rachas: actual y récords de victorias, invicto, derrotas y sin ganar', async () => {
  const { streaks, streakLabel, playerStreaks } = await import('../src/domain/stats.js');
  const st = streaks(['W', 'W', 'W', 'D', 'L', 'L', 'W', 'D', 'D']);
  assert.deepEqual(st.best, { wins: 3, unbeaten: 4, losses: 2, winless: 3 });
  assert.deepEqual(st.current, { wins: 0, unbeaten: 3, losses: 0, winless: 2 });
  assert.equal(streakLabel(st).text, '3 sin perder');
  assert.equal(streakLabel(streaks(['L', 'W', 'W'])).text, '2 victorias seguidas');
  assert.equal(streakLabel(streaks(['W', 'L', 'L'])).kind, 'losses');
  assert.equal(streakLabel(streaks(['W', 'L', 'D', 'D'])).kind, 'unbeaten', 'dos empates seguidos = 2 sin perder');
  assert.equal(streakLabel(streaks(['W', 'D', 'L', 'D', 'L'])).kind, 'winless', '4 sin ganar');
  assert.equal(streakLabel(streaks(['W'])), null, 'con un partido no es racha');
  assert.equal(streakLabel(streaks([])), null);
  // Equipos: en orden de fecha. Jugadores: solo los partidos en que jugaron.
  const ms = [
    M({ homeGoals: 2, awayGoals: 0, date: '2026-01-01', lineup: { a1: 'home' } }),
    M({ homeGoals: 1, awayGoals: 0, date: '2026-01-08', lineup: { a1: 'home', a2: 'home' } }),
    M({ homeGoals: 0, awayGoals: 3, date: '2026-01-15', lineup: { a2: 'home' } }),
  ];
  const tt = teamTotals(teams, ms);
  assert.deepEqual(tt.A.streak.best, { wins: 2, unbeaten: 2, losses: 1, winless: 1 });
  assert.deepEqual(tt.B.streak.current.losses, 0);
  const ps = playerStreaks(players, ms);
  assert.equal(ps.a1.best.wins, 2);
  assert.equal(ps.a1.current.unbeaten, 2, 'a1 no jugó la derrota');
  assert.equal(ps.a2.current.losses, 1);
});
