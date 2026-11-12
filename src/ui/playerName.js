// Cómo se muestra un jugador: número de camiseta (si tiene), nombre y apodo, como en Piel Morena.
// Ej.: [10] Juan Pérez «Tuti». El nombre va en <strong> para que destaque.
import { h } from '../dom.js';

export const displayName = (p) => (p?.name || p?.nickname || 'Jugador');

export function playerName(p, { stacked = false } = {}) {
  const nick = p.nickname && p.nickname !== displayName(p) ? p.nickname : '';
  return h('span', { class: `pname${stacked ? ' stacked' : ''}` },
    p.number ? h('span', { class: 'num' }, h('span', { class: 'sr-only' }, 'Camiseta '), p.number) : null,
    h('span', { class: 'ptxt' },
      h('strong', { class: 'pname-main' }, displayName(p)),
      nick ? h('span', { class: 'nick' }, `«${nick}»`) : null));
}
