import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './style.css';
import './style-pixel.css';
import './fulbito.css';
import './palettes.css';
import { h } from './dom.js';
import { store } from './store.js';
import { brandCrest, pitchBackground } from './brand.js';
import { toast } from './ui/toast.js';
import { openSheet, confirmDialog } from './ui/sheet.js';
import { renderFixture } from './views/fixture.js';
import { renderBracket } from './views/bracket.js';
import { renderTeams } from './views/teams.js';
import { renderChampions } from './views/champions.js';
import { renderFriendlies, openFriendlyForm } from './views/friendlies.js';
import { setFriendlyLauncher } from './views/sheets.js';
import { openHelp } from './views/help.js';
import { makeCloudSync } from './cloudSync.js';
import { MAIN, isLeagueId, leagueIdFromUrl, leagueLink } from './league.js';
import { cloudSection } from './ui/cloudPanel.js';
import {
  applyTheme, setTheme, onTheme, isModern, applyPalette, setPalette, savedPalette, PALETTES,
  FOLLOW_LEAGUE, setLeaguePalette, getLeaguePalette, paletteName,
} from './theme.js';

// Modo y colores: los últimos que se eligieron en este celular (botón 🎨 del encabezado).
applyTheme();
applyPalette();
// Colores de la liga: vienen con sus datos (y se actualizan en vivo cuando el organizador los cambia).
setLeaguePalette(store.get().look?.palette);
store.subscribe((s) => setLeaguePalette(s.look?.palette));

// Las cuatro secciones de Promiedos (Fixture y tablas, Cuadro, Equipos y estadísticas, Campeones)
// y los Amistosos internos, que van aparte.
const TABS = [
  { id: 'fixture', ico: '📋', label: 'Fixture', title: 'Fixture y tablas', render: renderFixture },
  { id: 'cuadro', ico: '🏆', label: 'Cuadro', title: 'Cuadro', render: renderBracket },
  { id: 'equipos', ico: '👥', label: 'Equipos', title: 'Equipos y estadísticas', render: renderTeams },
  { id: 'campeones', ico: '⭐', label: 'Campeones', title: 'Campeones', render: renderChampions },
  { id: 'amistosos', ico: '🤝', label: 'Amistosos', title: 'Amistosos', render: renderFriendlies },
];
setFriendlyLauncher(openFriendlyForm); // botón "🤝 Amistoso" de la ficha de equipo

const app = document.getElementById('app');
const main = h('main', { id: 'main', tabindex: '-1' });

const route = () => TABS.find((t) => t.id === location.hash.split('/')[1]) ?? TABS[0];

const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Secciones' }, TABS.map((t) =>
  h('a', { href: `#/${t.id}`, 'data-tab': t.id }, h('span', { class: 'ico', 'aria-hidden': 'true' }, t.ico), t.label)));

// ---- Liga del link (?liga=<id>) ----
// App instalada en el celular: si se abre sin ?liga= y la última vez se usó otra liga, vuelve a esa.
const LAST = 'fulbito_last_league';
const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
if (standalone && !new URLSearchParams(location.search).has('liga')) {
  const last = localStorage.getItem(LAST);
  if (isLeagueId(last) && last !== MAIN) location.replace(leagueLink(last));
}
try { localStorage.setItem(LAST, leagueIdFromUrl()); } catch { /* sin almacenamiento */ }

// ---- Nube (Supabase) ----
const sync = makeCloudSync();
sync.cloud.onStatus((st, d) => { if (st === 'error' && d) toast(`☁️ ${d}`, { ms: 7000 }); });
// Nombre de la liga bajo "Fulbito FC" (solo en las ligas nuevas; la original queda como estaba).
const leagueName = h('p', { class: 'brand-league', hidden: true });
sync.cloud.onLeague((lg) => {
  const show = sync.leagueId !== MAIN && lg?.exists;
  leagueName.hidden = !show;
  leagueName.textContent = show ? lg.name : '';
  if (show) document.title = `${lg.name} · Fulbito FC`;
});

