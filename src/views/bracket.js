// Pestaña "Cuadro": eliminación directa por rondas (Octavos, Cuartos, Semis, Final), como Promiedos.
// Los cruces sin definir dicen "A confirmar".
import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { crestEl, teamTag } from '../crest.js';
import { winnerOf, scoreText } from '../logic/bracket.js';
import { tournamentStatus } from '../domain/stats.js';
import { toast } from '../ui/toast.js';
import { openMatchSheet } from './matchSheet.js';
import { openTournamentForm } from './tournamentForm.js';
import { tourHeader, noTournaments } from './fixture.js';
import { tournamentPicker, teamById, fmtDate, missing } from './common.js';

// Cantidad de rondas que va a tener el cuadro según los clasificados (para mostrar "A confirmar").
function previewRounds(tour) {
  const groups = tour.groups?.length ?? 1;
  let n = tour.format === 'groups' ? (tour.advance ?? 2) * groups : tour.advance ?? 2;
  let size = 2;
  while (size < n) size *= 2;
  n = size;
  const names = [];
  const total = Math.log2(n);
  for (let r = 1; r <= total; r++) {
    const left = total - r;
    names.push([left === 0 ? 'Final' : left === 1 ? 'Semifinal' : left === 2 ? 'Cuartos de final' : left === 3 ? 'Octavos de final' : `Ronda ${r}`, n / 2 ** r]);
  }
  return names;
}

function koCard(s, tour, m) {
  if (m.bye) {
    return h('div', { class: 'ko-card bye' }, teamTag(teamById(s, m.homeId || m.awayId), 24), h('span', { class: 'muted small-note' }, 'Pasa directo'));
  }
  const w = winnerOf(m);
  const ready = !!(m.homeId && m.awayId);
  const goals = (side) => {
    if (!m.played) return '';
    const g = side === 'home' ? m.homeGoals : m.awayGoals;
    const p = side === 'home' ? m.penHome : m.penAway;
    return p != null && m.homeGoals === m.awayGoals ? `${g} (${p})` : String(g);
  };
  const line = (id, side) => h('div', { class: `ko-side ${w && w === id ? 'winner' : ''} ${w && w !== id ? 'loser' : ''}` },
    teamTag(teamById(s, id), 24), h('b', { class: 'ko-goals' }, goals(side)));
  return h('button', {
    class: `ko-card ${m.played ? 'played' : ''}`, disabled: !ready,
    'aria-label': ready ? `${teamById(s, m.homeId).name} contra ${teamById(s, m.awayId).name}, ${m.played ? scoreText(m) : 'sin jugar'}` : 'Cruce a confirmar',
    onclick: () => openMatchSheet(tour.id, m.id),
  },
  line(m.homeId, 'home'), line(m.awayId, 'away'),
  !m.played ? h('span', { class: 'ko-when muted' }, m.date ? fmtDate(m.date) : ready ? 'Por jugar' : 'A confirmar') : null);
}

function championBanner(s, tour) {
  const st = tournamentStatus(tour, s.teams);
  if (!st.first) return null;
  const [first, second, third] = [st.first, st.second, st.third].map((id) => teamById(s, id));
  return h('section', { class: 'card champion' },
    h('p', { class: 'champ-kicker' }, '🏆 Campeón'),
    crestEl(first, 72), h('h2', { class: 'champ-name' }, first.name),
    h('div', { class: 'row wrap center' },
      second ? h('span', { class: 'runner' }, '🥈 ', teamTag(second, 20)) : null,
      third ? h('span', { class: 'runner' }, '🥉 ', teamTag(third, 20)) : null));
}

export function renderBracket(root) {
  const s = store.get();
  const tour = store.current();
  if (!tour) { fill(root, h('h1', { class: 'page-title' }, 'Cuadro'), noTournaments(s)); return; }
  const ko = tour.matches.filter((m) => m.stage === 'ko');
  let body;
  if (tour.format === 'league') {
    body = h('section', { class: 'card center' }, h('p', {}, 'Este campeonato es solo liga: no tiene cuadro.'),
      h('a', { class: 'btn', href: '#/fixture' }, '📋 Ver la tabla'));
  } else if (!ko.length) {
    const pending = tour.matches.filter((m) => !m.played).length;
    body = [
      h('section', { class: 'card center' },
        h('p', { class: pending ? 'muted' : '' }, pending
          ? `El cuadro se arma cuando termine la fase de liga. ${missing(pending, 'F')}.`
          : 'La fase de liga terminó: ya se puede armar el cuadro.'),
        store.isLocked() ? null : h('button', { disabled: pending > 0, onclick: () => { if (store.startPlayoffs(tour.id)) toast('🏆 Cuadro armado.'); } }, 'Armar el cuadro')),
      h('div', { class: 'bracket' }, previewRounds(tour).map(([label, count]) => h('section', { class: 'ko-round' },
        h('h2', { class: 'list-heading' }, label),
        Array.from({ length: count }, () => h('div', { class: 'ko-card tbd' },
          h('div', { class: 'ko-side' }, teamTag(null)), h('div', { class: 'ko-side' }, teamTag(null))))))),
    ];
  } else {
    const rounds = [...new Set(ko.map((m) => m.round))].sort((a, b) => a - b);
    body = [
      championBanner(s, tour),
      h('div', { class: 'bracket' }, rounds.map((r) => {
        const ms = ko.filter((m) => m.round === r && !m.third).sort((a, b) => a.index - b.index);
        const third = ko.find((m) => m.round === r && m.third);
        return h('section', { class: 'ko-round' },
          h('h2', { class: 'list-heading' }, ms[0]?.label ?? `Ronda ${r}`),
          ms.map((m) => koCard(s, tour, m)),
          third ? [h('h3', { class: 'list-heading third-title' }, 'Tercer puesto'), koCard(s, tour, third)] : null);
      })),
    ];
  }
  fill(root,
    h('h1', { class: 'page-title' }, 'Cuadro'),
    tournamentPicker(s, { onNew: openTournamentForm }),
    tourHeader(s, tour),
    body);
}
