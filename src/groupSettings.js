// Ajustes del grupo que ven todos: nombres de los dos equipos y paleta de colores.
// Los guarda el administrador en la nube (fulbito_state.data.settings) y llegan en vivo.
export const DEFAULT_SETTINGS = { teamAName: 'Claros', teamBName: 'Oscuros', palette: 'clasico' };

let current = { ...DEFAULT_SETTINGS };
const listeners = new Set();

export const getGroupSettings = () => current;
export const onGroupSettings = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function setGroupSettings(s = {}) {
  const clean = (v, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 30) : fallback);
  const next = {
    teamAName: clean(s.teamAName, DEFAULT_SETTINGS.teamAName),
    teamBName: clean(s.teamBName, DEFAULT_SETTINGS.teamBName),
    palette: typeof s.palette === 'string' ? s.palette : DEFAULT_SETTINGS.palette,
  };
  if (JSON.stringify(next) === JSON.stringify(current)) return false;
  current = next;
  listeners.forEach((fn) => fn(current));
  return true;
}
