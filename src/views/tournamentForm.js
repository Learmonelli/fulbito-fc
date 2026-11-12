// Crear un campeonato: nombre, temporada, formato (botones, sin desplegable), equipos y opciones.
import { h } from '../dom.js';
import { store } from '../store.js';
import { teamTag } from '../crest.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { FORMAT_LABELS, tourTitle } from './common.js';

const HELP = {
  league: 'Todos contra todos. Sale campeón el que más puntos suma.',
  cup: 'Eliminación directa. Si los equipos no son 2, 4, 8 o 16, los mejores sembrados pasan directo. Los empates se definen por penales.',
  league_cup: 'Primero una liga todos contra todos; al terminar, los mejores de la tabla juegan el cuadro (final, semis o cuartos).',
  groups: 'Como un Mundial: fase de grupos y después cuadro. Con 2 por grupo se cruzan 1°A-2°B y 1°B-2°A.',
};

const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

// Botonera de opciones exclusivas (rol radio). Devuelve { el, get }.
function choice(label, options, initial, onChange = () => {}) {
  let value = initial;
  const btns = options.map(([v, text]) => h('button', {
    type: 'button', class: 'seg-btn', role: 'radio', 'data-value': String(v),
    onclick: () => { value = v; paint(); onChange(v); },
  }, text));
  const paint = () => btns.forEach((b) => {
    const on = b.dataset.value === String(value);
    b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on));
  });
  paint();
  return { el: h('div', { class: 'seg-btns wrap-seg', role: 'radiogroup', 'aria-label': label }, btns), get: () => value };
}

export function openTournamentForm() {
  const s = store.get();
  if (s.teams.length < 2) { toast('Primero creá al menos dos equipos en Equipos.'); location.hash = '#/equipos'; return null; }
  return openSheet('Nuevo campeonato', (close) => {
    const name = h('input', { type: 'text', maxlength: 60, placeholder: 'Ej: Torneo Apertura', 'aria-label': 'Nombre del campeonato' });
    const season = h('input', { type: 'text', maxlength: 20, value: String(new Date().getFullYear()), 'aria-label': 'Temporada' });
    const help = h('p', { class: 'muted help' });
    const checks = s.teams.map((t) => ({ t, box: h('input', { type: 'checkbox', checked: true }) }));
    const err = h('p', { class: 'error', role: 'alert' });
    const box = (label) => { const i = h('input', { type: 'checkbox' }); return { i, el: h('label', { class: 'chip' }, i, ` ${label}`) }; };
    const dbl = box('Ida y vuelta');
    const shuffle = box('Sorteo al azar');
    const third = box('Partido por el 3.er puesto');
    const groups = choice('Cantidad de grupos', [[2, '2'], [3, '3'], [4, '4'], [6, '6'], [8, '8']], 2);
    const advKo = choice('Clasifican al cuadro', [[2, 'Final (2)'], [4, 'Semis (4)'], [8, 'Cuartos (8)']], 4);
    const advGroups = choice('Clasifican por grupo', [[1, '1'], [2, '2'], [4, '4']], 2);
    const groupsField = field('Grupos', groups.el);
    const advKoField = field('Pasan al cuadro', advKo.el);
    const advGroupsField = field('Pasan por grupo', advGroups.el);

    const sync = (f) => {
      dbl.el.hidden = f === 'cup';
      shuffle.el.hidden = !['cup', 'groups'].includes(f);
      third.el.hidden = f === 'league';
      groupsField.hidden = f !== 'groups';
      advKoField.hidden = f !== 'league_cup';
      advGroupsField.hidden = f !== 'groups';
      help.textContent = HELP[f];
    };
    const format = choice('Formato', Object.entries(FORMAT_LABELS), 'league', sync);
    sync('league');

    return h('form', {
      class: 'tour-form',
      onsubmit: (e) => {
        e.preventDefault();
        err.textContent = '';
        const f = format.get();
        const t = store.createTournament(name.value, checks.filter((c) => c.box.checked).map((c) => c.t.id), {
          format: f, season: season.value, doubleRound: dbl.i.checked, shuffle: shuffle.i.checked, thirdPlace: third.i.checked,
          groups: groups.get(), advance: f === 'groups' ? advGroups.get() : advKo.get(),
        });
        if (!t) { err.textContent = 'Revisá el nombre y los equipos: ese formato necesita más equipos.'; return; }
        close();
        toast(`🏆 ${tourTitle(t)} creado.`);
        location.hash = f === 'cup' ? '#/cuadro' : '#/fixture';
      },
    },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Nombre', name)), h('div', { class: 'season-field' }, field('Temporada', season))),
    field('Formato', format.el),
    help,
    h('p', { class: 'field-lbl' }, `Equipos (${s.teams.length})`),
    h('div', { class: 'checks' }, checks.map((c) => h('label', { class: 'chip' }, c.box, teamTag(c.t, 20)))),
    groupsField, advKoField, advGroupsField,
    h('div', { class: 'checks' }, dbl.el, shuffle.el, third.el),
    err,
    h('div', { class: 'row end sticky-actions' },
      h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'),
      h('button', { type: 'submit' }, 'Crear campeonato')));
  });
}

// Editar nombre/temporada o borrar el campeonato actual.
export function openTournamentSettings(tour) {
  return openSheet('Editar campeonato', (close) => {
    const name = h('input', { type: 'text', maxlength: 60, value: tour.name, 'aria-label': 'Nombre del campeonato' });
    const season = h('input', { type: 'text', maxlength: 20, value: tour.season || '', 'aria-label': 'Temporada' });
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        if (store.renameTournament(tour.id, name.value, season.value)) { close(); toast('Campeonato actualizado.'); }
      },
    },
    field('Nombre', name), field('Temporada', season),
    h('div', { class: 'row wrap end' },
      h('button', { type: 'button', class: 'danger', onclick: async () => {
        const ok = await confirmDialog(`Se borra "${tourTitle(tour)}" con todos sus partidos. Los equipos y jugadores quedan.`, { okLabel: 'Borrar', danger: true });
        if (ok) { store.deleteTournament(tour.id); close(); toast('Campeonato borrado.'); }
      } }, 'Borrar campeonato'),
      h('button', { type: 'submit' }, 'Guardar')));
  });
}
