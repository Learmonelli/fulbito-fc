// Búsqueda sin distinguir mayúsculas ni acentos; cada palabra tiene que aparecer.
// "tuti 10" encuentra al jugador apodado Tuti con camiseta 10; también busca por equipo.
export const norm = (s) => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function matchesQuery(parts, query) {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const text = norm(parts.filter((x) => x != null && x !== '').join(' '));
  return tokens.every((t) => text.includes(t));
}

export const playerMatches = (p, team, query) => matchesQuery([p.name, p.nickname, p.number, team?.name], query);
