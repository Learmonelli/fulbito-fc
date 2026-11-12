// Aspecto de la app: 'pixel' (Cancha arcade) o 'modern' (sin pixel art). Se cambia con el botón
// del encabezado y se recuerda en este navegador. La compilación solo elige con cuál arranca la
// primera vez (npm run build = pixel, npm run build:moderno = moderno).
// Los estilos cuelgan de data-theme en <html>; escudos y caras leen el mismo atributo.
/* global __THEME__ */
const KEY = 'fulbito_theme';
export const THEMES = ['pixel', 'modern'];
export const DEFAULT_THEME = typeof __THEME__ !== 'undefined' && __THEME__ === 'modern' ? 'modern' : 'pixel';
const listeners = new Set();

export function savedTheme() {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : DEFAULT_THEME;
  } catch { return DEFAULT_THEME; }
}

export const currentTheme = () => (typeof document !== 'undefined' && document.documentElement.dataset.theme) || DEFAULT_THEME;
export const isModern = () => currentTheme() === 'modern';
export const onTheme = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function applyTheme(theme = savedTheme()) {
  document.documentElement.dataset.theme = THEMES.includes(theme) ? theme : DEFAULT_THEME;
}

// ---- Paletas de colores (palettes.css). 'clasico' = azul y lima. ----
// [id, nombre, color 1, color 2] (los dos colores pintan el escudo de la app y las muestras).
export const PALETTES = [
  ['clasico', 'Azul y lima', '#1f4fbf', '#b8f03c'],
  ['pasion', 'Rojo y negro', '#c62828', '#111111'],
  ['cielo', 'Celeste y blanco', '#2b8fd6', '#ffffff'],
  ['selva', 'Verde y dorado', '#1f8a4c', '#ffd23f'],
  ['noche', 'Violeta y naranja', '#7b3fc4', '#ff9f1c'],
];
const PKEY = 'fulbito_palette';
const PIDS = PALETTES.map((p) => p[0]);
export const FOLLOW_LEAGUE = 'liga'; // elección personal "usar los colores de la liga"
let leaguePalette = ''; // los colores que eligió el organizador ('' = sin elegir)

// Lo que eligió esta persona: una paleta o 'liga' (por defecto).
export function savedPalette() {
  try { const v = localStorage.getItem(PKEY); return PIDS.includes(v) ? v : FOLLOW_LEAGUE; } catch { return FOLLOW_LEAGUE; }
}
// La paleta que se ve: la personal, o la de la liga, o la clásica.
export const effectivePalette = (choice = savedPalette()) => (choice === FOLLOW_LEAGUE ? (PIDS.includes(leaguePalette) ? leaguePalette : 'clasico') : choice);
export const currentPalette = () => (typeof document !== 'undefined' && document.documentElement.dataset.palette) || 'clasico';
export const paletteColors = (id = currentPalette()) => { const p = PALETTES.find((x) => x[0] === id) ?? PALETTES[0]; return { color1: p[2], color2: p[3] }; };
export const paletteName = (id) => (PALETTES.find((x) => x[0] === id) ?? PALETTES[0])[1];

const notify = () => listeners.forEach((fn) => fn(currentTheme()));

export function applyPalette(choice = savedPalette()) {
  document.documentElement.dataset.palette = effectivePalette(choice);
}

// Elección personal: una paleta, o FOLLOW_LEAGUE para volver a los colores de la liga.
export function setPalette(id) {
  if (!PIDS.includes(id) && id !== FOLLOW_LEAGUE) return false;
  if (id === savedPalette() && effectivePalette(id) === currentPalette()) return false;
  try { localStorage.setItem(PKEY, id); } catch { /* sin almacenamiento: queda solo en esta visita */ }
  applyPalette(id);
  notify();
  return true;
}

// Los colores de la liga cambiaron (llegan con los datos). Solo se ven si la persona sigue a la liga.
export function setLeaguePalette(id) {
  const next = PIDS.includes(id) ? id : '';
  if (next === leaguePalette) return false;
  leaguePalette = next;
  const before = currentPalette();
  applyPalette();
  if (currentPalette() !== before) notify();
  return true;
}
export const getLeaguePalette = () => leaguePalette;

export function setTheme(theme) {
  if (!THEMES.includes(theme) || theme === currentTheme()) return false;
  try { localStorage.setItem(KEY, theme); } catch { /* sin almacenamiento: queda solo en esta visita */ }
  applyTheme(theme);
  listeners.forEach((fn) => fn(theme));
  return true;
}
