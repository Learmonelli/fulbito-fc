import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRobin } from '../src/logic/fixture.js';
import { standings } from '../src/logic/standings.js';

test('roundRobin: 4 equipos => 3 fechas, 6 partidos, todos contra todos una vez', () => {
  const rounds = roundRobin(['a', 'b', 'c', 'd']);
  assert.equal(rounds.length, 3);
  const pairs = rounds.flatMap((r) => r.games.map((g) => [g.homeId, g.awayId].sort().join('-')));
  assert.equal(pairs.length, 6);
  assert.equal(new Set(pairs).size, 6);
  for (const r of rounds) {
    const used = r.games.flatMap((g) => [g.homeId, g.awayId]);
    assert.equal(new Set(used).size, used.length); // nadie juega dos veces en una fecha
  }
});

test('roundRobin: 5 equipos => 5 fechas, 10 partidos, uno descansa por fecha', () => {
  const rounds = roundRobin(['a', 'b', 'c', 'd', 'e']);
  assert.equal(rounds.length, 5);
  assert.equal(rounds.flatMap((r) => r.games).length, 10);
  assert.ok(rounds.every((r) => r.games.length === 2));
});

test('roundRobin: ida y vuelta duplica los partidos e invierte localía', () => {
  const rounds = roundRobin(['a', 'b', 'c', 'd'], { doubleRound: true });
  assert.equal(rounds.length, 6);
  const first = rounds[0].games[0];
  const back = rounds[3].games[0];
  assert.equal(first.homeId, back.awayId);
  assert.equal(first.awayId, back.homeId);
});

test('roundRobin: menos de 2 equipos o repetidos no genera partidos', () => {
  assert.deepEqual(roundRobin(['a']), []);
  assert.deepEqual(roundRobin(['a', 'a']), []);
});

test('standings: puntos, diferencia y desempate', () => {
  const teams = [
    { id: 'a', name: 'Alfa' },
    { id: 'b', name: 'Beta' },
    { id: 'c', name: 'Gama' },
  ];
  const matches = [
    { homeId: 'a', awayId: 'b', homeGoals: 2, awayGoals: 0, played: true },
    { homeId: 'b', awayId: 'c', homeGoals: 1, awayGoals: 1, played: true },
    { homeId: 'c', awayId: 'a', homeGoals: 0, awayGoals: 3, played: true },
    { homeId: 'a', awayId: 'c', homeGoals: 9, awayGoals: 9, played: false }, // ignorado
  ];
  const t = standings(teams, matches);
  assert.deepEqual(t.map((r) => r.teamId), ['a', 'b', 'c']);
  assert.equal(t[0].pts, 6);
  assert.equal(t[0].dg, 5);
  assert.equal(t[1].pts, 1);
  assert.equal(t[2].pts, 1);
  assert.equal(t[1].dg, -2); // Beta: 1 a favor, 3 en contra
  assert.equal(t[2].dg, -3);
});
