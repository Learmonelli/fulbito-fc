// Aspecto: el tema "Cancha arcade" (pixel) con una paleta de colores a elección (palettes.css).
// Los estilos cuelgan de data-theme="pixel" y data-palette en <html>.
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
const listeners = new Set();

export function savedPalette() {
  try { const v = localStorage.getItem(KEY); return IDS.includes(v) ? v : 'clasico'; } catch { return 'clasico'; }
}
export const currentPalette = () => document.documentElement.dataset.palette || 'clasico';
export const paletteColors = (id = currentPalette()) => {
  const p = PALETTES.find((x) => x[0] === id) ?? PALETTES[0];
  return { color1: p[2], color2: p[3] };
};
export const paletteName = (id) => (PALETTES.find((x) => x[0] === id) ?? PALETTES[0])[1];
export const onPalette = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function applyPalette(id = savedPalette()) {
  document.documentElement.dataset.palette = IDS.includes(id) ? id : 'clasico';
}

export function setPalette(id) {
  if (!IDS.includes(id) || id === currentPalette()) return false;
  try { localStorage.setItem(KEY, id); } catch { /* sin almacenamiento: queda solo en esta visita */ }
  applyPalette(id);
  listeners.forEach((fn) => fn(id));
  return true;
}

applyPalette();
