// Fixture todos-contra-todos (método del círculo).
// Con cantidad impar de equipos, uno descansa cada fecha (BYE, no se genera partido).
// doubleRound = true genera ida y vuelta.
export function roundRobin(teamIds, { doubleRound = false } = {}) {
  const ids = [...new Set(teamIds)];
  if (ids.length < 2) return [];
  const BYE = null;
  const list = ids.length % 2 ? [...ids, BYE] : [...ids];
  const n = list.length;
  const rounds = [];

  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === BYE || b === BYE) continue;
      // Alterna localía para repartir mejor.
      games.push(r % 2 === 0 ? { homeId: a, awayId: b } : { homeId: b, awayId: a });
    }
    rounds.push(games);
    // Rotación: el primero queda fijo.
    list.splice(1, 0, list.pop());
  }

  const out = rounds.map((games, i) => ({ round: i + 1, games }));
  if (doubleRound) {
    const offset = out.length;
    rounds.forEach((games, i) => {
      out.push({
        round: offset + i + 1,
        games: games.map((g) => ({ homeId: g.awayId, awayId: g.homeId })),
      });
    });
  }
  return out;
}
