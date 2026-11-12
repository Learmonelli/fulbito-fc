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

export function setTheme(theme) {
  if (!THEMES.includes(theme) || theme === currentTheme()) return false;
  try { localStorage.setItem(KEY, theme); } catch { /* sin almacenamiento: queda solo en esta visita */ }
  applyTheme(theme);
  listeners.forEach((fn) => fn(theme));
  return true;
}
