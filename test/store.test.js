// Capa de datos con un localStorage en memoria (sin navegador).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const { store } = await import('../src/store.js');
const { tournamentStatus, playerTotals, allMatches } = await import('../src/domain/stats.js');

beforeEach(() => store.clearAll());

const twoTeams = () => {
  const a = store.addTeam('Alfa'); const b = store.addTeam('Beta');
  const pa = store.addPlayer(a.id, { name: 'Ana Gómez', nickname: 'Ani', number: '9' });
  const pb = store.addPlayer(b.id, { name: 'Bruno Díaz', number: 'x' });
  return { a, b, pa, pb };
};

test('equipos: nombre obligatorio y sin repetir; colores validados', () => {
  assert.equal(store.addTeam('  '), null);
  const t = store.addTeam('Real Birra', { color1: '#123456', color2: 'rojo' });
  assert.equal(t.color1, '#123456');
  assert.match(t.color2, /^#[0-9a-f]{6}$/i);
  assert.equal(store.addTeam('real birra'), null);
  assert.equal(store.updateTeam(t.id, { pattern: 'stripes', logo: 'data:image/svg+xml;base64,AAA' }), true);
  assert.equal(store.get().teams[0].pattern, 'stripes');
  assert.equal(store.get().teams[0].logo, '', 'nunca guarda SVG como logo');
});

test('jugadores: número válido o vacío, y no se borra a quien ya jugó', () => {
  const { a, b, pa, pb } = twoTeams();
  assert.equal(pa.number, 9);
  assert.equal(pb.number, null);
  const t = store.createTournament('Liga', [a.id, b.id], { format: 'league', season: '2026' });
  const m = t.matches[0];
  const home = m.homeId === a.id ? pa : pb;
  assert.equal(store.saveMatch(t.id, m.id, { homeGoals: 1, awayGoals: 0, lineup: { [home.id]: 'home' }, events: [{ playerId: home.id, type: 'goal' }] }), '');
  assert.equal(store.deletePlayer(home.id), false);
  assert.equal(store.deleteTeam(a.id), false, 'juega un campeonato');
  const extra = store.addPlayer(a.id, { name: 'Suplente' });
  assert.equal(store.deletePlayer(extra.id), true);
});

test('saveMatch: valida goles por jugador, una sola figura y penales en el cuadro', () => {
  const { a, b, pa, pb } = twoTeams();
  const t = store.createTournament('Copa', [a.id, b.id], { format: 'cup' });
  const m = t.matches[0];
  const side = (p) => (m.homeId === p.teamId ? 'home' : 'away');
  const lineup = { [pa.id]: side(pa), [pb.id]: side(pb) };
  const two = [{ playerId: pa.id, type: 'goal' }, { playerId: pa.id, type: 'goal' }];
  const paGoals = side(pa) === 'home' ? { homeGoals: 1, awayGoals: 0 } : { homeGoals: 0, awayGoals: 1 };
  assert.match(store.saveMatch(t.id, m.id, { ...paGoals, lineup, events: two }), /más goles/);
  assert.match(store.saveMatch(t.id, m.id, { homeGoals: 1, awayGoals: 1, lineup, events: [] }), /penales/);
  assert.match(store.saveMatch(t.id, m.id, { homeGoals: 0, awayGoals: 0, lineup, events: [{ playerId: pa.id, type: 'mvp' }, { playerId: pb.id, type: 'mvp' }], penHome: 3, penAway: 2 }), /una sola figura/);
  assert.equal(store.saveMatch(t.id, m.id, { homeGoals: 1, awayGoals: 1, penHome: 4, penAway: 2, lineup, events: [{ playerId: pa.id, type: 'goal' }, { playerId: pb.id, type: 'goal' }], date: '2026-05-01' }), '');
  const st = tournamentStatus(store.get().tournaments[0], store.get().teams);
  assert.equal(st.first, m.homeId, 'gana por penales el local');
  assert.equal(store.get().tournaments[0].matches[0].date, '2026-05-01');
  // Eventos de jugadores que no son de estos equipos se descartan.
  assert.equal(store.reopenMatch(t.id, m.id), true);
  assert.equal(tournamentStatus(store.get().tournaments[0], store.get().teams).finished, false);
});

test('liga + cuadro: no se arma hasta terminar la liga y después la liga queda cerrada', () => {
  const ids = ['Uno', 'Dos', 'Tres', 'Cuatro'].map((n) => store.addTeam(n).id);
  const t = store.createTournament('Apertura', ids, { format: 'league_cup', advance: 2 });
  assert.equal(store.startPlayoffs(t.id), false);
  for (const m of store.get().tournaments[0].matches) assert.equal(store.saveMatch(t.id, m.id, { homeGoals: 2, awayGoals: 1 }), '');
  assert.equal(store.startPlayoffs(t.id), true);
  const tour = store.get().tournaments[0];
  assert.equal(tour.matches.filter((m) => m.stage === 'ko').length, 1, 'final entre los 2 primeros');
  const group = tour.matches.find((m) => m.stage !== 'ko');
  assert.match(store.saveMatch(t.id, group.id, { homeGoals: 0, awayGoals: 0 }), /cerrada/);
  assert.equal(store.reopenMatch(t.id, group.id), false);
});

test('grupos tipo Mundial y campeonato actual', () => {
  const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((n) => store.addTeam(`Club ${n}`).id);
  const t = store.createTournament('Mundialito', ids, { format: 'groups', groups: 2, advance: 2, season: '2026' });
  assert.equal(t.groups.length, 2);
  assert.equal(store.current().id, t.id);
  assert.equal(store.createTournament('Mal', ids.slice(0, 3), { format: 'groups', groups: 2 }), null);
  const other = store.createTournament('Liga', ids.slice(0, 2));
  assert.equal(store.current().id, other.id);
  assert.equal(store.setCurrent(t.id), true);
  store.deleteTournament(t.id);
  assert.equal(store.current().id, other.id);
});

test('datos de ejemplo: 8 equipos, 2 campeones y una final por jugar; se exporta e importa igual', () => {
  assert.equal(store.loadDemo(), true);
  assert.equal(store.loadDemo(), false, 'solo con la app vacía');
  const s = store.get();
  assert.equal(s.teams.length, 8);
  assert.equal(s.players.length, 56);
  const status = s.tournaments.map((t) => tournamentStatus(t, s.teams));
  assert.deepEqual(status.map((x) => x.finished), [true, true, false]);
  assert.equal(store.current().name, 'Torneo Apertura');
  const final = store.current().matches.find((m) => m.stage === 'ko' && m.round === 2);
  assert.ok(final.homeId && final.awayId && !final.played, 'la final tiene rivales y está por jugarse');
  // Los goles cargados nunca superan el marcador.
  for (const t of s.tournaments) {
    for (const m of t.matches.filter((x) => x.played && !x.bye)) {
      const goals = m.events.filter((e) => e.type === 'goal' || e.type === 'own').length;
      assert.equal(goals, m.homeGoals + m.awayGoals);
    }
  }
  const totals = playerTotals(s.players, allMatches(s.tournaments));
  assert.ok(Object.values(totals).some((x) => x.goals > 0 && x.pj > 0));
  const json = store.exportJson();
  store.clearAll();
  assert.equal(store.importJson('{"nada":1}'), false);
  assert.equal(store.importJson(json), true);
  assert.equal(store.get().players.length, 56);
  assert.equal(store.current().name, 'Torneo Apertura');
});

test('amistosos: se registran aparte y no se mezclan con los campeonatos', async () => {
  const { friendlyMatches, teamTotals } = await import('../src/domain/stats.js');
  const { a, b, pa, pb } = twoTeams();
  const a2 = store.addPlayer(a.id, { name: 'Ale Ruiz' });
  const t = store.createTournament('Liga', [a.id, b.id]);
  const m = t.matches[0];
  const sideA = m.homeId === a.id ? 'home' : 'away';
  store.saveMatch(t.id, m.id, { homeGoals: 1, awayGoals: 0, lineup: { [pa.id]: sideA }, events: sideA === 'home' ? [{ playerId: pa.id, type: 'goal' }] : [] });

  const f = store.addFriendly(a.id, { homeName: 'Claros', awayName: 'Oscuros', date: '2026-06-01' });
  assert.equal(store.addFriendly('nada'), null);
  // Cada lado necesita jugadores; el invitado (de otro equipo) puede jugar.
  assert.match(store.saveFriendly(f.id, { homeGoals: 1, awayGoals: 0, lineup: { [pa.id]: 'home' } }), /dos lados/);
  assert.match(store.saveFriendly(f.id, { homeGoals: 0, awayGoals: 0, lineup: { [pa.id]: 'home', [pb.id]: 'away' }, events: [{ playerId: pa.id, type: 'goal' }] }), /más goles/);
  assert.equal(store.saveFriendly(f.id, {
    homeGoals: 3, awayGoals: 1, lineup: { [pa.id]: 'home', [a2.id]: 'away', [pb.id]: 'away' },
    events: [{ playerId: pa.id, type: 'goal' }, { playerId: pa.id, type: 'goal' }, { playerId: pb.id, type: 'goal' }, { playerId: pa.id, type: 'mvp' }],
  }), '');
  const s = store.get();
  // Campeonato: Ana tiene sus goles de liga, sin los del amistoso.
  const off = playerTotals(s.players, allMatches(s.tournaments));
  const fr = playerTotals(s.players, friendlyMatches(s.friendlies));
  assert.equal(off[pa.id].goals, sideA === 'home' ? 1 : 0);
  assert.equal(fr[pa.id].goals, 2);
  assert.equal(fr[pa.id].mvp, 1);
  assert.equal(fr[pb.id].goals, 1, 'el invitado suma en amistosos');
  assert.equal(fr[pa.id].w, 1);
  // La tabla del campeonato no cambia por el amistoso.
  assert.equal(teamTotals(s.teams, allMatches(s.tournaments))[a.id].pj, 1);
  // No se puede borrar a quien jugó un amistoso, ni al equipo anfitrión.
  assert.equal(store.deletePlayer(a2.id), false);
  // Exporta e importa con los amistosos.
  const json = store.exportJson();
  store.clearAll();
  assert.equal(store.importJson(json), true);
  assert.equal(store.get().friendlies.length, 1);
  assert.equal(store.deleteFriendly(store.get().friendlies[0].id), true);
  assert.equal(store.get().friendlies.length, 0);
});

test('ajustar fixture: mover, intercambiar e invertir localía sin que nadie juegue dos veces por fecha', () => {
  const ids = ['Uno', 'Dos', 'Tres', 'Cuatro'].map((n) => store.addTeam(n).id);
  const t = store.createTournament('Liga', ids, { format: 'league_cup', advance: 2 });
  const tour = () => store.get().tournaments[0];
  const group = () => tour().matches.filter((m) => m.stage !== 'ko');
  const valid = () => {
    for (const r of new Set(group().map((m) => m.round))) {
      const teams = group().filter((m) => m.round === r).flatMap((m) => [m.homeId, m.awayId]);
      assert.equal(new Set(teams).size, teams.length, `fecha ${r} sin repetidos`);
    }
    const pairs = group().map((m) => [m.homeId, m.awayId].sort().join('-'));
    assert.equal(new Set(pairs).size, 6, 'siguen todos contra todos');
  };
  const [a, b] = group().filter((m) => m.round === 1);
  // A otra fecha con los mismos equipos: choca.
  assert.match(store.checkMove(t.id, a.id, 2), /ya juega en la Fecha 2/);
  // A una fecha nueva: sí. La fecha 1 queda con un partido.
  assert.equal(store.moveMatch(t.id, a.id, 4), '');
  assert.equal(group().find((m) => m.id === a.id).round, 4);
  valid();
  // El otro partido de la fecha 1 también se va: la fecha 1 queda vacía y se renumera sin huecos.
  assert.equal(store.moveMatch(t.id, b.id, 4), '');
  assert.deepEqual([...new Set(group().map((m) => m.round))].sort(), [1, 2, 3]);
  assert.ok(group().every((m) => m.label === `Fecha ${m.round}`));
  valid();
  // Intercambiar: con 4 equipos todas las fechas están completas, así que siempre chocaría.
  const r1 = group().filter((m) => m.round === 1);
  const r2 = group().filter((m) => m.round === 2);
  assert.equal(store.swapMatches(t.id, r1[0].id, r1[1].id), 'Los dos partidos ya están en la misma fecha.');
  assert.match(store.swapMatches(t.id, r1[0].id, r2[0].id), /ya juega/);
  valid();
  // Lo útil: intercambiar fechas completas (cada fecha conserva sus partidos).
  const f1 = group().filter((m) => m.round === 1).map((m) => m.id).sort();
  const f3 = group().filter((m) => m.round === 3).map((m) => m.id).sort();
  assert.equal(store.swapRounds(t.id, 1, 3), '');
  assert.deepEqual(group().filter((m) => m.round === 3).map((m) => m.id).sort(), f1);
  assert.deepEqual(group().filter((m) => m.round === 1).map((m) => m.id).sort(), f3);
  assert.ok(group().every((m) => m.label === `Fecha ${m.round}`));
  assert.equal(store.swapRounds(t.id, 2, 2), 'Es la misma fecha.');
  assert.match(store.swapRounds(t.id, 1, 9), /no existe/);
  valid();
  // Localía.
  const m = group()[0];
  const [h0, a0] = [m.homeId, m.awayId];
  assert.equal(store.flipHome(t.id, m.id), '');
  const after = group().find((x) => x.id === m.id);
  assert.deepEqual([after.homeId, after.awayId], [a0, h0]);
  // Un partido jugado no se mueve (ni su fecha se intercambia); tampoco después de armar el cuadro.
  assert.equal(store.saveMatch(t.id, m.id, { homeGoals: 1, awayGoals: 0 }), '');
  assert.match(store.moveMatch(t.id, m.id, 1), /ya se jugó/);
  assert.match(store.swapRounds(t.id, m.round, m.round === 1 ? 2 : 1), /ya tiene partidos jugados/);
  assert.match(store.flipHome(t.id, m.id), /ya se jugó/);
  for (const x of group().filter((g) => !g.played)) store.saveMatch(t.id, x.id, { homeGoals: 2, awayGoals: 2 });
  assert.equal(store.startPlayoffs(t.id), true);
  const fin = tour().matches.find((x) => x.stage === 'ko');
  assert.match(store.flipHome(t.id, fin.id), /cuadro/);
});

test('pase de equipo: conserva lo jugado y no se pierden sus goles al editar un partido viejo', () => {
  const { a, b, pa, pb } = twoTeams();
  const c = store.addTeam('Gama');
  const t = store.createTournament('Liga', [a.id, b.id]);
  const m = t.matches[0];
  const sideA = m.homeId === a.id ? 'home' : 'away';
  const goals = sideA === 'home' ? { homeGoals: 2, awayGoals: 0 } : { homeGoals: 0, awayGoals: 2 };
  assert.equal(store.saveMatch(t.id, m.id, { ...goals, lineup: { [pa.id]: sideA, [pb.id]: sideA === 'home' ? 'away' : 'home' },
    events: [{ playerId: pa.id, type: 'goal' }, { playerId: pa.id, type: 'goal' }] }), '');
  // Ana pasa a Gama.
  assert.equal(store.updatePlayer(pa.id, { teamId: c.id }), true);
  // Se corrige la fecha del partido viejo con los mismos datos: los goles de Ana siguen.
  const old = store.get().tournaments[0].matches[0];
  assert.equal(store.saveMatch(t.id, old.id, { ...goals, lineup: old.lineup, events: old.events, date: '2026-01-01' }), '');
  const tot = playerTotals(store.get().players, allMatches(store.get().tournaments));
  assert.equal(tot[pa.id].goals, 2);
  assert.equal(tot[pa.id].pj, 1);
  // Gama no hereda partidos: lo jugado es del equipo de ese partido.
  assert.equal(store.get().tournaments[0].matches[0].lineup[pa.id], sideA);
});
