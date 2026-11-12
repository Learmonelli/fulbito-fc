// Pestaña "Amistosos": partidos internos de un equipo (su plantel partido en dos lados, con
// invitados de otros equipos si hace falta). Se registran aparte: no suman en tablas ni cuadros,
// y sus estadísticas se ven en "Equipos y estadísticas" eligiendo 🤝 Amistosos.
import { h, fill } from '../dom.js';
import { store } from '../store.js';
import { crestEl, teamTag } from '../crest.js';
import { playerAvatar } from '../avatar.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { playerName } from '../ui/playerName.js';
import { searchBox } from '../ui/searchbox.js';
import { eventGoals } from '../domain/stats.js';
import { playerMatches } from '../search.js';
import { teamById, stepper, fmtDate, emptyCard } from './common.js';
import { showFriendlyStats } from './teams.js';

const count = (events, pid, type) => events.filter((e) => e.playerId === pid && e.type === type).length;
const field = (label, input) => h('label', { class: 'field' }, h('span', {}, label), input);

// ---- Crear ----
export function openFriendlyForm(teamId = null) {
  const s = store.get();
  if (!s.teams.length) { toast('Primero creá un equipo en Equipos.'); location.hash = '#/equipos'; return null; }
  return openSheet('Nuevo amistoso', (close) => {
    let chosen = teamById(s, teamId) ?? s.teams[0];
    const homeName = h('input', { type: 'text', maxlength: 24, value: 'Claros', 'aria-label': 'Nombre del lado A' });
    const awayName = h('input', { type: 'text', maxlength: 24, value: 'Oscuros', 'aria-label': 'Nombre del lado B' });
    const date = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10), 'aria-label': 'Fecha' });
    const pills = s.teams.map((t) => h('button', {
      type: 'button', class: `face-pill ${t.id === chosen.id ? 'on' : ''}`, 'aria-pressed': String(t.id === chosen.id),
      onclick: (e) => {
        chosen = t;
        e.currentTarget.parentElement.querySelectorAll('.face-pill').forEach((b) => { const on = b === e.currentTarget; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      },
    }, crestEl(t, 16), t.name));
    return h('form', {
      onsubmit: (e) => {
        e.preventDefault();
        const f = store.addFriendly(chosen.id, { homeName: homeName.value, awayName: awayName.value, date: date.value });
        if (!f) { toast('No se pudo crear el amistoso.'); return; }
        close();
        location.hash = '#/amistosos';
        openFriendlySheet(f.id, { shuffle: true });
      },
    },
    h('p', { class: 'field-lbl' }, 'Equipo'),
    h('div', { class: 'face-row wrap-row', role: 'group', 'aria-label': 'Equipo' }, pills),
    h('div', { class: 'row' }, h('div', { class: 'grow' }, field('Lado A', homeName)), h('div', { class: 'grow' }, field('Lado B', awayName))),
    field('Fecha', date),
    h('p', { class: 'muted small-note' }, 'Después repartís el plantel en los dos lados (o lo sorteás) y podés sumar invitados.'),
    h('div', { class: 'row end sticky-actions' },
      h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'),
      h('button', { type: 'submit' }, 'Armar equipos')));
  });
}

