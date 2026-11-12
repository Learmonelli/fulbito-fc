// Fichas de equipo y de jugador, y sus formularios (alta y edición).
import { h } from '../dom.js';
import { store, PATTERNS } from '../store.js';
import { crestEl, fileToLogo, PATTERN_LABELS, teamTag } from '../crest.js';
import { playerAvatar, teamKit } from '../avatar.js';
import { faceEditor } from '../ui/faceEditor.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { playerName } from '../ui/playerName.js';
import { allMatches, friendlyMatches, playerTotals, teamTotals, teamHistory, tournamentStatus, playerStreaks, streakLabel } from '../domain/stats.js';
import { scoreText } from '../logic/bracket.js';
import { teamById, tourTitle, fmtDate } from './common.js';

const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);
const friendliesOf = (s, teamId) => s.friendlies.filter((f) => f.teamId === teamId && f.played).length;
// La hoja de amistoso vive en friendlies.js; se conecta desde main.js para no crear un ciclo de imports.
let onNewFriendly = () => {};
export const setFriendlyLauncher = (fn) => { onNewFriendly = fn; };
const stat = (label, value) => h('div', { class: 'stat' }, h('b', {}, String(value)), h('span', {}, label));
const RES = { W: ['win', 'G', 'Ganó'], D: ['draw', 'E', 'Empató'], L: ['loss', 'P', 'Perdió'] };

// Etiqueta de racha actual ("🔥 4 victorias seguidas"), o nada si no hay racha que contar.
export function streakBadge(st) {
  const lb = streakLabel(st);
  return lb ? h('span', { class: `streak ${lb.kind}`, title: 'Racha actual' }, `${lb.icon} ${lb.text}`) : null;
}

// Récords de rachas: mejor racha de victorias, sin perder y de derrotas.
const streakRecords = (st) => h('div', { class: 'streak-records' },
  h('span', {}, `🔥 ${st.best.wins} victorias`), h('span', {}, `🛡️ ${st.best.unbeaten} sin perder`), h('span', {}, `🥶 ${st.best.losses} derrotas`));

export const formDots = (form) => h('span', { class: 'form-dots', 'aria-label': `Últimos resultados: ${form.map((r) => RES[r][2]).join(', ') || 'sin partidos'}` },
  form.map((r) => h('span', { class: `res ${RES[r][0]}`, 'aria-hidden': 'true' }, RES[r][1])));

// Títulos ganados por cada equipo (campeonatos terminados).
export function titlesByTeam(s) {
  const out = {};
  for (const t of s.tournaments) {
    const st = tournamentStatus(t, s.teams);
    if (st.finished && st.first) out[st.first] = (out[st.first] || 0) + 1;
  }
  return out;
}

