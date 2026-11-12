// Pestaña "Fixture y tablas" (como Promiedos): tabla de posiciones y fechas con sus partidos.
import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { crestEl, teamTag } from '../crest.js';
import { standings } from '../logic/standings.js';
import { tournamentStatus } from '../domain/stats.js';
import { toast } from '../ui/toast.js';
import { openSheet } from '../ui/sheet.js';
import { openMatchSheet } from './matchSheet.js';
import { openTournamentForm, openTournamentSettings } from './tournamentForm.js';
import { tournamentPicker, matchRow, teamById, tourTitle, FORMAT_LABELS, emptyCard, missing } from './common.js';

// round: fecha elegida por campeonato · edit: modo "Ajustar fixture"
const ui = { round: {}, edit: {} };

// Encabezado del campeonato: nombre, formato y estado (campeón, en juego, fase).
export function tourHeader(s, tour) {
  const st = tournamentStatus(tour, s.teams);
  const champ = teamById(s, st.first);
  const status = st.finished && champ
    ? h('p', { class: 'champ-line' }, '🏆 Campeón: ', crestEl(champ, 22), h('strong', {}, champ.name))
    : st.phase === 'group'
      ? h('p', { class: 'muted' }, st.pending ? `Fase de liga · ${missing(st.pending, 'f')}` : 'Fase de liga terminada: ya se puede armar el cuadro')
      : h('p', { class: 'muted' }, st.pending ? `En juego · ${missing(st.pending, 'f')}` : 'En juego');
  return h('section', { class: 'card tour-head' },
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, h('h2', { class: 'card-title' }, tourTitle(tour)),
        h('span', { class: 'tag' }, FORMAT_LABELS[tour.format]), ' ',
        h('span', { class: 'tag' }, `${tour.teamIds.length} equipos`)),
      store.isLocked() ? null : h('button', { class: 'ghost small icon-btn', 'aria-label': 'Editar campeonato', onclick: () => openTournamentSettings(tour) }, '⚙')),
    status);
}

// Tabla de posiciones de un grupo (o de la liga). Columnas como Promiedos.
function standingsTable(s, tour, group, gi, cutoff, finished) {
  const matches = tour.matches.filter((m) => m.stage !== 'ko' && (m.group ?? 0) === gi);
  const table = standings(s.teams.filter((t) => group.teamIds.includes(t.id)), matches);
  const cols = [['Pts', 'Puntos', 'pts'], ['PJ', 'Partidos jugados', 'pj'], ['G', 'Ganados', 'pg'], ['E', 'Empatados', 'pe'],
    ['P', 'Perdidos', 'pp'], ['GF', 'Goles a favor', 'gf'], ['GC', 'Goles en contra', 'gc'], ['DG', 'Diferencia de gol', 'dg']];
  return h('div', { class: 'table-wrap card' }, h('table', { class: 'table standings' },
    h('caption', { class: 'sr-only' }, `Posiciones de ${group.name}`),
    h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, '#'), h('th', { scope: 'col', class: 'team-col' }, 'Equipo'),
      cols.map(([ab, long]) => h('th', { scope: 'col' }, h('abbr', { title: long }, ab))))),
    h('tbody', {}, table.map((r, i) => {
      const t = teamById(s, r.teamId);
      const zone = cutoff && i < cutoff ? 'zone-ko' : finished && i === 0 && tour.format === 'league' ? 'zone-champ' : '';
      return h('tr', { class: zone },
        h('td', { class: 'pos' }, i + 1),
        h('th', { scope: 'row', class: 'team-col' }, teamTag(t, 22)),
        cols.map(([, , k]) => {
          if (k === 'pts') return h('td', { class: 'pts' }, h('b', {}, r.pts));
          if (k === 'dg') return h('td', {}, r.dg > 0 ? `+${r.dg}` : String(r.dg));
          return h('td', {}, String(r[k]));
        }));
    }))));
}

