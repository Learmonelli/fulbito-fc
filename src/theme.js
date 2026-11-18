// Aspecto: el tema "Cancha arcade" (pixel) con una paleta de colores (palettes.css).
// Los estilos cuelgan de data-theme="pixel" y data-palette en <html>.
// Colores: cada persona puede elegir los suyos, o seguir los del grupo (lo que eligió el admin).
document.documentElement.dataset.theme = 'pixel';

// [id, nombre, color 1, color 2]: los dos colores pintan el escudo y las muestras.
export const PALETTES = [
  ['clasico', 'Azul y lima', '#1f4fbf', '#b8f03c'],
  ['pasion', 'Rojo y negro', '#c62828', '#111111'],
  ['cielo', 'Celeste y blanco', '#2b8fd6', '#ffffff'],
  ['selva', 'Verde y dorado', '#1f8a4c', '#ffd23f'],
  ['noche', 'Violeta y naranja', '#7b3fc4', '#ff9f1c'],
];
const KEY = 'ffc_palette';
const IDS = PALETTES.map((p) => p[0]);
export const FOLLOW_LEAGUE = 'liga'; // elección personal: "usar los colores del grupo"
let leaguePalette = ''; // los colores que eligió el admin del grupo ('' = sin elegir)
const listeners = new Set();

// Lo que eligió esta persona: una paleta, o 'liga' (por defecto).
export function savedPalette() {
  try { const v = localStorage.getItem(KEY); return IDS.includes(v) ? v : FOLLOW_LEAGUE; } catch { return FOLLOW_LEAGUE; }
}
// La paleta que se ve: la personal, o la del grupo, o la clásica.
export const effectivePalette = (choice = savedPalette()) => (
  choice === FOLLOW_LEAGUE ? (IDS.includes(leaguePalette) ? leaguePalette : 'clasico') : choice);
export const currentPalette = () => document.documentElement.dataset.palette || 'clasico';
export const getLeaguePalette = () => leaguePalette;
export const paletteColors = (id = currentPalette()) => {
  const p = PALETTES.find((x) => x[0] === id) ?? PALETTES[0];
  return { color1: p[2], color2: p[3] };
};
export const paletteName = (id) => (PALETTES.find((x) => x[0] === id) ?? PALETTES[0])[1];
export const onPalette = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function applyPalette(choice = savedPalette()) {
  document.documentElement.dataset.palette = effectivePalette(choice);
}
const notify = () => listeners.forEach((fn) => fn(currentPalette()));

// Elección personal: una paleta, o FOLLOW_LEAGUE para volver a los colores del grupo.
export function setPalette(id) {
  if (!IDS.includes(id) && id !== FOLLOW_LEAGUE) return false;
  if (id === savedPalette() && effectivePalette(id) === currentPalette()) return false;
  try { localStorage.setItem(KEY, id); } catch { /* sin almacenamiento: queda solo en esta visita */ }
  applyPalette(id);
  notify();
  return true;
}

// Los colores del grupo cambiaron (llegan con los datos). Solo se ven si la persona sigue al grupo.
export function setLeaguePalette(id) {
  const next = IDS.includes(id) ? id : '';
  if (next === leaguePalette) return false;
  leaguePalette = next;
  const before = currentPalette();
  applyPalette();
  if (currentPalette() !== before) notify();
  return true;
}

applyPalette();