// ---- Cargar / editar ----
export function openFriendlySheet(id, { shuffle = false } = {}) {
  const s = store.get();
  const f = s.friendlies.find((x) => x.id === id);
  if (!f) return null;
  const host = teamById(s, f.teamId);
  return openSheet(`Amistoso de ${host.name}`, (close) => {
    const draft = {
      homeName: f.homeName, awayName: f.awayName, date: f.date, homeGoals: f.homeGoals, awayGoals: f.awayGoals,
      sides: { ...f.lineup }, rows: {}, mvp: f.events.find((e) => e.type === 'mvp')?.playerId ?? null,
    };
    // Invitados: jugadores de otros equipos que ya estaban en este amistoso.
    const guests = new Set(Object.keys(f.lineup).filter((pid) => s.players.find((p) => p.id === pid)?.teamId !== host.id));
    const rowOf = (pid) => {
      if (!draft.rows[pid]) {
        draft.rows[pid] = {
          goal: count(f.events, pid, 'goal'), assist: count(f.events, pid, 'assist'),
          yellow: count(f.events, pid, 'yellow') > 0, red: count(f.events, pid, 'red') > 0, own: count(f.events, pid, 'own') > 0,
        };
      }
      return draft.rows[pid];
    };
    const people = () => [...s.players.filter((p) => p.teamId === host.id), ...s.players.filter((p) => guests.has(p.id))];
    const teamOf = (p) => teamById(s, p.teamId);

    // Sorteo parejo del plantel (los invitados también entran).
    const draw = () => {
      const ps = [...people()].sort(() => Math.random() - 0.5);
      draft.sides = {};
      ps.forEach((p, i) => { draft.sides[p.id] = i % 2 ? 'away' : 'home'; });
    };
    if (shuffle && !Object.keys(draft.sides).length) draw();

    const err = h('p', { class: 'error', role: 'alert' });
    const note = h('p', { class: 'muted small-note center' });
    const teamsBox = h('div', { class: 'teams-box' });
    const detailBox = h('div');
    const scoreBox = h('div', { class: 'card board scoreboard' });

    const toEvents = () => {
      const events = []; const lineup = {};
      for (const [pid, side] of Object.entries(draft.sides)) {
        if (side !== 'home' && side !== 'away') continue;
        lineup[pid] = side;
        const r = rowOf(pid);
        for (let i = 0; i < r.goal; i++) events.push({ playerId: pid, type: 'goal' });
        for (let i = 0; i < r.assist; i++) events.push({ playerId: pid, type: 'assist' });
        if (r.yellow) events.push({ playerId: pid, type: 'yellow' });
        if (r.red) events.push({ playerId: pid, type: 'red' });
        if (r.own) events.push({ playerId: pid, type: 'own' });
      }
      if (draft.mvp && lineup[draft.mvp]) events.push({ playerId: draft.mvp, type: 'mvp' });
      return { events, lineup };
    };
    const paintNote = () => {
      const { events, lineup } = toEvents();
      const g = eventGoals(events, lineup);
      const over = g.home > draft.homeGoals || g.away > draft.awayGoals;
      note.textContent = over ? '⚠ Hay más goles por jugador que en el marcador.'
        : `Goles con autor: ${g.home} de ${draft.homeGoals} · ${g.away} de ${draft.awayGoals}`;
      note.classList.toggle('warn', over);
    };

    // Lado A / Lado B / no juega, como "Armar equipos" de Piel Morena.
    const sideSeg = (p) => {
      const opts = [['home', draft.homeName || 'A', 'side-A'], ['away', draft.awayName || 'B', 'side-B'], ['', '—', 'side-none']];
      return h('div', { class: 'seg-btns', role: 'group', 'aria-label': `Lado de ${p.name}` }, opts.map(([v, label, cls]) => {
        const on = (draft.sides[p.id] ?? '') === v;
        return h('button', {
          type: 'button', class: `seg-btn ${cls} ${on ? 'on' : ''}`, 'aria-pressed': String(on),
          onclick: () => { if (v) draft.sides[p.id] = v; else delete draft.sides[p.id]; paintAll(); },
        }, label);
      }));
    };

    // Buscador de invitados (jugadores de otros equipos).
    const guestResults = h('div', { class: 'guest-results' });
    let guestQ = '';
    const paintGuests = () => {
      const pool = s.players.filter((p) => p.teamId !== host.id && !guests.has(p.id));
      const found = guestQ.trim() ? pool.filter((p) => playerMatches(p, teamOf(p), guestQ)).slice(0, 6) : [];
      fill(guestResults, found.map((p) => h('button', {
        type: 'button', class: 'ghost pick-row',
        onclick: () => {
          guests.add(p.id);
          const n = Object.values(draft.sides);
          draft.sides[p.id] = n.filter((x) => x === 'home').length <= n.filter((x) => x === 'away').length ? 'home' : 'away';
          guestQ = ''; guestInput.value = ''; paintAll(); toast(`${p.nickname || p.name} se suma como invitado.`);
        },
      }, playerAvatar(p, 32, 'bust', teamOf(p)), h('span', { class: 'pick-name' }, p.nickname || p.name), h('span', { class: 'pick-note muted' }, teamOf(p)?.name ?? ''))));
    };
    const guestSearch = searchBox({ value: '', placeholder: 'Sumar invitado de otro equipo…', label: 'Buscar invitado', onInput: (v) => { guestQ = v; paintGuests(); } });
    const guestInput = guestSearch.querySelector('input');

    const paintTeams = () => {
      const ps = people();
      const nA = Object.values(draft.sides).filter((x) => x === 'home').length;
      const nB = Object.values(draft.sides).filter((x) => x === 'away').length;
      fill(teamsBox,
        h('div', { class: 'row wrap' },
          h('h3', { class: 'list-heading grow' }, `Armar equipos · ${nA} vs ${nB}`),
          h('button', { type: 'button', class: 'ghost small', onclick: () => { draw(); paintAll(); } }, '🎲 Sortear')),
        h('ul', { class: 'plist' }, ps.map((p) => h('li', { class: 'prow' },
          playerAvatar(p, 36, 'bust', teamOf(p)),
          h('span', { class: 'pinfo' }, playerName(p), guests.has(p.id) ? h('span', { class: 'pill guest-pill' }, `invitado · ${teamOf(p)?.name ?? ''}`) : null),
          sideSeg(p)))),
        guestSearch, guestResults);
    };

    const toggle = (label, icon, get, set, cls = '') => {
      const b = h('button', { type: 'button', class: `ev-toggle ${cls}`, 'aria-label': label }, icon);
      const paint = () => { b.classList.toggle('on', get()); b.setAttribute('aria-pressed', String(get())); };
      b.addEventListener('click', () => { set(!get()); paint(); paintNote(); });
      paint();
      return { el: b, paint };
    };

    const paintScore = () => {
      const side = (key, name) => h('div', { class: 'sc-side' },
        h('strong', { class: 'sc-name' }, name),
        stepper({
          label: `goles de ${name}`, big: true,
          get: () => draft[key], set: (v) => { draft[key] = v; paintNote(); },
        }).el);
      fill(scoreBox, side('homeGoals', draft.homeName || 'Lado A'), h('b', { class: 'sc-sep' }, ':'), side('awayGoals', draft.awayName || 'Lado B'));
    };

    const paintDetail = () => {
      const mvpBtns = [];
      const sideList = (key, name) => {
        const ps = people().filter((p) => draft.sides[p.id] === key);
        return h('section', { class: 'roster-side' },
          h('h3', { class: 'roster-title' }, name),
          ps.length ? h('ul', { class: 'mlist' }, ps.map((p) => {
            const r = rowOf(p.id); const n = p.nickname || p.name;
            const mvp = toggle(`${n} figura del partido`, '👑', () => draft.mvp === p.id, (v) => { draft.mvp = v ? p.id : null; mvpBtns.forEach((x) => x.paint()); }, 'mvp');
            mvpBtns.push(mvp);
            return h('li', { class: 'mrow' },
              h('div', { class: 'mrow-head' }, playerAvatar(p, 36, 'bust', teamOf(p)), playerName(p)),
              h('div', { class: 'mrow-acts' },
                h('span', { class: 'mini-lbl', 'aria-hidden': 'true' }, '⚽'),
                stepper({ label: `goles de ${n}`, max: 20, get: () => r.goal, set: (v) => { r.goal = v; paintNote(); } }).el,
                h('span', { class: 'mini-lbl', 'aria-hidden': 'true' }, '🤝'),
                stepper({ label: `asistencias de ${n}`, max: 20, get: () => r.assist, set: (v) => { r.assist = v; } }).el,
                mvp.el,
                toggle(`${n} amarilla`, '🟨', () => r.yellow, (v) => { r.yellow = v; }).el,
                toggle(`${n} roja`, '🟥', () => r.red, (v) => { r.red = v; }).el,
                toggle(`${n} gol en contra`, '🙈', () => r.own, (v) => { r.own = v; }, 'own').el));
          })) : h('p', { class: 'muted' }, 'Todavía no hay jugadores en este lado.'));
      };
      fill(detailBox, h('p', { class: 'legend muted' }, '⚽ goles · 🤝 asistencias · 👑 figura · 🟨 🟥 tarjetas · 🙈 gol en contra'),
        sideList('home', draft.homeName || 'Lado A'), sideList('away', draft.awayName || 'Lado B'));
    };

    const paintAll = () => { paintTeams(); paintScore(); paintDetail(); paintNote(); };

    const nameIn = (key, label) => h('input', {
      type: 'text', maxlength: 24, value: draft[key], 'aria-label': label,
      onchange: (e) => { draft[key] = e.target.value.trim() || draft[key]; paintAll(); },
    });
    const save = () => {
      err.textContent = '';
      const { events, lineup } = toEvents();
      const msg = store.saveFriendly(f.id, { homeName: draft.homeName, awayName: draft.awayName, date: draft.date, homeGoals: draft.homeGoals, awayGoals: draft.awayGoals, events, lineup });
      if (msg) { err.textContent = msg; return; }
      close();
      toast(`✅ ${draft.homeName} ${draft.homeGoals} - ${draft.awayGoals} ${draft.awayName}`);
    };

    paintAll();
    return h('div', { class: 'match-sheet friendly-sheet' },
      h('p', { class: 'muted center' }, teamTag(host, 18), ' · Amistoso (no suma en campeonatos)'),
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('label', { class: 'field' }, h('span', {}, 'Lado A'), nameIn('homeName', 'Nombre del lado A'))),
        h('div', { class: 'grow' }, h('label', { class: 'field' }, h('span', {}, 'Lado B'), nameIn('awayName', 'Nombre del lado B')))),
      h('label', { class: 'field' }, h('span', {}, 'Fecha'), h('input', { type: 'date', value: draft.date, 'aria-label': 'Fecha', onchange: (e) => { draft.date = e.target.value; } })),
      teamsBox, scoreBox, note, detailBox, err,
      h('div', { class: 'row wrap sticky-actions' },
        h('button', { onclick: save }, f.played ? 'Guardar cambios' : 'Guardar resultado'),
        h('button', { class: 'danger', onclick: async () => {
          const ok = await confirmDialog('Se borra este amistoso y sus estadísticas.', { okLabel: 'Borrar', danger: true });
          if (ok && store.deleteFriendly(f.id)) { close(); toast('Amistoso borrado.'); }
        } }, 'Borrar'),
        h('button', { class: 'ghost', onclick: close }, 'Cerrar')));
  });
}