function downloadCopy() {
  const url = URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' }));
  const a = h('a', { href: url, download: `fulbito-fc-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Copia descargada.');
}

// ---- Datos: nube y copias de seguridad ----
function openData() {
  openSheet('Datos y copias', (close) => {
    const s = store.get();
    const file = h('input', {
      type: 'file', accept: 'application/json,.json', class: 'sr-only',
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast('El archivo es demasiado grande.'); return; }
        const ok = await confirmDialog('Esto reemplaza todos los datos actuales. ¿Seguir?', { okLabel: 'Reemplazar', danger: true });
        if (!ok) return;
        if (store.importJson(await f.text())) { toast('Copia importada.'); close(); } else toast('El archivo no es una copia válida de Fulbito FC.');
      },
    });
    const ro = store.isLocked(); // solo lectura: se puede descargar una copia, nada más
    return h('div', {},
      cloudSection(sync, close),
      h('h3', { class: 'data-title' }, '💾 Copias'),
      h('p', { class: 'muted' }, sync.configured
        ? 'Los datos viven en la nube. Igual podés descargar una copia de vez en cuando.'
        : 'Por ahora los datos se guardan solo en este navegador. Descargá una copia de vez en cuando.'),
      ro ? null : h('p', { class: 'muted' }, 'Para probar con muchos datos, importá el archivo datos-falsos.json (12 equipos y 5 campeonatos).'),
      ro ? h('div', { class: 'stack' }, h('button', { onclick: () => downloadCopy() }, '⬇ Exportar copia')) : h('div', { class: 'stack' },
        h('button', { onclick: () => downloadCopy() }, '⬇ Exportar copia'),
        h('label', { class: 'btn ghost' }, '⬆ Importar copia', file),
        !s.teams.length
          ? h('button', { class: 'ghost', onclick: () => { store.loadDemo(); close(); toast('Datos de ejemplo cargados.'); } }, '🧪 Cargar datos de ejemplo')
          : h('button', { class: 'danger', onclick: async () => {
            const ok = await confirmDialog('Se borran todos los equipos, jugadores y campeonatos de este navegador. Antes exportá una copia si querés conservarlos.', { okLabel: 'Borrar todo', danger: true });
            if (ok) { store.clearAll(); close(); toast('Datos borrados.'); }
          } }, '🗑 Borrar todos los datos')));
  });
}

// ---- Render ----
let lastKey = null;
function paint() {
  const tab = route();
  const key = location.hash || '#/fixture';
  const y = key === lastKey ? window.scrollY : 0; // misma pantalla: conserva el scroll
  nav.querySelectorAll('a').forEach((a) => {
    if (a.dataset.tab === tab.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  tab.render(main);
  const lg = sync.cloud.league();
  document.title = `${tab.title} · ${sync.leagueId !== MAIN && lg?.exists ? lg.name : 'Fulbito FC'}`;
  window.scrollTo(0, y);
  if (key !== lastKey && lastKey !== null) main.focus({ preventScroll: true }); // anuncia el cambio de pantalla
  lastKey = key;
}

window.addEventListener('hashchange', paint);
store.subscribe(paint);
store.onError((msg) => toast(msg, { ms: 8000 }));

// ---- Aspecto: modo (pixel / moderno) y paleta de colores ----
const crestSlot = h('span', { class: 'brand-crest' });
const modeBtn = h('button', { class: 'ghost small icon-btn', 'aria-label': 'Aspecto: modo y colores', title: 'Aspecto', onclick: () => openLook() }, '🎨');
function paintMode() {
  crestSlot.replaceChildren(brandCrest(40)); // el escudo se dibuja en el estilo y los colores elegidos
}
function openLook() {
  openSheet('🎨 Aspecto', (close) => {
    // Botones de paletas. isOn(id) marca la elegida; pick(id) la aplica y vuelve a dibujar la hoja.
    const paletteGrid = (isOn, pick, scope) => h('div', { class: 'palette-grid', role: 'group', 'aria-label': `Paleta (${scope})` },
      PALETTES.map(([id, label, c1, c2]) => h('button', {
        class: `palette-opt ${isOn(id) ? 'on' : ''}`, 'aria-pressed': String(isOn(id)), 'data-palette-id': id, 'data-scope': scope,
        onclick: () => { pick(id); close(); openLook(); },
      }, h('span', { class: 'palette-dots', 'aria-hidden': 'true' }, h('span', { style: `background:${c1}` }), h('span', { style: `background:${c2}` })), label)));
    const seg = (items, isOn, pick) => h('div', { class: 'seg-btns', role: 'group' }, items.map(([v, label]) => h('button', {
      class: `seg-btn ${isOn(v) ? 'on' : ''}`, 'aria-pressed': String(isOn(v)), onclick: () => { pick(v); close(); openLook(); },
    }, label)));
    return h('div', { class: 'stack' },
      h('h3', { class: 'list-heading' }, 'Modo'),
      seg([['pixel', '🎮 Pixel'], ['modern', '✨ Moderno']], (v) => (v === 'modern') === isModern(), (v) => setTheme(v)),
      // Colores de la liga (para todos): solo los administradores.
      store.isLocked() ? null : [
        h('h3', { class: 'list-heading' }, '🏆 Colores de la liga (para todos)'),
        h('p', { class: 'muted small-note' }, 'Así la ve todo el mundo, salvo quien elija otros colores en su celular.'),
        paletteGrid((id) => id === (getLeaguePalette() || 'clasico'), (id) => {
          if (store.setLook({ palette: id })) toast(`🎨 Colores de la liga: ${paletteName(id)}`);
        }, 'liga'),
      ],
      h('h3', { class: 'list-heading' }, '📱 En este celular'),
      h('button', {
        class: `palette-opt follow ${savedPalette() === FOLLOW_LEAGUE ? 'on' : ''}`, 'aria-pressed': String(savedPalette() === FOLLOW_LEAGUE),
        onclick: () => { setPalette(FOLLOW_LEAGUE); close(); openLook(); },
      }, '🏆 Los colores de la liga', h('span', { class: 'muted small-note' }, ` (${paletteName(getLeaguePalette() || 'clasico')})`)),
      paletteGrid((id) => savedPalette() === id, (id) => setPalette(id), 'mio'),
      h('p', { class: 'muted small-note' }, 'Lo que elijas acá queda solo en este celular; los datos son los mismos.'),
      h('div', { class: 'row end' }, h('button', { class: 'ghost', onclick: close }, 'Listo')));
  });
}
onTheme(() => {
  paintMode();
  paint(); // escudos, caras y colores se redibujan con el nuevo aspecto
});

document.body.prepend(pitchBackground());
app.append(
  h('header', { class: 'app-header' },
    h('a', { class: 'brand', href: '#/fixture', 'aria-label': 'Fulbito FC, inicio' },
      crestSlot,
      h('div', {}, h('p', { class: 'brand-name' }, 'Fulbito FC'), leagueName)),
    h('div', { class: 'header-tools' },
      modeBtn,
      h('button', { class: 'ghost small icon-btn', 'aria-label': 'Ayuda: cómo se usa', title: 'Ayuda', onclick: () => openHelp(route().id) }, '❓'),
      h('button', { class: 'ghost small icon-btn', 'aria-label': 'Datos y copias de seguridad', onclick: openData }, '💾'))),
  main, nav);
paintMode();
paint();
// Si hay proyecto de Supabase configurado, baja la liga del link y queda escuchando.
sync.start().then(() => { if (sync.missing()) toast('⚠ Este link no corresponde a ninguna liga. Revisá que esté completo.', { ms: 10000 }); });
