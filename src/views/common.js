// Piezas compartidas por las pestañas: selector de campeonato, fila de partido, contador y fechas.
import { h } from '../dom.js';
import { store } from '../store.js';
import { teamTag } from '../crest.js';
import { scoreText } from '../logic/bracket.js';

export const FORMAT_LABELS = {
  league: 'Liga', cup: 'Copa', league_cup: 'Liga + cuadro', groups: 'Grupos + cuadro',
};

export const teamById = (s, id) => s.teams.find((t) => t.id === id) ?? null;
// "falta 1 partido" / "faltan 3 partidos" (cap = 'F' para empezar con mayúscula).
export const missing = (n, cap = 'f') => `${cap}alta${n === 1 ? '' : 'n'} ${n} partido${n === 1 ? '' : 's'}`;
export const tourTitle = (t) => (t.season ? `${t.name} ${t.season}` : t.name);

export function fmtDate(d, { long = false } = {}) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-AR', long
    ? { weekday: 'long', day: 'numeric', month: 'long' }
    : { weekday: 'short', day: 'numeric', month: 'short' });
}

// Botones de campeonato (sin desplegable) y el de crear uno nuevo.
export function tournamentPicker(s, { onNew } = {}) {
  if (!s.tournaments.length) return null;
  return h('div', { class: 'chips tour-chips', role: 'group', 'aria-label': 'Campeonato' },
    s.tournaments.map((t) => {
      const on = t.id === s.currentId;
      return h('button', {
        class: `chip-btn ${on ? 'on' : ''}`, 'aria-pressed': String(on), 'data-tour': t.id,
        onclick: () => store.setCurrent(t.id),
      }, tourTitle(t));
    }),
    onNew ? h('button', { class: 'chip-btn add', onclick: onNew }, '＋ Nuevo') : null);
}

// Fila de un partido al estilo Promiedos: local | resultado (o fecha) | visitante.
export function matchRow(s, m, { onOpen } = {}) {
  const home = teamById(s, m.homeId);
  const away = teamById(s, m.awayId);
  const ready = !!(m.homeId && m.awayId) && !m.bye;
  const center = m.played
    ? h('span', { class: 'mr-score' }, scoreText(m))
    : h('span', { class: 'mr-when' }, m.date ? fmtDate(m.date) : 'vs');
  const label = `${home?.name ?? 'A confirmar'} contra ${away?.name ?? 'A confirmar'}${m.played ? `, ${scoreText(m)}` : ''}`;
  return h('button', {
    class: `match-row ${m.played ? 'played' : 'pending'}`, disabled: !ready || !onOpen,
    'aria-label': ready ? `${label}. ${m.played ? 'Ver o editar' : 'Cargar resultado'}` : label,
    onclick: () => onOpen?.(m),
  },
  h('span', { class: 'mr-team home' }, teamTag(home, 26)),
  center,
  h('span', { class: 'mr-team away' }, teamTag(away, 26)));
}

// Contador − n + (controlado desde afuera: get/set).
export function stepper({ label, get, set, min = 0, max = 99, big = false }) {
  const out = h('output', { 'aria-live': 'polite' }, String(get()));
  const paint = () => { out.textContent = String(get()); minus.disabled = get() <= min; plus.disabled = get() >= max; };
  const minus = h('button', { type: 'button', class: 'ghost small step-btn', 'aria-label': `Restar ${label}`, onclick: () => { set(Math.max(min, get() - 1)); paint(); } }, '−');
  const plus = h('button', { type: 'button', class: 'ghost small step-btn', 'aria-label': `Sumar ${label}`, onclick: () => { set(Math.min(max, get() + 1)); paint(); } }, '+');
  const el = h('span', { class: `stepper${big ? ' big' : ''}`, role: 'group', 'aria-label': label }, minus, out, plus);
  paint();
  return { el, paint };
}

export const emptyCard = (title, text, ...actions) => h('section', { class: 'card empty' },
  h('h2', { class: 'card-title' }, title), h('p', { class: 'muted' }, text),
  actions.length ? h('div', { class: 'row wrap center' }, actions) : null);
