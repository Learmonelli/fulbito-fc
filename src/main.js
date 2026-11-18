import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './style.css';
import './style-pixel.css';
import './palettes.css';
import { h } from './dom.js';
import { store } from './store.js';
import {
  PALETTES, setPalette, savedPalette, currentPalette, paletteColors, onPalette, FOLLOW_LEAGUE, getLeaguePalette, paletteName,
} from './theme.js';
import { crestPM, pitchBackground } from './brand.js';
import { toast } from './ui/toast.js';
import { openSheet, confirmDialog } from './ui/sheet.js';
import { isMuted, setMuted } from './ui/sfx.js';
import { renderMatches } from './views/matches.js';
import { renderMatch } from './views/match.js';
import { renderRanking } from './views/ranking.js';
import { renderPlayers } from './views/players.js';
import { makeSession } from './cloudSession.js';
import { cloudSection, statusChip } from './ui/cloudPanel.js';
import { renderLanding, rememberGroup, lastGroup } from './ui/landing.js';
import { installSection } from './ui/install.js';
import { openHelp } from './views/help.js';
import { leagueIdFromUrl, leagueLink } from './league.js';

// ---- Qué se abrió ----
//   sin ?liga=      -> pantalla de inicio (crear un grupo o entrar con un link)
//   ?liga=<grupo>   -> el grupo (sus datos viven en la nube y los ven todos)
//   ?local=1        -> modo prueba: datos de ejemplo, solo en este celular
const params = new URLSearchParams(location.search);
const localMode = params.has('local');
const leagueId = localMode ? null : leagueIdFromUrl();
store.useKey(leagueId ? `ffc_v1:${leagueId}` : 'ffc_v1');

// App instalada en el celular: si se abre sin ?liga=, vuelve al último grupo que se usó.
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
if (standalone && !params.has('liga') && !localMode && lastGroup()) location.replace(leagueLink(lastGroup()));

const session = makeSession({ leagueId });

const TABS = [
  { id: 'partidos', ico: '⚽', label: 'Partidos', title: 'Partidos', render: renderMatches },
  { id: 'ranking', ico: '🏆', label: 'Ranking', title: 'Ranking', render: renderRanking },
  { id: 'jugadores', ico: '👥', label: 'Jugadores', title: 'Jugadores', render: renderPlayers },
];

const app = document.getElementById('app');
const main = h('main', { id: 'main', tabindex: '-1' });

// #/partidos | #/ranking | #/jugadores | #/partido/<id>
function route() {
  const [, seg, arg] = location.hash.split('/');
  if (seg === 'partido' && arg) return { tab: 'partidos', render: (r) => renderMatch(r, arg), title: 'Partido' };
  const t = TABS.find((x) => x.id === seg) ?? TABS[0];
  return { tab: t.id, render: t.render, title: t.title };
}

// Qué pantalla corresponde: la app, el inicio, o un aviso (link inexistente / abriendo Liga FC).
function screen() {
  if (localMode) return 'app';
  if (!leagueId) return 'landing';
  const phase = session.phase();
  return phase === 'missing' || phase === 'redirect' ? phase : 'app';
}

// ---- Encabezado ----
const sfxBtn = h('button', { class: 'ghost small icon-btn', onclick: () => { setMuted(!isMuted()); paintHeader(); } });
const dataBtn = h('button', { class: 'ghost small icon-btn', 'aria-label': 'Datos y grupo', onclick: openData }, '💾');
const lookBtn = h('button', { class: 'ghost small icon-btn', 'aria-label': 'Colores de la app', title: 'Colores', onclick: () => openLook() }, '🎨');
const helpBtn = h('button', { class: 'ghost small icon-btn', 'aria-label': 'Ayuda: cómo se usa', title: 'Ayuda', onclick: () => openHelp(route().tab) }, '❓');
const crestSlot = h('span', { class: 'brand-crest' });
const brandSub = h('p', { class: 'brand-sub muted' }, 'Estadísticas del fútbol entre amigos');
const paintCrest = () => crestSlot.replaceChildren(crestPM(46, paletteColors()));
const groupName = () => (session.phase() === 'ok' || session.phase() === 'offline' ? session.cloud.league()?.name : null);