// ---- Lista ----
function friendlyRow(s, f) {
  const host = teamById(s, f.teamId);
  const n = Object.keys(f.lineup).length;
  return h('button', { class: 'match-row friendly-row', onclick: () => openFriendlySheet(f.id), 'aria-label': `${f.homeName} contra ${f.awayName}${f.played ? `, ${f.homeGoals} a ${f.awayGoals}` : ', sin cargar'}` },
    h('span', { class: 'mr-team home' }, h('span', { class: 'team-name' }, f.homeName)),
    f.played ? h('span', { class: 'mr-score' }, `${f.homeGoals} : ${f.awayGoals}`) : h('span', { class: 'mr-when' }, 'sin cargar'),
    h('span', { class: 'mr-team away' }, h('span', { class: 'team-name' }, f.awayName)),
    h('span', { class: 'fr-meta muted' }, crestEl(host, 14), ` ${host.name}${f.date ? ` · ${fmtDate(f.date)}` : ''} · ${n} jugador${n === 1 ? '' : 'es'}`));
}

const ui = { teamId: 'all' };

export function renderFriendlies(root) {
  const s = store.get();
  const list = [...s.friendlies].filter((f) => ui.teamId === 'all' || f.teamId === ui.teamId)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  const hosts = [...new Set(s.friendlies.map((f) => f.teamId))].map((id) => teamById(s, id)).filter(Boolean);
  if (!hosts.some((t) => t.id === ui.teamId)) ui.teamId = 'all';
  fill(root,
    h('h1', { class: 'page-title' }, 'Amistosos'),
    h('p', { class: 'muted' }, 'Partidos internos de un equipo. Se registran aparte: no suman en tablas ni cuadros.'),
    h('div', { class: 'row wrap' }, h('button', { onclick: () => openFriendlyForm(ui.teamId === 'all' ? null : ui.teamId) }, '＋ Nuevo amistoso'),
      s.friendlies.length ? h('a', { class: 'btn ghost', href: '#/equipos', onclick: () => showFriendlyStats() }, '📊 Ver estadísticas') : null),
    hosts.length > 1 ? h('div', { class: 'chips', role: 'group', 'aria-label': 'Equipo' },
      [['all', 'Todos'], ...hosts.map((t) => [t.id, t.name])].map(([id, label]) => h('button', {
        class: `chip-btn ${ui.teamId === id ? 'on' : ''}`, 'aria-pressed': String(ui.teamId === id),
        onclick: () => { ui.teamId = id; renderFriendlies(root); },
      }, label))) : null,
    list.length ? h('section', { class: 'card match-list' }, list.map((f) => friendlyRow(s, f)))
      : emptyCard('Todavía no hay amistosos', 'Armá uno: elegís el equipo, repartís el plantel en dos lados y cargás el resultado.'));
}