// ---- Equipo ----
export function openTeamSheet(teamId) {
  const s = store.get();
  const team = teamById(s, teamId);
  if (!team) return null;
  return openSheet(team.name, (close) => {
    const matches = allMatches(s.tournaments);
    const tt = teamTotals(s.teams, matches)[team.id];
    const players = s.players.filter((p) => p.teamId === team.id);
    const pt = playerTotals(players, matches);
    const titles = titlesByTeam(s)[team.id] || 0;
    const hist = teamHistory(team.id, matches).slice(0, 8);
    return h('div', { class: 'team-sheet' },
      h('div', { class: 'player-head' }, crestEl(team, 72),
        h('div', {}, h('strong', { class: 'player-name' }, team.name),
          titles ? h('p', { class: 'champ-line' }, `🏆 ${titles} título${titles === 1 ? '' : 's'}`) : null,
          tt.form.length ? h('span', { class: 'form-line' }, formDots(tt.form), streakBadge(tt.streak)) : null)),
      h('div', { class: 'stats-grid' },
        stat('PJ', tt.pj), stat('Ganados', tt.w), stat('Empates', tt.d), stat('Perdidos', tt.l),
        stat('GF', tt.gf), stat('GC', tt.gc)),
      tt.pj ? [h('h3', { class: 'list-heading' }, 'Mejores rachas'), streakRecords(tt.streak)] : null,
      h('h3', { class: 'list-heading' }, `Plantel (${players.length})`),
      players.length
        ? h('ul', { class: 'plist' }, players.map((p) => h('li', {}, h('button', {
          class: 'prow linklike inline', onclick: () => { close(); openPlayerSheet(p.id); },
          'aria-label': `${p.name}, ver ficha`,
        },
        playerAvatar(p, 44, 'body', team), h('span', { class: 'pinfo' }, playerName(p),
          h('span', { class: 'counts' }, `PJ ${pt[p.id].pj} · ⚽ ${pt[p.id].goals} · 🤝 ${pt[p.id].assists} · 👑 ${pt[p.id].mvp}`))))))
        : h('p', { class: 'muted' }, 'Todavía no tiene jugadores.'),
      h('div', { class: 'row wrap' },
        h('button', { onclick: () => { close(); openPlayerForm(team.id); } }, '＋ Sumar jugador'),
        h('button', { class: 'ghost', onclick: () => { close(); openTeamForm(team.id); } }, '✏️ Escudo y colores'),
        players.length >= 2 ? h('button', { class: 'ghost', onclick: () => { close(); onNewFriendly(team.id); } }, '🤝 Amistoso') : null),
      friendliesOf(s, team.id) ? h('p', { class: 'muted small-note' }, `🤝 ${friendliesOf(s, team.id)} amistoso${friendliesOf(s, team.id) === 1 ? '' : 's'} jugado${friendliesOf(s, team.id) === 1 ? '' : 's'} (aparte de los campeonatos).`) : null,
      hist.length ? [
        h('h3', { class: 'list-heading' }, 'Últimos partidos'),
        h('ul', { class: 'history' }, hist.map(({ match: m, side, result }) => {
          const rival = teamById(s, side === 'home' ? m.awayId : m.homeId);
          return h('li', {}, h('span', { class: `res ${RES[result][0]}`, 'aria-label': RES[result][2] }, RES[result][1]),
            h('span', { class: 'grow' }, 'vs ', teamTag(rival, 18),
              h('span', { class: 'muted small-note' }, ` · ${m.tournamentName} · ${m.label}${m.date ? ` · ${fmtDate(m.date)}` : ''}`)),
            h('b', {}, scoreText(m)));
        })),
      ] : null);
  });
}

// Alta o edición de equipo: nombre, colores, diseño del escudo y logo propio.
export function openTeamForm(teamId = null) {
  const s = store.get();
  const team = teamId ? teamById(s, teamId) : null;
  const draft = team ? { ...team } : { name: '', color1: '#1f4fbf', color2: '#b8f03c', pattern: 'halves', logo: '' };
  return openSheet(team ? `Editar ${team.name}` : 'Nuevo equipo', (close) => {
    const preview = h('div', { class: 'crest-preview' });
    const paint = () => preview.replaceChildren(crestEl({ ...draft, name: draft.name || 'Equipo' }, 84));
    const name = h('input', { type: 'text', maxlength: 60, value: draft.name, placeholder: 'Ej: Deportivo Asado', 'aria-label': 'Nombre del equipo', oninput: (e) => { draft.name = e.target.value; paint(); } });
    const c1 = h('input', { type: 'color', value: draft.color1, 'aria-label': 'Color principal', oninput: (e) => { draft.color1 = e.target.value; paint(); } });
    const c2 = h('input', { type: 'color', value: draft.color2, 'aria-label': 'Color secundario', oninput: (e) => { draft.color2 = e.target.value; paint(); } });
    const pats = PATTERNS.map((p) => h('button', {
      type: 'button', class: `face-pill ${draft.pattern === p ? 'on' : ''}`, 'aria-pressed': String(draft.pattern === p),
      onclick: (e) => {
        draft.pattern = p; paint();
        e.currentTarget.parentElement.querySelectorAll('.face-pill').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      },
    }, PATTERN_LABELS[p]));
    const err = h('p', { class: 'error', role: 'alert' });
    const file = h('input', {
      type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'sr-only',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try { draft.logo = await fileToLogo(f); paint(); } catch (ex) { err.textContent = ex.message; }
      },
    });
    paint();
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        err.textContent = '';
        if (team) {
          store.updateTeam(team.id, draft);
          close(); toast('Equipo actualizado.');
        } else {
          const t = store.addTeam(draft.name, draft);
          if (!t) { err.textContent = 'Poné un nombre que no esté repetido.'; return; }
          close(); toast(`${t.name} creado. Ahora sumale jugadores.`); openTeamSheet(t.id);
        }
      },
    },
    h('div', { class: 'club-head' }, preview, h('div', { class: 'grow' }, field('Nombre', name),
      h('div', { class: 'row' }, field('Principal', c1), field('Secundario', c2)))),
    h('div', { class: 'face-row', role: 'group', 'aria-label': 'Diseño del escudo' }, h('span', { class: 'face-lbl' }, 'Diseño'), pats),
    h('div', { class: 'row wrap' },
      h('label', { class: 'btn ghost' }, '🖼 Subir escudo propio', file),
      h('button', { type: 'button', class: 'ghost', onclick: () => { draft.logo = ''; paint(); } }, 'Usar escudo pixel')),
    err,
    h('div', { class: 'row wrap end sticky-actions' },
      team ? h('button', { type: 'button', class: 'danger', onclick: async () => {
        if (store.teamInUse(team.id)) { err.textContent = 'No se puede borrar: juega en un campeonato. Borrá antes ese campeonato.'; return; }
        const ok = await confirmDialog(`Se borra ${team.name} con su plantel.`, { okLabel: 'Borrar', danger: true });
        if (ok && store.deleteTeam(team.id)) { close(); toast('Equipo borrado.'); }
      } }, 'Borrar equipo') : null,
      h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'),
      h('button', { type: 'submit' }, team ? 'Guardar' : 'Crear equipo')));
  });
}

