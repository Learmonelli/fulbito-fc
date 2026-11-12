// Hoja para cargar o editar un partido: marcador, penales (en el cuadro), fecha y el detalle por
// jugador (jugó, goles, asistencias, figura, tarjetas y gol en contra), con la estética de Piel Morena.
import { h } from '../dom.js';
import { store } from '../store.js';
import { crestEl } from '../crest.js';
import { playerAvatar } from '../avatar.js';
import { openSheet, confirmDialog } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';
import { playerName } from '../ui/playerName.js';
import { eventGoals } from '../domain/stats.js';
import { teamById, stepper, tourTitle } from './common.js';

const count = (events, pid, type) => events.filter((e) => e.playerId === pid && e.type === type).length;

export function openMatchSheet(tournamentId, matchId) {
  const s = store.get();
  const tour = s.tournaments.find((t) => t.id === tournamentId);
  const m = tour?.matches.find((x) => x.id === matchId);
  if (!m || !m.homeId || !m.awayId || m.bye) return null;
  const home = teamById(s, m.homeId);
  const away = teamById(s, m.awayId);
  const ko = m.stage === 'ko';
  const closedPhase = !ko && tour.playoffsStarted;
  const viewer = store.isLocked(); // no es el admin: solo mira
  const locked = closedPhase || viewer;

  return openSheet(`${home.name} vs ${away.name}`, (close) => {
    // Borrador local: nada se guarda hasta tocar "Guardar".
    const draft = {
      homeGoals: m.homeGoals, awayGoals: m.awayGoals,
      penHome: m.penHome ?? 0, penAway: m.penAway ?? 0, date: m.date || '',
      rows: {},
    };
    const fresh = !m.played && !Object.keys(m.lineup).length;
    const sides = [['home', home], ['away', away]];
    // Plantel de cada lado: los de hoy + los que jugaron este partido para ese lado y después pasaron a otro equipo.
    const rosterOf = (side, team) => [
      ...s.players.filter((x) => x.teamId === team.id),
      ...s.players.filter((x) => x.teamId !== team.id && m.lineup[x.id] === side),
    ];
    for (const [side, team] of sides) {
      for (const p of rosterOf(side, team)) {
        draft.rows[p.id] = {
          side, played: fresh ? true : m.lineup[p.id] === side,
          goal: count(m.events, p.id, 'goal'), assist: count(m.events, p.id, 'assist'),
          yellow: count(m.events, p.id, 'yellow') > 0, red: count(m.events, p.id, 'red') > 0, own: count(m.events, p.id, 'own') > 0,
        };
      }
    }
    let mvp = m.events.find((e) => e.type === 'mvp')?.playerId ?? null;
    const err = h('p', { class: 'error', role: 'alert' });
    const goalsNote = h('p', { class: 'muted small-note center' });
    const pens = h('div', { class: 'pens' });

    const toEvents = () => {
      const events = []; const lineup = {};
      for (const [pid, r] of Object.entries(draft.rows)) {
        if (!r.played && !r.goal && !r.assist && !r.yellow && !r.red && !r.own && mvp !== pid) continue;
        lineup[pid] = r.side;
        for (let i = 0; i < r.goal; i++) events.push({ playerId: pid, type: 'goal' });
        for (let i = 0; i < r.assist; i++) events.push({ playerId: pid, type: 'assist' });
        if (r.yellow) events.push({ playerId: pid, type: 'yellow' });
        if (r.red) events.push({ playerId: pid, type: 'red' });
        if (r.own) events.push({ playerId: pid, type: 'own' });
      }
      if (mvp && lineup[mvp]) events.push({ playerId: mvp, type: 'mvp' });
      return { events, lineup };
    };

    // Aviso en vivo: cuántos goles tienen autor y si sobran.
    const paintNote = () => {
      const { events, lineup } = toEvents();
      const g = eventGoals(events, lineup);
      const over = g.home > draft.homeGoals || g.away > draft.awayGoals;
      goalsNote.textContent = over
        ? '⚠ Hay más goles por jugador que en el marcador.'
        : `Goles con autor: ${g.home} de ${draft.homeGoals} · ${g.away} de ${draft.awayGoals}`;
      goalsNote.classList.toggle('warn', over);
      pens.hidden = !(ko && draft.homeGoals === draft.awayGoals);
    };

    const scoreSide = (side, team) => h('div', { class: 'sc-side' },
      crestEl(team, 48), h('strong', { class: 'sc-name' }, team.name),
      stepper({
        label: `goles de ${team.name}`, big: true,
        get: () => (side === 'home' ? draft.homeGoals : draft.awayGoals),
        set: (v) => { if (side === 'home') draft.homeGoals = v; else draft.awayGoals = v; paintNote(); },
      }).el);

    pens.append(h('p', { class: 'muted center' }, 'Empate en el cuadro: definí por penales'),
      h('div', { class: 'pens-row' },
        stepper({ label: `penales de ${home.name}`, max: 30, get: () => draft.penHome, set: (v) => { draft.penHome = v; } }).el,
        h('span', { class: 'muted' }, 'penales'),
        stepper({ label: `penales de ${away.name}`, max: 30, get: () => draft.penAway, set: (v) => { draft.penAway = v; } }).el));

    const toggle = (label, icon, get, set, cls = '') => {
      const b = h('button', { type: 'button', class: `ev-toggle ${cls}`, 'aria-label': label });
      const paint = () => { b.classList.toggle('on', get()); b.setAttribute('aria-pressed', String(get())); };
      b.textContent = icon;
      b.addEventListener('click', () => { set(!get()); paint(); paintNote(); });
      paint();
      return { el: b, paint };
    };

    const mvpButtons = [];
    const playerRow = (p, team) => {
      const r = draft.rows[p.id];
      const n = p.nickname || p.name;
      const playedBtn = toggle(`${n} jugó`, '👟', () => r.played, (v) => { r.played = v; }, 'played');
      const mvpBtn = toggle(`${n} figura del partido`, '👑', () => mvp === p.id, (v) => {
        mvp = v ? p.id : null;
        mvpButtons.forEach((x) => x.paint());
      }, 'mvp');
      mvpButtons.push(mvpBtn);
      return h('li', { class: 'mrow' },
        h('div', { class: 'mrow-head' },
          playerAvatar(p, 40, 'bust', team), // con la camiseta del equipo de ESE partido
          h('span', { class: 'pinfo' }, playerName(p),
            p.teamId !== team.id ? h('span', { class: 'pill guest-pill' }, `ahora en ${teamById(s, p.teamId)?.name ?? 'otro equipo'}`) : null),
          h('span', { class: 'grow' }), playedBtn.el),
        h('div', { class: 'mrow-acts' },
          h('span', { class: 'mini-lbl', 'aria-hidden': 'true' }, '⚽'),
          stepper({ label: `goles de ${n}`, max: 20, get: () => r.goal, set: (v) => { r.goal = v; if (v) { r.played = true; playedBtn.paint(); } paintNote(); } }).el,
          h('span', { class: 'mini-lbl', 'aria-hidden': 'true' }, '🤝'),
          stepper({ label: `asistencias de ${n}`, max: 20, get: () => r.assist, set: (v) => { r.assist = v; if (v) { r.played = true; playedBtn.paint(); } } }).el,
          mvpBtn.el,
          toggle(`${n} amarilla`, '🟨', () => r.yellow, (v) => { r.yellow = v; }).el,
          toggle(`${n} roja`, '🟥', () => r.red, (v) => { r.red = v; }).el,
          toggle(`${n} gol en contra`, '🙈', () => r.own, (v) => { r.own = v; }, 'own').el));
    };

    const rosterBox = (side, team) => {
      const ps = rosterOf(side, team);
      return h('section', { class: 'roster-side' },
        h('h3', { class: 'roster-title' }, crestEl(team, 20), team.name),
        ps.length ? h('ul', { class: 'mlist' }, ps.map((p) => playerRow(p, team)))
          : h('p', { class: 'muted' }, 'Este equipo no tiene jugadores cargados.'));
    };

    const dateIn = h('input', { type: 'date', value: draft.date, 'aria-label': 'Fecha del partido', onchange: (e) => { draft.date = e.target.value; } });

    const save = () => {
      err.textContent = '';
      const { events, lineup } = toEvents();
      const msg = store.saveMatch(tour.id, m.id, {
        homeGoals: draft.homeGoals, awayGoals: draft.awayGoals,
        penHome: draft.penHome, penAway: draft.penAway, events, lineup, date: draft.date,
      });
      if (msg) { err.textContent = msg; return; }
      close();
      toast(`✅ ${home.name} ${draft.homeGoals} - ${draft.awayGoals} ${away.name}`);
    };

    const body = h('div', { class: 'match-sheet' },
      h('p', { class: 'muted center' }, `${tourTitle(tour)} · ${m.label || ''}`),
      closedPhase ? h('p', { class: 'admin-note center' }, '🔒 La fase de liga quedó cerrada al armarse el cuadro.') : null,
      h('div', { class: 'card board scoreboard' }, scoreSide('home', home), h('b', { class: 'sc-sep' }, ':'), scoreSide('away', away)),
      pens,
      goalsNote,
      h('label', { class: 'field' }, h('span', {}, 'Fecha'), dateIn),
      h('p', { class: 'legend muted' }, '👟 jugó · ⚽ goles · 🤝 asistencias · 👑 figura · 🟨 🟥 tarjetas · 🙈 gol en contra'),
      rosterBox('home', home), rosterBox('away', away),
      err,
      h('div', { class: 'row wrap sticky-actions' },
        locked ? null : h('button', { onclick: save }, m.played ? 'Guardar cambios' : 'Guardar resultado'),
        m.played && !locked ? h('button', { class: 'ghost', onclick: async () => {
          const ok = await confirmDialog(ko
            ? 'El partido vuelve a "sin jugar" y los cruces siguientes del cuadro se vacían. ¿Seguir?'
            : 'El partido vuelve a "sin jugar" y deja de contar en la tabla. ¿Seguir?', { okLabel: 'Reabrir' });
          if (ok && store.reopenMatch(tour.id, m.id)) { close(); toast('Partido reabierto.'); }
        } }, '↩ Reabrir') : null,
        h('button', { class: 'ghost', 'data-keep': '', onclick: close }, 'Cerrar')));
    // Fase de liga cerrada: se puede mirar, no editar.
    if (locked) body.querySelectorAll('button:not([data-keep]), input').forEach((x) => { x.disabled = true; });
    paintNote();
    return body;
  });
}
