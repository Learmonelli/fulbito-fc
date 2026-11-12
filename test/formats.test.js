import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedOrder, buildBracket, winnerOf, propagate, champion, scoreText } from '../src/logic/bracket.js';
import { splitGroups, qualifiers } from '../src/logic/groups.js';

const finish = (m, hg, ag, pens) => {
  m.played = true; m.homeGoals = hg; m.awayGoals = ag;
  if (pens) { m.penHome = pens[0]; m.penAway = pens[1]; }
};
const at = (ms, r, i) => ms.find((m) => m.round === r && m.index === i);

test('seedOrder estándar', () => {
  assert.deepEqual(seedOrder(2), [1, 2]);
  assert.deepEqual(seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test('llave de 8: 7 partidos, 3 rondas, sin pases directos', () => {
  const ms = buildBracket(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
  assert.equal(ms.length, 7);
  assert.equal(ms.filter((m) => m.bye).length, 0);
  assert.deepEqual([at(ms, 1, 0).homeId, at(ms, 1, 0).awayId], ['a', 'h']);
  assert.equal(at(ms, 3, 0).label, 'Final');
  assert.equal(at(ms, 2, 0).label, 'Semifinal');
});

test('llave de 5: los cabezas de serie pasan directo y avanzan solos', () => {
  const ms = buildBracket(['a', 'b', 'c', 'd', 'e']);
  assert.equal(ms.filter((m) => m.bye).length, 3);
  // a, b y c (seeds 1-3) no juegan la primera ronda; d vs e sí.
  const played = ms.filter((m) => m.round === 1 && !m.bye);
  assert.deepEqual([played[0].homeId, played[0].awayId], ['d', 'e']);
  const semi = ms.filter((m) => m.round === 2);
  assert.ok(semi.some((m) => m.homeId === 'a' || m.awayId === 'a'));
});

test('avance de ganadores, penales y campeón', () => {
  const ms = buildBracket(['a', 'b', 'c', 'd']);
  finish(at(ms, 1, 0), 2, 0);           // a vence a d
  finish(at(ms, 1, 1), 1, 1, [3, 4]);   // b vs c: gana c por penales
  propagate(ms);
  const final = at(ms, 2, 0);
  assert.equal(final.homeId, 'a');
  assert.equal(final.awayId, 'c');
  assert.equal(champion(ms), null);
  finish(final, 0, 1);
  assert.equal(champion(ms), 'c');
});

test('empate sin penales definidos no tiene ganador', () => {
  const m = { homeId: 'x', awayId: 'y', played: true, homeGoals: 1, awayGoals: 1, penHome: null, penAway: null };
  assert.equal(winnerOf(m), null);
  m.penHome = 2; m.penAway = 2;
  assert.equal(winnerOf(m), null);
  m.penAway = 1;
  assert.equal(winnerOf(m), 'x');
});

test('si se cambia un resultado, el cruce siguiente se reinicia', () => {
  const ms = buildBracket(['a', 'b', 'c', 'd']);
  finish(at(ms, 1, 0), 2, 0);
  finish(at(ms, 1, 1), 3, 0);
  propagate(ms);
  finish(at(ms, 2, 0), 1, 0);
  assert.equal(champion(ms), 'a');
  // Corrigen el 1er partido: ahora gana d. La final debe quedar sin jugar y con d.
  finish(at(ms, 1, 0), 0, 1);
  propagate(ms);
  const final = at(ms, 2, 0);
  assert.equal(final.homeId, 'd');
  assert.equal(final.played, false);
  assert.equal(champion(ms), null);
});

test('scoreText muestra penales solo si hubo empate', () => {
  assert.equal(scoreText({ played: false }), 'vs');
  assert.equal(scoreText({ played: true, homeGoals: 2, awayGoals: 1 }), '2 : 1');
  assert.equal(scoreText({ played: true, homeGoals: 1, awayGoals: 1, penHome: 4, penAway: 3 }), '1 : 1 (4-3 p)');
});

test('splitGroups serpiente y qualifiers sin cruces del mismo grupo', () => {
  const g = splitGroups(['1', '2', '3', '4', '5', '6', '7', '8'], 2);
  assert.deepEqual(g, [['1', '4', '5', '8'], ['2', '3', '6', '7']]);
  const tables = [[{ teamId: 'A1' }, { teamId: 'A2' }], [{ teamId: 'B1' }, { teamId: 'B2' }]];
  const seeds = qualifiers(tables, 2);
  assert.deepEqual(seeds, ['A1', 'B1', 'A2', 'B2']);
  const ms = buildBracket(seeds);
  const sf = ms.filter((m) => m.round === 1).map((m) => [m.homeId, m.awayId]);
  assert.deepEqual(sf, [['A1', 'B2'], ['B1', 'A2']]);
});

import { buildBracketPairs, podium } from '../src/logic/bracket.js';
import { worldCupPairs } from '../src/logic/groups.js';

test('tercer puesto: lo juegan los perdedores de semis y arma el podio', () => {
  const ms = buildBracket(['a', 'b', 'c', 'd'], { thirdPlace: true });
  assert.equal(ms.length, 4);
  const third = ms.find((m) => m.third);
  assert.equal(third.label, 'Tercer puesto');
  assert.equal(third.homeId, null);
  finish(at(ms, 1, 0), 2, 0);          // a vence a d  (pierde d)
  finish(at(ms, 1, 1), 1, 0);          // b vence a c  (pierde c)
  propagate(ms);
  assert.deepEqual([third.homeId, third.awayId], ['d', 'c']);
  const final = ms.find((m) => m.round === 2 && !m.third);
  finish(final, 1, 0);
  finish(third, 0, 2);                 // gana c
  assert.deepEqual(podium(ms), { first: 'a', second: 'b', third: 'c' });
  assert.equal(champion(ms), 'a');     // el tercer puesto no se confunde con la final
});

test('tercer puesto: no se arma con 3 equipos (semifinal con pase directo) ni con 2', () => {
  assert.equal(buildBracket(['a', 'b', 'c'], { thirdPlace: true }).some((m) => m.third), false);
  assert.equal(buildBracket(['a', 'b'], { thirdPlace: true }).some((m) => m.third), false);
});

test('si cambia una semifinal, el tercer puesto se reinicia', () => {
  const ms = buildBracket(['a', 'b', 'c', 'd'], { thirdPlace: true });
  finish(at(ms, 1, 0), 2, 0);
  finish(at(ms, 1, 1), 1, 0);
  propagate(ms);
  const third = ms.find((m) => m.third);
  finish(third, 3, 0);
  finish(at(ms, 1, 0), 0, 1);          // corrigen: ahora gana d, pierde a
  propagate(ms);
  assert.equal(third.homeId, 'a');
  assert.equal(third.played, false);
});

test('worldCupPairs: 1°A-2°B, 1°B-2°A y mismo grupo solo en la final', () => {
  const tables = ['A', 'B', 'C', 'D'].map((g) => [{ teamId: `${g}1` }, { teamId: `${g}2` }]);
  const pairs = worldCupPairs(tables);
  assert.deepEqual(pairs, [['A1', 'B2'], ['C1', 'D2'], ['B1', 'A2'], ['D1', 'C2']]);
  const ms = buildBracketPairs(pairs);
  assert.equal(ms.length, 7);
  // Ronda en que se cruzarían dos equipos del mismo grupo (1 = primera ronda).
  const r1 = ms.filter((m) => m.round === 1);
  const idx = (id) => r1.find((m) => m.homeId === id || m.awayId === id).index;
  const meets = (i, j) => { let r = 1; while (Math.floor(i / 2 ** (r - 1)) !== Math.floor(j / 2 ** (r - 1))) r++; return r; };
  for (const g of ['A', 'B', 'C', 'D']) assert.equal(meets(idx(`${g}1`), idx(`${g}2`)), 3); // final
});

test('worldCupPairs no aplica con cantidad de grupos que no es potencia de 2', () => {
  const t = (g) => [{ teamId: `${g}1` }, { teamId: `${g}2` }];
  assert.equal(worldCupPairs([t('A'), t('B'), t('C')]), null);
  assert.equal(worldCupPairs([t('A')]), null);
  assert.equal(worldCupPairs([t('A'), [{ teamId: 'B1' }]]), null);
});
