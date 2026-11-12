// Eliminación directa. Los partidos de llave tienen: round (1..R), index (posición en la ronda),
// homeId/awayId (null = por definir), bye (pasa directo), penHome/penAway (si empatan).

// Orden estándar de siembra: 1 vs último, 2 vs anteúltimo, sin cruzar a los favoritos antes de tiempo.
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export function stageName(round, totalRounds) {
  const left = totalRounds - round;
  if (left === 0) return 'Final';
  if (left === 1) return 'Semifinal';
  if (left === 2) return 'Cuartos de final';
  if (left === 3) return 'Octavos de final';
  return `Ronda ${round}`;
}

// teamIds en orden de siembra (el primero es el cabeza de serie 1).
// Devuelve los partidos de todas las rondas; los pases directos ya vienen resueltos.
// opts.thirdPlace = true agrega el partido por el tercer puesto (perdedores de semifinales).
export function buildBracket(teamIds, opts = {}) {
  const ids = [...new Set(teamIds)];
  if (ids.length < 2) return [];
  let size = 2;
  while (size < ids.length) size *= 2;
  return buildFromSlots(seedOrder(size).map((seed) => ids[seed - 1] ?? null), opts);
}

// Llave con cruces ya definidos: pairs = [[local, visitante], ...] en orden de llave.
// Los ganadores de pairs[0] y pairs[1] se enfrentan, luego los de pairs[2] y pairs[3], etc.
// La cantidad de cruces tiene que ser potencia de 2 (1, 2, 4, 8...).
export function buildBracketPairs(pairs, opts = {}) {
  const count = pairs.length;
  if (count < 1 || (count & (count - 1)) !== 0) return [];
  return buildFromSlots(pairs.flat(), opts);
}

function buildFromSlots(slots, { thirdPlace = false } = {}) {
  const size = slots.length;
  const rounds = Math.log2(size);
  const matches = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const m = {
        round: r, index: i, label: stageName(r, rounds),
        homeId: r === 1 ? slots[i * 2] : null,
        awayId: r === 1 ? slots[i * 2 + 1] : null,
        homeGoals: 0, awayGoals: 0, penHome: null, penAway: null, played: false, bye: false,
      };
      if (r === 1 && (!m.homeId || !m.awayId)) { m.bye = true; m.played = true; }
      matches.push(m);
    }
  }
  // Tercer puesto: solo con semifinales reales (sin pases directos) y al menos 4 equipos.
  const semisHaveByes = rounds === 2 && slots.some((s) => !s);
  if (thirdPlace && rounds >= 2 && !semisHaveByes) {
    matches.push({
      round: rounds, index: 1, label: 'Tercer puesto', third: true,
      homeId: null, awayId: null, homeGoals: 0, awayGoals: 0,
      penHome: null, penAway: null, played: false, bye: false,
    });
  }
  propagate(matches);
  return matches;
}

const loserOf = (m) => {
  const w = winnerOf(m);
  if (!w || m.bye) return null;
  return w === m.homeId ? m.awayId : m.homeId;
};

// Ganador de un partido de llave (o null si todavía no hay).
export function winnerOf(m) {
  if (m.bye) return m.homeId || m.awayId || null;
  if (!m.played) return null;
  const hg = Number(m.homeGoals) || 0;
  const ag = Number(m.awayGoals) || 0;
  if (hg > ag) return m.homeId;
  if (hg < ag) return m.awayId;
  const ph = Number(m.penHome);
  const pa = Number(m.penAway);
  if (m.penHome == null || m.penAway == null || Number.isNaN(ph) || Number.isNaN(pa)) return null;
  if (ph > pa) return m.homeId;
  if (ph < pa) return m.awayId;
  return null;
}

// (propagate resuelve los pases directos y el avance entre rondas)
// Coloca a cada ganador en su próxima ronda. Es idempotente: si un resultado cambia o se
// reabre, el cruce siguiente se vacía/reinicia para no dejar resultados huérfanos.
export function propagate(matches) {
  const ko = matches.filter((m) => m.round != null && m.index != null);
  const maxRound = Math.max(0, ...ko.map((m) => m.round));
  const at = (r, i) => ko.find((m) => m.round === r && m.index === i);

  const place = (next, key, id) => {
    if (next[key] === id) return;
    next[key] = id;
    next.played = false;
    next.homeGoals = 0; next.awayGoals = 0;
    next.penHome = null; next.penAway = null;
    next.events = []; next.lineup = {};
  };

  for (let r = 1; r < maxRound; r++) {
    for (const m of ko.filter((x) => x.round === r)) {
      const next = at(r + 1, Math.floor(m.index / 2));
      if (!next) continue;
      place(next, m.index % 2 === 0 ? 'homeId' : 'awayId', winnerOf(m));
    }
  }

  // Tercer puesto: lo juegan los perdedores de las dos semifinales.
  const third = ko.find((m) => m.third);
  if (third) {
    const semis = [at(maxRound - 1, 0), at(maxRound - 1, 1)];
    place(third, 'homeId', semis[0] ? loserOf(semis[0]) : null);
    place(third, 'awayId', semis[1] ? loserOf(semis[1]) : null);
  }
}

// Texto del marcador: "2 : 1" o "1 : 1 (4-3 p)".
export function scoreText(m) {
  if (!m.played) return 'vs';
  const base = `${m.homeGoals} : ${m.awayGoals}`;
  const tie = Number(m.homeGoals) === Number(m.awayGoals);
  return tie && m.penHome != null ? `${base} (${m.penHome}-${m.penAway} p)` : base;
}

export function champion(matches) {
  const ko = matches.filter((m) => m.index != null);
  if (!ko.length) return null;
  const last = Math.max(...ko.map((m) => m.round));
  const final = ko.find((m) => m.round === last && !m.third);
  return final ? winnerOf(final) ?? null : null;
}

// Podio: campeón, subcampeón y (si hubo partido por el tercer puesto) tercero.
export function podium(matches) {
  const ko = matches.filter((m) => m.index != null);
  if (!ko.length) return { first: null, second: null, third: null };
  const last = Math.max(...ko.map((m) => m.round));
  const final = ko.find((m) => m.round === last && !m.third);
  const thirdMatch = ko.find((m) => m.third);
  return {
    first: final ? winnerOf(final) ?? null : null,
    second: final ? loserOf(final) : null,
    third: thirdMatch ? winnerOf(thirdMatch) ?? null : null,
  };
}