// Fechas con flechas ‹ › (sin desplegable). Por defecto, la primera con partidos pendientes.
function roundsBox(s, tour) {
  const matches = tour.matches.filter((m) => m.stage !== 'ko');
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  if (!rounds.length) return null;
  const firstPending = rounds.find((r) => matches.some((m) => m.round === r && !m.played));
  let round = rounds.includes(ui.round[tour.id]) ? ui.round[tour.id] : firstPending ?? rounds.at(-1);
  const list = h('div', { class: 'match-list' });
  const label = h('h3', { class: 'round-label', 'aria-live': 'polite' });
  const prev = h('button', { class: 'ghost small icon-btn', 'aria-label': 'Fecha anterior', onclick: () => go(-1) }, '‹');
  const next = h('button', { class: 'ghost small icon-btn', 'aria-label': 'Fecha siguiente', onclick: () => go(1) }, '›');
  const paint = () => {
    const idx = rounds.indexOf(round);
    prev.disabled = idx <= 0; next.disabled = idx >= rounds.length - 1;
    const ms = matches.filter((m) => m.round === round);
    const played = ms.filter((m) => m.played).length;
    label.textContent = `Fecha ${round}`;
    const editing = canEdit && !!ui.edit[tour.id];
    fill(list,
      h('p', { class: 'muted center small-note' }, `${played} de ${ms.length} jugados · fecha ${idx + 1} de ${rounds.length}`),
      editing ? swapRoundsBox(tour, round, rounds) : null,
      ms.map((m) => h('div', { class: 'fx-item' },
        (tour.groups?.length ?? 0) > 1 ? h('p', { class: 'muted small-note' }, tour.groups[m.group]?.name) : null,
        matchRow(s, m, { onOpen: () => openMatchSheet(tour.id, m.id) }),
        editing ? editTools(s, tour, m) : null)));
  };
  const go = (d) => {
    const idx = rounds.indexOf(round) + d;
    if (idx < 0 || idx >= rounds.length) return;
    round = rounds[idx]; ui.round[tour.id] = round; paint();
  };
  // Ajustar fixture: solo con partidos de liga sin jugar y antes del cuadro.
  const canEdit = !store.isLocked() && !tour.playoffsStarted && matches.some((m) => !m.played);
  const editBtn = canEdit ? h('button', {
    class: `ghost small ${ui.edit[tour.id] ? 'on' : ''}`, 'aria-pressed': String(!!ui.edit[tour.id]),
    onclick: () => { ui.edit[tour.id] = !ui.edit[tour.id]; editBtn.classList.toggle('on', !!ui.edit[tour.id]); editBtn.setAttribute('aria-pressed', String(!!ui.edit[tour.id])); editBtn.textContent = ui.edit[tour.id] ? '✔ Listo' : '✏️ Ajustar fixture'; paint(); },
  }, ui.edit[tour.id] ? '✔ Listo' : '✏️ Ajustar fixture') : null;
  paint();
  return h('section', { class: 'card rounds' },
    h('div', { class: 'round-nav' }, prev, label, next), list,
    editBtn ? h('div', { class: 'row end edit-row' }, editBtn) : null);
}

// Intercambiar esta fecha completa con otra (botones, sin desplegable).
function swapRoundsBox(tour, round, rounds) {
  const others = rounds.filter((r) => r !== round);
  if (!others.length) return null;
  return h('div', { class: 'swap-banner' },
    h('span', {}, `🔁 Intercambiar la Fecha ${round} con:`),
    h('div', { class: 'chips swap-chips' }, others.map((r) => {
      const why = store.checkSwapRounds(tour.id, round, r);
      return h('button', {
        class: 'chip-btn', disabled: !!why, title: why || `Que la Fecha ${r} se juegue en lugar de la ${round}`,
        'aria-label': why ? `Fecha ${r}: ${why}` : `Intercambiar con la Fecha ${r}`,
        onclick: () => {
          ui.round[tour.id] = r; // seguimos viendo los mismos partidos, ahora en su nueva fecha
          const msg = store.swapRounds(tour.id, round, r);
          toast(msg ? `⚠ ${msg}` : `🔁 Fecha ${round} ⇄ Fecha ${r}`);
        },
      }, String(r));
    })));
}

// Acciones de un partido en modo "Ajustar fixture": mover de fecha y localía.
function editTools(s, tour, m) {
  if (m.played) return h('p', { class: 'muted small-note fx-locked' }, '🔒 Jugado: reabrilo para moverlo.');
  return h('div', { class: 'fx-tools' },
    h('button', { class: 'ghost small', onclick: () => openMoveSheet(s, tour, m) }, '📅 Mover'),
    h('button', { class: 'ghost small', onclick: () => { const msg = store.flipHome(tour.id, m.id); toast(msg ? `⚠ ${msg}` : '⇄ Localía invertida.'); } }, '⇄ Localía'));
}

