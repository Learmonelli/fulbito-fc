// Avatares de jugadores: pixel art (como Piel Morena) o vectorial, según la versión de la app.
import { avatarSVGEl as pixelAvatar, teamKit } from './pmAvatar.js';
import { vectorAvatar } from './avatarVector.js';
import { isModern } from './theme.js';

export { teamKit };

export const avatarSVGEl = (...args) => (isModern() ? vectorAvatar(...args) : pixelAvatar(...args));

// p: jugador; team: su equipo (la camiseta sale de sus colores y diseño).
export const playerAvatar = (p, size, view, team = null) => avatarSVGEl(p.id, size, p.face, view, '', teamKit(team));
