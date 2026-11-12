// Pestaña "Equipos y estadísticas": los equipos con su rendimiento y los rankings de jugadores
// (podio con laurel como Piel Morena). Se puede ver el campeonato actual o todos juntos.
import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { crestEl } from '../crest.js';
import { playerAvatar } from '../avatar.js';
import { podium } from '../ui/podium.js';
import { searchBox } from '../ui/searchbox.js';
import { playerName } from '../ui/playerName.js';
import { toast } from '../ui/toast.js';
import { collapsible } from '../collapsible.js';
import { allMatches, friendlyMatches, playerTotals, teamTotals, rankPlayers, playerStreaks } from '../domain/stats.js';
import { playerMatches } from '../search.js';
import { openTeamSheet, openTeamForm, openPlayerSheet, formDots, titlesByTeam, streakBadge } from './sheets.js';
import { teamById, tourTitle } from './common.js';

export const RANK_CATS = [
  ['goals', 'Goles'], ['assists', 'Asistencias'], ['mvp', '👑 Figuras'], ['unbeaten', '🛡️ Invicto'],
  ['yellow', '🟨 Amarillas'], ['red', '🟥 Rojas'],
];
const RANK_HELP = { unbeaten: 'Mejor racha de partidos seguidos sin perder (en los que jugó).' };
// kind: 'official' (campeonatos) o 'friendly' (amistosos). Las estadísticas nunca se mezclan.
const ui = { mode: 'teams', scope: 'current', cat: 'goals', q: '', kind: 'official' };
export function showFriendlyStats() { ui.kind = 'friendly'; ui.mode = 'players'; }

const seg = (label, options, value, onPick) => h('div', { class: 'seg-btns', role: 'group', 'aria-label': label },
  options.map(([v, text]) => h('button', {
    class: `seg-btn ${v === value ? 'on' : ''}`, 'aria-pressed': String(v === value), 'data-value': v, onclick: () => onPick(v),
  }, text)));

function teamsList(s, matches, rerender) {
  const tt = teamTotals(s.teams, matches);
  const titles = titlesByTeam(s);
  const order = [...s.teams].sort((a, b) => tt[b.id].pts - tt[a.id].pts || tt[b.id].dg - tt[a.id].dg || a.name.localeCompare(b.name, 'es'));
  return [
    h('div', { class: 'row wrap' },
      store.isLocked() ? null : h('button', { onclick: () => openTeamForm() }, '＋ Nuevo equipo'),
      !s.teams.length && !store.isLocked() ? h('button', { class: 'ghost', onclick: () => { store.loadDemo(); toast('Datos de ejemplo cargados.'); rerender(); } }, '🧪 Datos de ejemplo') : null),
    s.teams.length
      ? h('ul', { class: 'pgrid team-grid' }, order.map((t) => {
        const st = tt[t.id];
        const n = s.players.filter((p) => p.teamId === t.id).length;
        return h('li', {}, h('button', { class: 'pcard tcard', onclick: () => openTeamSheet(t.id), 'aria-label': `${t.name}, ver ficha` },
          crestEl(t, 44),
          h('span', { class: 'pc-main' },
            h('strong', {}, t.name, titles[t.id] ? h('span', { class: 'titles' }, ` 🏆${titles[t.id]}`) : null),
            h('span', { class: 'pc-stats' }, st.pj ? `${st.pj} PJ · ${st.w}G ${st.d}E ${st.l}P · ${st.gf}:${st.gc}` : `${n} jugador${n === 1 ? '' : 'es'} · sin partidos`),
            st.form.length ? h('span', { class: 'form-line' }, formDots(st.form), streakBadge(st.streak)) : null)));
      }))
      : h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'Todavía no hay equipos. Creá el primero.')),
  ];
}