// ---- Jugador ----
export function openPlayerSheet(playerId) {
  const s = store.get();
  const p = s.players.find((x) => x.id === playerId);
  if (!p) return null;
  const team = teamById(s, p.teamId);
  return openSheet(p.nickname || p.name, (close) => {
    const tot = playerTotals([p], allMatches(s.tournaments))[p.id];
    const fr = playerTotals([p], friendlyMatches(s.friendlies))[p.id];
    const byTour = s.tournaments.map((t) => ({ t, st: playerTotals([p], allMatches(s.tournaments, t.id))[p.id] }))
      .filter((x) => x.st.pj);
    // Equipos para los que jugó (sale de los partidos: si cambió de equipo, aparecen los dos).
    const clubs = new Map();
    for (const m of allMatches(s.tournaments)) {
      const side = m.played && !m.bye ? m.lineup?.[p.id] : null;
      if (!side) continue;
      const tid = side === 'home' ? m.homeId : m.awayId;
      clubs.set(tid, (clubs.get(tid) || 0) + 1);
    }
    const history = [...clubs].map(([tid, n]) => ({ team: teamById(s, tid), n })).filter((x) => x.team);
    // Campeonatos y amistosos van en bloques separados: nunca se suman.
    const grid = (st, sk) => [h('div', { class: 'stats-grid' },
      stat('PJ', st.pj), stat('Goles', st.goals), stat('Asist.', st.assists), stat('Figura', st.mvp),
      stat('🟨', st.yellow), stat('🟥', st.red), stat('G-E-P', `${st.w}-${st.d}-${st.l}`)),
    st.pj ? h('div', { class: 'row wrap' }, streakBadge(sk), streakRecords(sk)) : null];
    const skOff = playerStreaks([p], allMatches(s.tournaments))[p.id];
    const skFr = playerStreaks([p], friendlyMatches(s.friendlies))[p.id];
    return h('div', { class: 'player-sheet' },
      h('div', { class: 'player-head' },
        playerAvatar(p, 110, 'body', team),
        h('div', {}, playerName(p),
          team ? h('p', { class: 'team-line' }, teamTag(team, 20)) : null)),
      h('h3', { class: 'list-heading' }, '🏆 En campeonatos'),
      grid(tot, skOff),
      history.length > 1 || (history.length === 1 && history[0].team.id !== p.teamId)
        ? h('div', { class: 'clubs' }, h('span', { class: 'muted' }, 'Jugó para: '),
          history.map(({ team: t, n }) => h('span', { class: 'club-chip' }, teamTag(t, 16), h('span', { class: 'muted' }, ` ${n} PJ`))))
        : null,
      fr.pj ? [h('h3', { class: 'list-heading' }, '🤝 En amistosos'), grid(fr, skFr)] : null,
      byTour.length ? [
        h('h3', { class: 'list-heading' }, 'Por campeonato'),
        h('div', { class: 'table-wrap card' }, h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Campeonato'), ['PJ', '⚽', '🤝', '👑', '🟨', '🟥'].map((x) => h('th', { scope: 'col' }, x)))),
          h('tbody', {}, byTour.map(({ t, st }) => h('tr', {}, h('th', { scope: 'row' }, tourTitle(t)),
            [st.pj, st.goals, st.assists, st.mvp, st.yellow, st.red].map((v) => h('td', {}, String(v)))))))),
      ] : h('p', { class: 'muted' }, 'Todavía no jugó partidos.'),
      h('div', { class: 'row wrap' },
        h('button', { onclick: () => { close(); openPlayerForm(p.teamId, p.id); } }, '✏️ Editar jugador'),
        team ? h('button', { class: 'ghost', onclick: () => { close(); openTeamSheet(team.id); } }, `Ver ${team.name}`) : null));
  });
}

