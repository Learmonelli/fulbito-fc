// Grupos: cada link ?liga=<id> es un grupo de amigos, con su dueño, sus administradores y sus datos.
// Sin ?liga= se muestra la pantalla de inicio (crear un grupo o entrar con un link).
// El id 'main' y los campeonatos son de Liga FC, la otra app.
export const MAIN = 'main';
export const LIGA_FC_URL = 'https://learmonelli.github.io/liga-fc/';
const ID = /^[a-z0-9][a-z0-9-]{2,39}$/;

export const isLeagueId = (v) => typeof v === 'string' && ID.test(v);

// El grupo del link, o null si no hay (o el id no es válido).
export function leagueIdFromUrl(loc = globalThis.location) {
  try {
    const v = new URLSearchParams(loc?.search || '').get('liga');
    return isLeagueId(v) ? v : null;
  } catch { return null; }
}

// Acepta un link completo (https://.../?liga=los-jueves-ab12) o solo el código.
export function parseLeagueInput(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  try {
    const v = new URL(t).searchParams.get('liga');
    if (isLeagueId(v)) return v;
  } catch { /* no es un link: se prueba como código */ }
  const code = t.toLowerCase();
  return isLeagueId(code) ? code : null;
}

// Copia guardada en este celular: una por grupo.
export const storageKey = (id) => (id ? `ffc_v1:${id}` : 'ffc_v1');

export function leagueLink(id, loc = globalThis.location) {
  return `${loc?.origin ?? ''}${loc?.pathname ?? '/'}?liga=${id}`;
}

// Los campeonatos se ven en Liga FC.
export const ligaFcLink = (id) => (id && id !== MAIN ? `${LIGA_FC_URL}?liga=${id}` : LIGA_FC_URL);

// "Los del Jueves" -> "los-del-jueves-4k7q" (con un sufijo para que no choque con otro grupo).
export function slugify(name, rnd = Math.random) {
  const base = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'grupo';
  const suffix = Array.from({ length: 4 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(rnd() * 32)]).join('');
  const id = `${base}-${suffix}`.replace(/^-/, '');
  return ID.test(id) ? id : `grupo-${suffix}`;
}

export const cleanEmail = (e) => String(e ?? '').trim().toLowerCase();
export const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail(e));
