import '@fontsource/press-start-2p/400.css';
import '@fontsource/vt323/400.css';
import './style.css';
import './style-pixel.css';
import './fulbito.css';
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
import { cloudSection } from './ui/cloudPanel.js';
import { tourTitle } from './views/common.js';
import { applyTheme, setTheme, onTheme, isModern } from './theme.js';

// Pixel o moderno: el último que se eligió en este navegador (botón 🎮/✨ del encabezado).
applyTheme();

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

const subtitle = h('p', { class: 'brand-sub muted' });
const nav = h('nav', { class: 'bottom-nav', 'aria-label': 'Secciones' }, TABS.map((t) =>
  h('a', { href: `#/${t.id}`, 'data-tab': t.id }, h('span', { class: 'ico', 'aria-hidden': 'true' }, t.ico), t.label)));

// ---- Nube (Supabase) ----
const sync = makeCloudSync();
const roPill = h('button', { class: 'ghost small ro-pill', hidden: true, onclick: () => openData(), 'aria-label': 'Modo solo lectura: entrar como administrador' }, '👀 Solo lectura');
const paintCloud = () => { roPill.hidden = !store.isLocked(); };
sync.cloud.onStatus((st, d) => { if (st === 'error' && d) toast(`☁️ ${d}`, { ms: 7000 }); });

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
  const cur = store.current();
  subtitle.textContent = cur ? tourTitle(cur) : 'Campeonatos entre amigos';
  tab.render(main);
  document.title = `${tab.title} · Fulbito FC`;
  window.scrollTo(0, y);
  if (key !== lastKey && lastKey !== null) main.focus({ preventScroll: true }); // anuncia el cambio de pantalla
  lastKey = key;
}

window.addEventListener('hashchange', paint);
store.subscribe(paint);
store.onError((msg) => toast(msg, { ms: 8000 }));

// ---- Modo pixel / moderno ----
const crestSlot = h('span', { class: 'brand-crest' });
const modeBtn = h('button', { class: 'ghost small mode-btn', onclick: () => setTheme(isModern() ? 'pixel' : 'modern') });
function paintMode() {
  crestSlot.replaceChildren(brandCrest(40)); // el escudo se dibuja en el estilo del modo
  const next = isModern() ? 'pixel' : 'moderno';
  modeBtn.textContent = isModern() ? '🎮 Pixel' : '✨ Moderno';
  modeBtn.setAttribute('aria-label', `Cambiar a la versión ${next}`);
  modeBtn.title = `Cambiar a la versión ${next}`;
}
onTheme(() => {
  paintMode();
  paint(); // escudos y caras se redibujan en el nuevo estilo
  toast(isModern() ? '✨ Versión moderna' : '🎮 Versión pixel');
});

document.body.prepend(pitchBackground());
app.append(
  h('header', { class: 'app-header' },
    h('a', { class: 'brand', href: '#/fixture', 'aria-label': 'Fulbito FC, inicio' },
      crestSlot,
      h('div', {}, h('p', { class: 'brand-name' }, 'Fulbito FC'), subtitle)),
    h('div', { class: 'header-tools' },
      roPill,
      modeBtn,
      h('button', { class: 'ghost small icon-btn', 'aria-label': 'Ayuda: cómo se usa', title: 'Ayuda', onclick: () => openHelp(route().id) }, '❓'),
      h('button', { class: 'ghost small icon-btn', 'aria-label': 'Datos y copias de seguridad', onclick: openData }, '💾'))),
  main, nav);
paintMode();
paint();
store.subscribe(paintCloud);
paintCloud();
sync.start(); // si hay proyecto de Supabase configurado, baja los datos y queda escuchando