// Alta o edición de jugador: nombre, apodo, número, equipo y cara (la camiseta es la del equipo).
export function openPlayerForm(teamId, playerId = null) {
  const s = store.get();
  const p = playerId ? s.players.find((x) => x.id === playerId) : null;
  let team = teamById(s, p?.teamId ?? teamId);
  if (!team) return null;
  const seed = p?.id ?? `nuevo-${Date.now()}`;
  return openSheet(p ? `Editar ${p.nickname || p.name}` : `Nuevo jugador de ${team.name}`, (close) => {
    const name = h('input', { type: 'text', maxlength: 60, value: p?.name ?? '', placeholder: 'Nombre y apellido', 'aria-label': 'Nombre' });
    const nick = h('input', { type: 'text', maxlength: 30, value: p?.nickname ?? '', placeholder: 'Opcional', 'aria-label': 'Apodo' });
    const num = h('input', { type: 'number', min: 0, max: 99, inputmode: 'numeric', value: p?.number ?? '', class: 'num-field', 'aria-label': 'Número de camiseta' });
    const holder = h('div');
    let editor = faceEditor(seed, p?.face, teamKit(team));
    holder.append(editor.el);
    // Pase: elegir otro equipo cambia la camiseta de la vista previa.
    const teamBtns = s.teams.map((t) => h('button', {
      type: 'button', class: `face-pill ${t.id === team.id ? 'on' : ''}`, 'aria-pressed': String(t.id === team.id),
      onclick: (e) => {
        team = t;
        const face = editor.get();
        editor = faceEditor(seed, face, teamKit(team));
        holder.replaceChildren(editor.el);
        e.currentTarget.parentElement.querySelectorAll('.face-pill').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      },
    }, crestEl(t, 16), t.name));
    const err = h('p', { class: 'error', role: 'alert' });
    return h('form', {
      class: 'player-form',
      onsubmit: (e) => {
        e.preventDefault();
        err.textContent = '';
        if (!name.value.trim()) { err.textContent = 'Poné el nombre del jugador.'; name.focus(); return; }
        const data = { name: name.value, nickname: nick.value, number: num.value, face: editor.get() };
        if (p) { store.updatePlayer(p.id, { ...data, teamId: team.id }); close(); toast('Jugador actualizado.'); } else {
          const np = store.addPlayer(team.id, data);
          if (!np) { err.textContent = 'No se pudo crear el jugador.'; return; }
          close(); toast(`${np.nickname || np.name} se sumó a ${team.name}.`); openTeamSheet(team.id);
        }
      },
    },
    holder,
    field('Nombre', name),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Apodo', nick)), field('Número', num)),
    h('p', { class: 'field-lbl' }, 'Equipo'),
    h('div', { class: 'face-row wrap-row', role: 'group', 'aria-label': 'Equipo' }, teamBtns),
    err,
    h('div', { class: 'row wrap end sticky-actions' },
      p ? h('button', { type: 'button', class: 'danger', onclick: async () => {
        if (store.playerInUse(p.id)) { err.textContent = 'No se puede borrar: ya jugó partidos y se perderían sus estadísticas.'; return; }
        const ok = await confirmDialog(`Se borra a ${p.name}.`, { okLabel: 'Borrar', danger: true });
        if (ok && store.deletePlayer(p.id)) { close(); toast('Jugador borrado.'); }
      } }, 'Borrar') : null,
      h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'),
      h('button', { type: 'submit' }, p ? 'Guardar' : 'Sumar jugador')));
  });
}
