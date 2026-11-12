// Ligas: cada link ?liga=<id> es un torneo distinto, con su dueño y sus administradores.
// Sin ?liga= es la liga original ('main'). Los datos locales de cada liga van por separado.
export const MAIN = 'main';
const ID = /^[a-z0-9][a-z0-9-]{2,39}$/;

export const isLeagueId = (v) => typeof v === 'string' && ID.test(v);

export function leagueIdFromUrl(loc = globalThis.location) {
  try {
    const v = new URLSearchParams(loc?.search || '').get('liga');
    return isLeagueId(v) ? v : MAIN;
  } catch { return MAIN; }
}

// La liga original conserva la clave de siempre (no se pierde lo que ya estaba guardado).
export const storageKey = (id) => (id === MAIN ? 'fulbito_fc_v1' : `fulbito_fc_v1:${id}`);

export function leagueLink(id, loc = globalThis.location) {
  const base = `${loc?.origin ?? ''}${loc?.pathname ?? '/'}`;
  return id === MAIN ? base : `${base}?liga=${id}`;
}

// "Liga de los Jueves" -> "liga-de-los-jueves-4k7q" (con un sufijo para que no choque con otra).
export function slugify(name, rnd = Math.random) {
  const base = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'liga';
  const suffix = Array.from({ length: 4 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(rnd() * 32)]).join('');
  const id = `${base}-${suffix}`.replace(/^-/, '');
  return ID.test(id) ? id : `liga-${suffix}`;
}

export const cleanEmail = (e) => String(e ?? '').trim().toLowerCase();
export const isEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail(e));