function playersRanking(s, matches) {
  const totals = playerTotals(s.players, matches);
  // Racha invicta (mejor racha sin perder) como una categoría más del ranking.
  const ps = playerStreaks(s.players, matches);
  for (const p of s.players) totals[p.id].unbeaten = ps[p.id].best.unbeaten;
  const teamOf = (p) => teamById(s, p.teamId);
  const out = h('div', { class: 'rank-out' });
  const tableBox = h('div');
  const paint = () => {
    const q = ui.q.trim();
    const all = rankPlayers(s.players, totals, ui.cat);
    const rows = q ? all.filter((r) => playerMatches(r.player, teamOf(r.player), q)) : all;
    const label = RANK_CATS.find(([k]) => k === ui.cat)[1];
    const rest = q ? rows : all.slice(3);
    fill(out,
      RANK_HELP[ui.cat] ? h('p', { class: 'muted small-note' }, RANK_HELP[ui.cat]) : null,
      !all.length ? h('div', { class: 'card empty' }, h('p', {}, `Todavía nadie tiene ${label.replace(/^\S+\s/, '').toLowerCase()}.`))
        : q && !rows.length ? h('div', { class: 'card empty' }, h('p', {}, `"${q}" no está en este ranking.`))
          : [
            q ? null : podium(all, { cat: ui.cat, label, onOpen: (p) => openPlayerSheet(p.id), teamOf }),
            rest.length ? h('ul', { class: 'card rank-list' }, rest.map((r) => h('li', {},
              h('span', { class: 'rpos' }, `${r.pos}°`),
              h('button', { class: 'linklike inline', onclick: () => openPlayerSheet(r.player.id), 'aria-label': `${r.player.name}, ${r.value}, ver ficha` },
                playerAvatar(r.player, 36, 'bust', teamOf(r.player)), h('span', { class: 'pinfo' }, playerName(r.player),
                  teamOf(r.player) ? h('span', { class: 'counts' }, crestEl(teamOf(r.player), 14), ` ${teamOf(r.player).name}`) : null)),
              h('span', { class: 'rval' }, String(r.value))))) : null,
          ]);
    const ps = s.players.filter((p) => playerMatches(p, teamOf(p), q))
      .sort((a, b) => totals[b.id].goals - totals[a.id].goals || totals[b.id].pj - totals[a.id].pj || a.name.localeCompare(b.name, 'es'));
    const cols = [['PJ', 'Partidos', 'pj'], ['G', 'Goles', 'goals'], ['A', 'Asistencias', 'assists'], ['👑', 'Figuras', 'mvp'],
      ['🟨', 'Amarillas', 'yellow'], ['🟥', 'Rojas', 'red'], ['EC', 'Goles en contra', 'own']];
    fill(tableBox, collapsible('st:table', h('h2', { class: 'fold-h2' }, 'Tabla completa'),
      ps.length ? h('div', { class: 'card table-wrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Jugador'), cols.map(([ab, long]) => h('th', { scope: 'col' }, h('abbr', { title: long }, ab))))),
        h('tbody', {}, ps.map((p) => h('tr', {},
          h('th', { scope: 'row' }, h('button', { class: 'linklike inline', onclick: () => openPlayerSheet(p.id) },
            teamOf(p) ? crestEl(teamOf(p), 14) : null, p.nickname || p.name)),
          cols.map(([, , k]) => h('td', {}, String(totals[p.id][k]))))))))
        : h('p', { class: 'muted' }, 'Nadie coincide con la búsqueda.'),
      { cls: 'sec', force: !!q }));
  };
  paint();
  return [
    h('div', { class: 'chips', role: 'group', 'aria-label': 'Categoría' }, RANK_CATS.map(([k, label]) => h('button', {
      class: `chip-btn ${k === ui.cat ? 'on' : ''}`, 'data-cat': k, 'aria-pressed': String(k === ui.cat),
      onclick: (e) => {
        ui.cat = k;
        e.currentTarget.parentElement.querySelectorAll('.chip-btn').forEach((b) => { const on = b.dataset.cat === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
        paint();
      },
    }, label))),
    searchBox({ value: ui.q, placeholder: 'Buscar jugador o equipo', label: 'Buscar jugador', onInput: (v) => { ui.q = v; paint(); } }),
    out, tableBox,
  ];
}

// Equipos en modo amistosos: cuántos jugaron y el último resultado (sin tabla de puntos).
function friendlyTeamsList(s) {
  const hosts = s.teams.filter((t) => s.friendlies.some((f) => f.teamId === t.id && f.played));
  if (!hosts.length) return h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'Todavía no hay amistosos cargados.'), h('a', { class: 'btn', href: '#/amistosos' }, '🤝 Ir a Amistosos'));
  return h('ul', { class: 'pgrid team-grid' }, hosts.map((t) => {
    const fs = s.friendlies.filter((f) => f.teamId === t.id && f.played);
    const goals = fs.reduce((n, f) => n + f.homeGoals + f.awayGoals, 0);
    return h('li', {}, h('button', { class: 'pcard tcard', onclick: () => openTeamSheet(t.id), 'aria-label': `${t.name}, ver ficha` },
      crestEl(t, 44),
      h('span', { class: 'pc-main' }, h('strong', {}, t.name),
        h('span', { class: 'pc-stats' }, `${fs.length} amistoso${fs.length === 1 ? '' : 's'} · ${goals} goles · ${(goals / fs.length).toFixed(1).replace('.', ',')} por partido`))));
  }));
}

export function renderTeams(root) {
  const s = store.get();
  const tour = store.current();
  const rerender = () => renderTeams(root);
  const friendly = ui.kind === 'friendly';
  const scoped = ui.scope === 'current' && tour;
  const matches = friendly ? friendlyMatches(s.friendlies) : allMatches(s.tournaments, scoped ? tour.id : null);
  fill(root,
    h('h1', { class: 'page-title' }, 'Equipos y estadísticas'),
    seg('Tipo de partidos', [['official', '🏆 Campeonatos'], ['friendly', '🤝 Amistosos']], ui.kind, (v) => { ui.kind = v; rerender(); }),
    h('div', { class: 'row wrap' },
      seg('Ver', [['teams', '👥 Equipos'], ['players', '⚽ Jugadores']], ui.mode, (v) => { ui.mode = v; rerender(); }),
      tour && !friendly ? seg('Alcance', [['current', tourTitle(tour)], ['all', 'Todos']], ui.scope, (v) => { ui.scope = v; rerender(); }) : null),
    friendly ? h('p', { class: 'muted small-note' }, 'Solo amistosos: no se mezclan con los campeonatos.') : null,
    ui.mode === 'teams'
      ? (friendly ? friendlyTeamsList(s) : teamsList(s, matches, rerender))
      : playersRanking(s, matches));
}
