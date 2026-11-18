// Pantalla de inicio (sin ?liga=): crear un grupo, entrar con un link, o probar sin cuenta.
import { h, fill } from '../dom.js';
import { parseLeagueInput, leagueLink, isLeagueId } from '../league.js';
import { toast } from './toast.js';
import { loginBox, accountBox, myGroupsBox, createGroupBox } from './cloudPanel.js';

const LAST = 'ffc_last_group';
export const rememberGroup = (id) => { try { localStorage.setItem(LAST, id); } catch { /* sin almacenamiento */ } };
export const lastGroup = () => { try { const v = localStorage.getItem(LAST); return isLeagueId(v) ? v : null; } catch { return null; } };

export function renderLanding(root, session) {
  const { cloud } = session;
  const user = cloud.user();
  const code = h('input', { type: 'text', placeholder: 'Pegá el link o el código del grupo', 'aria-label': 'Link o código del grupo', autocomplete: 'off', spellcheck: 'false' });
  const err = h('p', { class: 'error', role: 'alert' });

  const enter = h('div', { class: 'card stack' },
    h('h2', { class: 'card-title' }, '🔗 Tengo el link de un grupo'),
    h('p', { class: 'muted small-note' }, 'Te lo pasó alguien del grupo por WhatsApp. Pegalo acá y entrás a cargar partidos.'),
    h('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault(); err.textContent = '';
      const id = parseLeagueInput(code.value);
      if (!id) { err.textContent = 'No reconozco ese link. Tiene que ser el link completo o el código del grupo.'; return; }
      globalThis.location.href = leagueLink(id);
    } }, code, err, h('button', { type: 'submit' }, 'Entrar al grupo')));

  const create = user
    ? h('div', { class: 'card stack' }, h('h2', { class: 'card-title' }, '👥 Mi cuenta'), accountBox(session, () => renderLanding(root, session)), myGroupsBox(session), createGroupBox(session))
    : h('div', { class: 'card stack' },
      h('h2', { class: 'card-title' }, '👥 Crear mi grupo'),
      h('p', { class: 'muted small-note' }, 'Armá el grupo de tus amigos: plantel, partidos, goles, premios, ranking y pronósticos. Vos sos el dueño y los demás cargan con el link.'),
      loginBox(session, { onDone: () => renderLanding(root, session), intro: 'Primero entrá con tu email (hace falta una sola vez).' }));

  fill(root,
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, '⚽ Fulbito FC'),
      h('p', {}, 'Las estadísticas del fútbol entre amigos: goles, asistencias, premios de cada partido, ranking y pronósticos. Sin plata, solo cargadas.')),
    enter,
    create,
    h('div', { class: 'card stack' },
      h('h2', { class: 'card-title' }, '👀 Probar sin crear nada'),
      h('p', { class: 'muted small-note' }, 'Con datos de ejemplo. Queda solo en este celular y no se comparte.'),
      h('button', { class: 'ghost', onclick: () => { globalThis.location.search = '?local=1'; toast('Modo prueba'); } }, 'Probar')));
}