// Elegir la fecha destino: las que no se pueden explican por qué (p. ej. "X ya juega en la Fecha 3").
function openMoveSheet(s, tour, m) {
  const rounds = [...new Set(tour.matches.filter((x) => x.stage !== 'ko').map((x) => x.round))].sort((a, b) => a - b);
  const options = [...rounds, rounds.at(-1) + 1];
  openSheet('Mover partido', (close) => h('div', {},
    h('p', { class: 'center' }, teamTag(teamById(s, m.homeId), 20), ' vs ', teamTag(teamById(s, m.awayId), 20)),
    h('p', { class: 'muted center small-note' }, `Ahora está en la Fecha ${m.round}.`),
    h('div', { class: 'stack move-list' }, options.map((r) => {
      const why = store.checkMove(tour.id, m.id, r);
      const isNew = r > rounds.at(-1);
      return h('button', {
        class: `move-opt ${why ? 'ghost' : ''}`, disabled: !!why,
        onclick: () => {
          const msg = store.moveMatch(tour.id, m.id, r);
          if (msg) { toast(`⚠ ${msg}`); return; }
          // Las fechas se renumeran si alguna quedó vacía: se lee dónde quedó.
          const now = store.get().tournaments.find((x) => x.id === tour.id).matches.find((x) => x.id === m.id).round;
          close(); toast(`📅 Movido a la Fecha ${now}.`);
        },
      }, h('strong', {}, isNew ? '＋ Fecha nueva' : `Fecha ${r}`), why ? h('span', { class: 'move-why' }, r === m.round ? 'Está acá' : why) : null);
    }))));
}

function playoffsCard(s, tour) {
  if (!['league_cup', 'groups'].includes(tour.format)) return null;
  if (tour.playoffsStarted) {
    return h('section', { class: 'card center' }, h('p', {}, 'La fase de liga terminó y el cuadro está en juego.'),
      h('a', { class: 'btn', href: '#/cuadro' }, '🏆 Ver el cuadro'));
  }
  const pending = tour.matches.filter((m) => m.stage !== 'ko' && !m.played).length;
  return h('section', { class: 'card center' },
    h('p', { class: pending ? 'muted' : '' }, pending
      ? `El cuadro se arma cuando termine la fase de liga. ${missing(pending, 'F')}.`
      : 'La fase de liga terminó. Ya podés armar el cuadro con los clasificados.'),
    store.isLocked() ? null : h('button', { disabled: pending > 0, onclick: () => { if (store.startPlayoffs(tour.id)) { toast('🏆 Cuadro armado.'); location.hash = '#/cuadro'; } } }, 'Armar el cuadro'));
}

export function noTournaments(s) {
  // Quien solo mira (no es el admin): un aviso, sin botones que no puede usar.
  if (store.isLocked()) {
    return emptyCard('Bienvenido a Fulbito FC', 'Todavía no hay campeonatos cargados. Cuando el organizador los cargue, los vas a ver acá.');
  }
  if (!s.teams.length) {
    return emptyCard('Bienvenido a Fulbito FC', 'Creá tus equipos, armá un campeonato y llevá la tabla, el cuadro y las estadísticas.',
      h('a', { class: 'btn', href: '#/equipos' }, '👥 Crear equipos'),
      h('button', { class: 'ghost', onclick: () => { store.loadDemo(); toast('Datos de ejemplo cargados.'); } }, '🧪 Ver con datos de ejemplo'));
  }
  return emptyCard('Todavía no hay campeonatos', s.teams.length < 2 ? 'Necesitás al menos dos equipos para armar uno.' : 'Armá el primero con tus equipos.',
    s.teams.length < 2 ? h('a', { class: 'btn', href: '#/equipos' }, '👥 Ir a Equipos') : h('button', { onclick: openTournamentForm }, '🏆 Nuevo campeonato'));
}

export function renderFixture(root) {
  const s = store.get();
  const tour = store.current();
  if (!tour) { fill(root, h('h1', { class: 'page-title' }, 'Fixture y tablas'), noTournaments(s)); return; }
  const st = tournamentStatus(tour, s.teams);
  const groups = tour.groups ?? [];
  const cutoff = tour.format === 'league' ? 0 : tour.advance ?? 0;
  fill(root,
    h('h1', { class: 'page-title' }, 'Fixture y tablas'),
    tournamentPicker(s, { onNew: openTournamentForm }),
    tourHeader(s, tour),
    tour.format === 'cup'
      ? h('section', { class: 'card center' },
        h('p', {}, 'Este campeonato es por eliminación directa: no tiene tabla.'),
        h('a', { class: 'btn', href: '#/cuadro' }, '🏆 Ver el cuadro'))
      : [
        groups.map((g, gi) => h('section', { class: 'group-box' },
          groups.length > 1 ? h('h2', { class: 'list-heading' }, g.name) : h('h2', { class: 'list-heading' }, 'Tabla de posiciones'),
          standingsTable(s, tour, g, gi, cutoff, st.finished))),
        cutoff ? h('p', { class: 'legend muted' }, h('span', { class: 'zone-dot ko', 'aria-hidden': 'true' }), ` Clasifican al cuadro: ${groups.length > 1 ? `los ${cutoff} primeros de cada grupo` : `los ${cutoff} primeros`}`) : null,
        playoffsCard(s, tour),
        roundsBox(s, tour),
      ]);
}
