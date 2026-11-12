// Pestaña "Campeones": palmarés por equipo y cada campeonato con su podio, goleador y figura.
import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { crestEl, teamTag } from '../crest.js';
import { playerAvatar } from '../avatar.js';
import { allMatches, tournamentStatus, topScorers, playerTotals, rankPlayers } from '../domain/stats.js';
import { openTeamSheet, openPlayerSheet, titlesByTeam } from './sheets.js';
import { teamById, tourTitle, FORMAT_LABELS, emptyCard, missing } from './common.js';

function awardLine(s, icon, label, players, value, unit) {
  if (!players.length) return null;
  return h('div', { class: 'award-line' },
    h('span', { class: 'aw-ico', 'aria-hidden': 'true' }, icon),
    h('span', { class: 'muted' }, label),
    // Con muchos empatados se muestran tres y "+N" (el resto está en Equipos y estadísticas).
    h('span', { class: 'aw-who' }, players.slice(0, 3).map((p) => h('button', { class: 'linklike inline', onclick: () => openPlayerSheet(p.id) },
      playerAvatar(p, 28, 'bust', teamById(s, p.teamId)), p.nickname || p.name)),
    players.length > 3 ? h('span', { class: 'muted more', title: players.slice(3).map((p) => p.nickname || p.name).join(', ') }, `+${players.length - 3}`) : null),
    h('b', { class: 'aw-val' }, `${value} ${unit}`));
}

function tourCard(s, t) {
  const st = tournamentStatus(t, s.teams);
  const ms = allMatches(s.tournaments, t.id);
  const scorers = topScorers(s.players, ms);
  const mvps = rankPlayers(s.players, playerTotals(s.players, ms), 'mvp');
  const bestMvp = mvps.filter((r) => r.pos === 1).map((r) => r.player);
  const champ = teamById(s, st.first);
  return h('article', { class: `card champ-card ${st.finished ? 'done' : 'live'}` },
    h('div', { class: 'row' },
      h('div', { class: 'grow' }, h('h2', { class: 'card-title' }, tourTitle(t)), h('span', { class: 'tag' }, FORMAT_LABELS[t.format])),
      st.finished ? null : h('span', { class: 'tag live' }, 'En juego')),
    champ
      ? h('button', { class: 'champ-big linklike', onclick: () => openTeamSheet(champ.id), 'aria-label': `Campeón: ${champ.name}` },
        h('span', { class: 'champ-kicker' }, '🏆 Campeón'), crestEl(champ, 64), h('strong', { class: 'champ-name' }, champ.name))
      : h('p', { class: 'muted center' }, st.pending ? `${missing(st.pending, 'F')} para conocer al campeón.` : 'Campeón a confirmar.'),
    st.finished ? h('div', { class: 'row wrap center' },
      st.second ? h('span', { class: 'runner' }, '🥈 ', teamTag(teamById(s, st.second), 20)) : null,
      st.third ? h('span', { class: 'runner' }, '🥉 ', teamTag(teamById(s, st.third), 20)) : null) : null,
    awardLine(s, '⚽', st.finished ? 'Goleador' : 'Goleador por ahora', scorers.players, scorers.goals, scorers.goals === 1 ? 'gol' : 'goles'),
    bestMvp.length ? awardLine(s, '👑', 'Más veces figura', bestMvp, mvps[0].value, mvps[0].value === 1 ? 'vez' : 'veces') : null);
}

export function renderChampions(root) {
  const s = store.get();
  if (!s.tournaments.length) {
    fill(root, h('h1', { class: 'page-title' }, 'Campeones'),
      emptyCard('Sin campeones todavía', 'Cuando termine un campeonato, acá queda su campeón, el goleador y la figura.',
        h('a', { class: 'btn', href: '#/fixture' }, '📋 Ir a Fixture y tablas')));
    return;
  }
  const titles = titlesByTeam(s);
  const palmares = Object.entries(titles).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ team: teamById(s, id), n })).filter((x) => x.team);
  const list = [...s.tournaments].reverse();
  fill(root,
    h('h1', { class: 'page-title' }, 'Campeones'),
    palmares.length ? h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'Palmarés'),
      h('ol', { class: 'rank-list palmares' }, palmares.map(({ team, n }, i) => h('li', {},
        h('span', { class: 'rpos' }, `${i + 1}°`),
        h('button', { class: 'linklike inline', onclick: () => openTeamSheet(team.id) }, crestEl(team, 28), h('strong', {}, team.name)),
        h('span', { class: 'rval' }, '🏆'.repeat(Math.min(n, 5)), n > 5 ? ` ×${n}` : '', h('span', { class: 'sr-only' }, ` ${n} títulos`)))))) : null,
    list.map((t) => tourCard(s, t)));
}