function paintHeader() {
  sfxBtn.textContent = isMuted() ? '🔇' : '🔊';
  sfxBtn.setAttribute('aria-pressed', String(!isMuted()));
  sfxBtn.setAttribute('aria-label', isMuted() ? 'Activar sonidos' : 'Silenciar sonidos');
  brandSub.textContent = groupName() || (localMode ? 'Modo prueba · solo en este celular' : 'Estadísticas del fútbol entre amigos');
}

const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Secciones' }, TABS.map((t) =>
  h('a', { href: `#/${t.id}`, 'data-tab': t.id }, h('span', { class: 'ico', 'aria-hidden': 'true' }, t.ico), t.label)));

// ---- Colores: los del grupo (los elige un admin y los ven todos) o los de cada celular ----
function openLook() {
  openSheet('🎨 Colores', (close) => {
    const grid = (isOn, pick, scope) => h('div', { class: 'palette-grid', role: 'group', 'aria-label': `Paleta (${scope})` },
      PALETTES.map(([id, label, c1, c2]) => h('button', {
        class: `palette-opt ${isOn(id) ? 'on' : ''}`, 'aria-pressed': String(isOn(id)), 'data-palette-id': id, 'data-scope': scope,
        onclick: async () => { await pick(id); close(); openLook(); },
      }, h('span', { class: 'palette-dots', 'aria-hidden': 'true' }, h('span', { style: `background:${c1}` }), h('span', { style: `background:${c2}` })), label)));
    const follows = savedPalette() === FOLLOW_LEAGUE;
    return h('div', { class: 'stack' },
      session.cloud.canEdit() ? [
        h('h3', { class: 'list-heading' }, '👥 Colores del grupo (para todos)'),
        h('p', { class: 'muted small-note' }, 'Así lo ve todo el grupo, salvo quien elija otros colores en su celular.'),
        grid((id) => id === (getLeaguePalette() || 'clasico'), async (id) => {
          try { await session.cloud.updateSettings({ palette: id }); toast(`🎨 Colores del grupo: ${paletteName(id)}`); } catch (ex) { toast(ex.message); }
        }, 'grupo'),
      ] : null,
      leagueId ? [
        h('h3', { class: 'list-heading' }, '📱 En este celular'),
        h('button', {
          class: `palette-opt follow ${follows ? 'on' : ''}`, 'aria-pressed': String(follows),
          onclick: () => { setPalette(FOLLOW_LEAGUE); close(); openLook(); },
        }, '👥 Los colores del grupo', h('span', { class: 'muted small-note' }, ` (${paletteName(getLeaguePalette() || 'clasico')})`)),
      ] : null,
      grid((id) => (leagueId ? savedPalette() === id : currentPalette() === id), (id) => setPalette(id), 'mio'),
      h('p', { class: 'muted small-note' }, 'Lo que elijas en este celular queda solo acá; los datos son los mismos.'),
      h('div', { class: 'row end' }, h('button', { class: 'ghost', onclick: close }, 'Listo')));
  });
}

// ---- Datos: grupo y copia de seguridad ----
function openData() {
  openSheet('Datos y grupo', (close) => {
    const s = store.get();
    const file = h('input', {
      type: 'file', accept: 'application/json,.json', class: 'sr-only',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast('El archivo es demasiado grande.'); return; }
        const ok = await confirmDialog('Esto reemplaza todos los datos actuales. ¿Seguir?', { okLabel: 'Reemplazar', danger: true });
        if (!ok) return;
        if (store.importJson(await f.text())) { toast('Copia importada.'); close(); } else toast('El archivo no es una copia válida.');
      },
    });
    const synced = store.isSynced();
    return h('div', {},
      h('h3', { class: 'data-title' }, '📲 App en el celular'),
      installSection(),
      cloudSection(session, close),
      h('h3', { class: 'data-title' }, '💾 Copias'),
      h('p', { class: 'muted' }, synced
        ? 'Los datos viven en la nube. Podés descargar una copia; restaurar una copia lo hacen los administradores desde "Copias de seguridad".'
        : 'Los datos se guardan solo en este navegador. Descargá una copia de vez en cuando.'),
      h('div', { class: 'stack' },
        h('button', { onclick: () => {
          const url = URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' }));
          const a = h('a', { href: url, download: `fulbito-fc-${new Date().toISOString().slice(0, 10)}.json` });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          toast('Copia descargada.');
        } }, '⬇ Exportar copia'),
        synced ? null : h('label', { class: 'btn ghost' }, '⬆ Importar copia', file),
        synced ? null : !s.players.length && !s.matches.length
          ? h('button', { class: 'ghost', onclick: () => { store.loadDemo(); close(); toast('Datos de ejemplo cargados.'); } }, '🧪 Cargar datos de ejemplo')
          : h('button', { class: 'danger', onclick: async () => {
            const ok = await confirmDialog('Se borran todos los jugadores y partidos de este navegador. Antes exportá una copia si querés conservarlos.', { okLabel: 'Borrar todo', danger: true });
            if (ok) { store.clearAll(); close(); toast('Datos borrados. Podés cargar los de ejemplo desde 💾.'); }
          } }, '🗑 Borrar todos los datos')));
  });
}

// ---- Render ----
let lastKey = null;
function paint() {
  const sc = screen();
  const r = route();
  const key = `${sc}${location.hash || '#/partidos'}`;
  const y = key === lastKey ? window.scrollY : 0; // misma pantalla: conserva el scroll
  nav.hidden = sc !== 'app';
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === r.tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (sc === 'landing') renderLanding(main, session);
  else if (sc === 'missing') {
    main.replaceChildren(h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, 'Este link no corresponde a ningún grupo'),
      h('p', { class: 'muted' }, 'Revisá que el link esté completo, o pedile uno nuevo a quien te lo pasó.'),
      h('a', { class: 'btn', href: location.pathname }, 'Ir al inicio')));
  } else if (sc === 'redirect') {
    main.replaceChildren(h('section', { class: 'card' }, h('p', {}, 'Abriendo Liga FC…')));
  } else r.render(main);
  paintHeader();
  document.title = `${sc === 'app' ? r.title : 'Inicio'} · ${groupName() || 'Fulbito FC'}`;
  window.scrollTo(0, y);
  if (key !== lastKey && lastKey !== null) main.focus({ preventScroll: true }); // anuncia el cambio de pantalla
  lastKey = key;
}

window.addEventListener('hashchange', paint);
store.subscribe(paint);
store.onError((msg) => toast(msg, { ms: 8000 }));
onPalette(() => { paintCrest(); paint(); });

document.body.prepend(pitchBackground());
app.append(
  h('header', { class: 'app-header' },
    h('div', { class: 'brand' }, crestSlot,
      h('div', {}, h('p', { class: 'brand-name' }, 'Fulbito FC'), brandSub)),
    h('div', { class: 'header-tools' },
      statusChip(session, openData), lookBtn, helpBtn, sfxBtn, dataBtn)),
  main, nav);
paintHeader();
paintCrest();
paint();

if (localMode) {
  // Modo prueba: sin nube. Arranca con datos de ejemplo para ver cómo queda.
  if (!store.get().players.length && !store.get().matches.length) {
    store.loadDemo();
    toast('👀 Modo prueba con datos de ejemplo (quedan solo en este celular).', { ms: 7000 });
  }
} else {
  session.start().then((phase) => {
    if (phase === 'ok') rememberGroup(leagueId);
    paint();
  });
}
