// Prueba de interfaz sin navegador: renderiza las pestañas reales con jsdom y simula uso.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toasts"></div></body>', { url: 'http://localhost/' });
const { window } = dom;
Object.assign(globalThis, {
  window, document: window.document, Node: window.Node, HTMLElement: window.HTMLElement,
  localStorage: window.localStorage, Event: window.Event, location: window.location,
});
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => { const t = realSetTimeout(fn, ms); t.unref?.(); return t; };
// jsdom no implementa <dialog>.showModal/close.
window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
window.HTMLDialogElement.prototype.close = function close(rv) {
  this.removeAttribute('open'); this.returnValue = rv ?? '';
  this.dispatchEvent(new window.Event('close'));
};

const { store } = await import('../src/store.js');
const { renderFixture } = await import('../src/views/fixture.js');
const { renderBracket } = await import('../src/views/bracket.js');
const { renderTeams } = await import('../src/views/teams.js');
const { renderChampions } = await import('../src/views/champions.js');
const { openTeamForm, openPlayerForm } = await import('../src/views/sheets.js');
const { tournamentStatus } = await import('../src/domain/stats.js');

const root = document.getElementById('app');
const sheet = () => document.querySelector('dialog.sheet[open]');
const closeSheets = () => document.querySelectorAll('dialog[open]').forEach((d) => d.close());
const btn = (scope, re) => [...scope.querySelectorAll('button')].find((b) => re.test(b.textContent));

before(() => { assert.equal(store.loadDemo(), true); });

test('Fixture y tablas: tabla con zona de clasificación y fechas con flechas', () => {
  renderFixture(root);
  assert.match(root.querySelector('.page-title').textContent, /Fixture y tablas/);
  const chips = [...root.querySelectorAll('.tour-chips .chip-btn[data-tour]')];
  assert.equal(chips.length, 3);
  assert.equal(chips.filter((c) => c.getAttribute('aria-pressed') === 'true').length, 1);
  const rows = root.querySelectorAll('.standings tbody tr');
  assert.equal(rows.length, 8);
  assert.equal(root.querySelectorAll('.standings tr.zone-ko').length, 4, 'los 4 primeros pasan al cuadro');
  assert.deepEqual([...root.querySelectorAll('.standings thead abbr')].map((a) => a.textContent).slice(0, 2), ['Pts', 'PJ']);
  const label = root.querySelector('.round-label');
  const before = label.textContent;
  root.querySelector('[aria-label="Fecha anterior"]').click();
  assert.notEqual(root.querySelector('.round-label').textContent, before);
  assert.equal(root.querySelectorAll('.match-list .match-row').length, 4);
  assert.equal(root.querySelector('select'), null, 'sin desplegables');
});

test('Cuadro: semis jugadas, final por jugar y "A confirmar" en la liga sin cuadro', () => {
  renderBracket(root);
  const rounds = [...root.querySelectorAll('.ko-round > h2.list-heading')].map((x) => x.textContent);
  assert.deepEqual(rounds, ['Semifinal', 'Final']);
  assert.equal(root.querySelector('.champion'), null, 'todavía no hay campeón');
  assert.equal(root.querySelectorAll('.ko-side.winner').length, 2);
  // La copa de verano ya tiene campeón y tercer puesto.
  const copa = store.get().tournaments.find((t) => t.name === 'Copa de Verano');
  store.setCurrent(copa.id);
  renderBracket(root);
  assert.ok(root.querySelector('.champion'));
  assert.deepEqual([...root.querySelectorAll('.ko-round > h2.list-heading')].map((x) => x.textContent), ['Cuartos de final', 'Semifinal', 'Final']);
  assert.ok(root.querySelector('.third-title'));
  store.setCurrent(store.get().tournaments.find((t) => t.name === 'Torneo Apertura').id);
});

test('cargar la final desde el cuadro define al campeón', () => {
  renderBracket(root);
  const final = [...root.querySelectorAll('.ko-round')].at(-1).querySelector('button.ko-card');
  assert.equal(final.disabled, false);
  final.click();
  const sh = sheet();
  assert.ok(sh, 'abre la hoja del partido');
  // 0 a 0 en el cuadro: aparecen los penales; al hacer un gol, se van.
  assert.equal(sh.querySelector('.pens').hidden, false);
  const plusHome = sh.querySelector('.scoreboard .sc-side:first-child [aria-label^="Sumar goles"]');
  plusHome.click();
  assert.equal(sh.querySelector('.pens').hidden, true);
  assert.match(sh.querySelector('.small-note').textContent, /0 de 1/);
  // Un goleador del local.
  const firstRow = sh.querySelector('.roster-side .mrow');
  firstRow.querySelector('[aria-label^="Sumar goles de"]').click();
  firstRow.querySelector('[aria-label$="figura del partido"]').click();
  btn(sh, /Guardar resultado/).click();
  assert.equal(sheet(), null, 'se cerró al guardar');
  const tour = store.current();
  const st = tournamentStatus(tour, store.get().teams);
  assert.equal(st.finished, true);
  renderBracket(root);
  assert.ok(root.querySelector('.champion'));
});

test('Equipos y estadísticas: equipos con racha y ranking con podio', () => {
  renderTeams(root);
  assert.equal(root.querySelectorAll('.tcard').length, 8);
  assert.ok(root.querySelector('.tcard .form-dots'));
  btn(root, /Jugadores/).click();
  assert.ok(root.querySelector('.podium .step'));
  const cats = [...root.querySelectorAll('.chip-btn[data-cat]')].map((c) => c.dataset.cat);
  assert.deepEqual(cats, ['goals', 'assists', 'mvp', 'unbeaten', 'yellow', 'red']);
  root.querySelector('.chip-btn[data-cat="unbeaten"]').click();
  assert.match(root.textContent, /sin perder/);
  assert.ok(root.querySelector('.podium .step'), 'podio de racha invicta');
  root.querySelector('.chip-btn[data-cat="assists"]').click();
  assert.match(root.querySelector('.podium').getAttribute('aria-label'), /Asistencias/);
  // Buscador por equipo.
  const input = root.querySelector('.search input');
  input.value = 'zzzz'; input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(root.textContent, /no está en este ranking/);
  input.value = ''; input.dispatchEvent(new window.Event('input', { bubbles: true }));
  // Alcance: todos los campeonatos suma más partidos.
  btn(root, /^Todos$/).click();
  assert.ok(root.querySelector('.table tbody tr'));
});

test('Campeones: palmarés y un campeón por torneo terminado', () => {
  renderChampions(root);
  assert.equal(root.querySelectorAll('.champ-card').length, 3);
  assert.equal(root.querySelectorAll('.champ-card .champ-big').length, 3, 'ya se jugó la final del Apertura');
  assert.ok(root.querySelector('.palmares li'));
  assert.ok([...root.querySelectorAll('.award-line')].some((x) => /Goleador/.test(x.textContent)));
});

test('crear equipo y jugador con cara propia; la camiseta es la del equipo', () => {
  openTeamForm();
  let sh = sheet();
  const name = sh.querySelector('input[aria-label="Nombre del equipo"]');
  name.value = 'Los Galácticos'; name.dispatchEvent(new window.Event('input', { bubbles: true }));
  sh.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const team = store.get().teams.find((t) => t.name === 'Los Galácticos');
  assert.ok(team);
  closeSheets();
  openPlayerForm(team.id);
  sh = sheet();
  assert.equal([...sh.querySelectorAll('.face-group > summary')].some((x) => /Camiseta/.test(x.textContent)), false);
  sh.querySelector('input[aria-label="Nombre"]').value = 'Diego Maradona';
  sh.querySelector('input[aria-label="Número de camiseta"]').value = '10';
  sh.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  const p = store.get().players.find((x) => x.name === 'Diego Maradona');
  assert.equal(p.number, 10);
  assert.equal(p.teamId, team.id);
  closeSheets();
});

test('sin datos: bienvenida con datos de ejemplo', () => {
  const json = store.exportJson();
  store.clearAll();
  renderFixture(root);
  assert.match(root.textContent, /Bienvenido a Fulbito FC/);
  renderChampions(root);
  assert.match(root.textContent, /Sin campeones todavía/);
  store.importJson(json);
});

test('versión moderna: escudos y caras vectoriales, sin pixel art', () => {
  document.documentElement.dataset.theme = 'modern';
  try {
    renderTeams(root);
    btn(root, /Jugadores/).click();
    assert.ok(root.querySelector('.podium .vec-avatar'), 'caras vectoriales en el podio');
    assert.equal(root.querySelector('.pixel-avatar'), null);
    const crest = root.querySelector('svg.crest');
    assert.ok(crest.querySelector('path'), 'el escudo es un trazado liso');
    assert.notEqual(crest.getAttribute('shape-rendering'), 'crispEdges');
    // El editor de caras dibuja la vista previa con el mismo estilo.
    openPlayerForm(store.get().teams[0].id);
    assert.ok(sheet().querySelector('.face-preview .vec-avatar'));
    closeSheets();
  } finally {
    document.documentElement.dataset.theme = 'pixel';
  }
  renderTeams(root);
  assert.ok(root.querySelector('svg.crest[shape-rendering="crispEdges"]'), 'versión pixel: escudo pixelado');
});

test('modo pixel/moderno: se cambia, se recuerda y no se aceptan otros valores', async () => {
  const { setTheme, savedTheme, isModern, onTheme } = await import('../src/theme.js');
  let seen = null;
  const off = onTheme((t) => { seen = t; });
  assert.equal(setTheme('modern'), true);
  assert.equal(isModern(), true);
  assert.equal(seen, 'modern');
  assert.equal(savedTheme(), 'modern', 'queda guardado en el navegador');
  assert.equal(setTheme('modern'), false, 'ya estaba en moderno');
  assert.equal(setTheme('neon'), false);
  renderChampions(root);
  assert.ok(root.querySelector('.vec-avatar'));
  assert.equal(setTheme('pixel'), true);
  renderChampions(root);
  assert.ok(root.querySelector('.pixel-avatar'));
  off();
});

test('los datos falsos para probar se importan y traen 5 campeonatos', async () => {
  const { readFileSync } = await import('node:fs');
  const json = readFileSync(new URL('../datos-falsos.json', import.meta.url), 'utf8');
  const before = store.exportJson();
  assert.equal(store.importJson(json), true);
  const s = store.get();
  assert.equal(s.teams.length, 12);
  assert.equal(s.players.length, 120);
  const st = s.tournaments.map((t) => tournamentStatus(t, s.teams).finished);
  assert.deepEqual(st, [true, true, true, true, false]);
  renderFixture(root);
  assert.equal(root.querySelectorAll('.standings tbody tr').length, 12);
  store.importJson(before);
});

test('amistosos: lista, armado de equipos con invitado y estadísticas separadas', async () => {
  const { renderFriendlies, openFriendlySheet } = await import('../src/views/friendlies.js');
  renderFriendlies(root);
  const rows = root.querySelectorAll('.friendly-row');
  assert.equal(rows.length, 4, 'los 4 amistosos de ejemplo');
  // Nuevo amistoso: se arma con sorteo y se carga.
  const host = store.get().teams[1];
  const f = store.addFriendly(host.id, { homeName: 'Pecheras', awayName: 'Sin pechera' });
  openFriendlySheet(f.id, { shuffle: true });
  let sh = sheet();
  assert.match(sh.querySelector('.teams-box .list-heading').textContent, /Armar equipos/);
  const segs = sh.querySelectorAll('.teams-box .prow');
  assert.equal(segs.length, store.get().players.filter((p) => p.teamId === host.id).length);
  // Invitado de otro equipo desde el buscador.
  const guestIn = sh.querySelector('.teams-box .search input');
  const other = store.get().players.find((p) => p.teamId !== host.id);
  guestIn.value = other.name; guestIn.dispatchEvent(new window.Event('input', { bubbles: true }));
  sh.querySelector('.guest-results button').click();
  sh = sheet();
  assert.ok(sh.querySelector('.guest-pill'), 'aparece como invitado');
  sh.querySelector('.scoreboard .sc-side:first-child [aria-label^="Sumar goles"]').click();
  btn(sh, /Guardar resultado/).click();
  assert.equal(sheet(), null);
  const saved = store.get().friendlies.find((x) => x.id === f.id);
  assert.equal(saved.played, true);
  assert.equal(saved.lineup[other.id] != null, true);
  // Estadísticas: el selector separa campeonatos y amistosos.
  renderTeams(root);
  btn(root, /Amistosos/).click();
  btn(root, /Jugadores/).click();
  assert.match(root.textContent, /Solo amistosos/);
  assert.ok(root.querySelector('.podium .step'));
  btn(root, /Campeonatos/).click();
  assert.doesNotMatch(root.textContent, /Solo amistosos/);
});

test('ajustar fixture desde la pantalla: mover a otra fecha e invertir localía', () => {
  const before = store.exportJson();
  const ids = store.get().teams.slice(0, 4).map((t) => t.id);
  const t = store.createTournament('Liga de prueba', ids, { format: 'league' });
  renderFixture(root);
  const edit = btn(root, /Ajustar fixture/);
  assert.ok(edit, 'aparece el botón en una liga sin jugar');
  edit.click();
  assert.equal(root.querySelectorAll('.fx-tools').length, 2, 'acciones en los 2 partidos de la fecha');
  // Localía.
  const first = store.get().tournaments.find((x) => x.id === t.id).matches.find((m) => m.round === 1);
  const home = first.homeId;
  btn(root.querySelector('.fx-tools'), /Localía/).click();
  assert.equal(store.get().tournaments.find((x) => x.id === t.id).matches.find((m) => m.id === first.id).awayId, home);
  // Mover: la hoja muestra las fechas válidas y explica las que no.
  renderFixture(root);
  btn(root.querySelector('.fx-tools'), /Mover/).click();
  const sh = sheet();
  const opts = [...sh.querySelectorAll('.move-opt')];
  assert.equal(opts.length, 4, '3 fechas + fecha nueva');
  assert.ok(opts.filter((o) => o.disabled).some((o) => /ya juega/.test(o.textContent)));
  opts.at(-1).click();
  assert.equal(sheet(), null);
  assert.equal(store.get().tournaments.find((x) => x.id === t.id).matches.find((m) => m.id === first.id).round, 4);
  // Intercambiar la fecha que se está viendo con otra.
  renderFixture(root);
  const shown = root.querySelector('.round-label').textContent.match(/\d+/)[0];
  const ids0 = store.get().tournaments.find((x) => x.id === t.id).matches.filter((m) => String(m.round) === shown).map((m) => m.id).sort();
  const chip = [...root.querySelectorAll('.swap-chips .chip-btn')].find((b) => !b.disabled);
  const target = chip.textContent;
  chip.click();
  const moved = store.get().tournaments.find((x) => x.id === t.id).matches.filter((m) => String(m.round) === target).map((m) => m.id).sort();
  assert.deepEqual(moved, ids0, 'los partidos de esa fecha pasaron a la otra');
  store.importJson(before);
});

test('ayuda: temas plegables y abre en el de la pestaña actual', async () => {
  const { openHelp, TOPICS } = await import('../src/views/help.js');
  openHelp('cuadro');
  const sh = sheet();
  const topics = [...sh.querySelectorAll('.help-topic')];
  assert.equal(topics.length, TOPICS.length);
  assert.deepEqual(topics.filter((d) => d.open).map((d) => d.dataset.topic), ['cuadro']);
  assert.match(sh.textContent, /Ajustar el fixture/);
  assert.match(sh.textContent, /Amistosos/);
  closeSheets();
  openHelp('amistosos');
  assert.equal(sheet().querySelector('.help-topic[open]').dataset.topic, 'amistosos');
  closeSheets();
});

test('solo lectura (no es el admin): se ve todo, sin botones para cargar', async () => {
  const { openMatchSheet } = await import('../src/views/matchSheet.js');
  store.setLocked(true);
  try {
    renderFixture(root);
    assert.equal(btn(root, /Ajustar fixture/), undefined);
    assert.equal(root.querySelector('.tour-chips .add'), null, 'sin "＋ Nuevo"');
    assert.equal(root.querySelector('[aria-label="Editar campeonato"]'), null);
    assert.ok(root.querySelector('.standings tbody tr'), 'la tabla se ve igual');
    renderTeams(root);
    assert.equal(btn(root, /Nuevo equipo/), undefined);
    // Un partido se abre para mirar, pero sin guardar y con todo deshabilitado.
    const t = store.current();
    const m = t.matches.find((x) => x.played && x.homeId && x.awayId);
    openMatchSheet(t.id, m.id);
    const sh = sheet();
    assert.equal(btn(sh, /Guardar/), undefined);
    assert.ok([...sh.querySelectorAll('.stepper button')].every((b) => b.disabled));
    assert.equal(btn(sh, /Cerrar/).disabled, false);
    closeSheets();
    // Sin datos: un aviso, sin "Crear equipos" ni "Datos de ejemplo".
    const json = store.exportJson();
    store.setLocked(false); store.clearAll(); store.setLocked(true);
    renderFixture(root);
    assert.match(root.textContent, /Todavía no hay campeonatos cargados/);
    assert.equal(root.querySelector('.empty button, .empty a'), null);
    store.setLocked(false); store.importJson(json);
  } finally {
    store.setLocked(false);
  }
});

test('paletas de colores: se eligen, se recuerdan y el escudo de la app las usa', async () => {
  const { setPalette, savedPalette, currentPalette, paletteColors, PALETTES, applyPalette } = await import('../src/theme.js');
  const { brandCrest } = await import('../src/brand.js');
  applyPalette();
  assert.equal(currentPalette(), 'clasico');
  assert.ok(PALETTES.length >= 5);
  assert.equal(setPalette('pasion'), true);
  assert.equal(document.documentElement.dataset.palette, 'pasion');
  assert.equal(savedPalette(), 'pasion');
  assert.equal(setPalette('pasion'), false, 'ya estaba');
  assert.equal(setPalette('arcoiris'), false, 'no existe');
  assert.equal(paletteColors().color1, '#c62828');
  // El escudo pixel de la app se pinta con el rojo de la paleta.
  const crest = brandCrest(40);
  assert.ok([...crest.querySelectorAll('rect')].some((r) => r.getAttribute('fill') === '#c62828'));
  setPalette('clasico');
});

test('colores de la liga: los elige un admin, todos los ven salvo quien eligió otros', async () => {
  const { setPalette, setLeaguePalette, currentPalette, savedPalette, FOLLOW_LEAGUE, applyPalette } = await import('../src/theme.js');
  setPalette(FOLLOW_LEAGUE);
  assert.equal(savedPalette(), FOLLOW_LEAGUE);
  setLeaguePalette('');
  applyPalette();
  assert.equal(currentPalette(), 'clasico', 'sin elegir: la clásica');
  // El organizador elige: se guarda con los datos de la liga.
  assert.equal(store.setLook({ palette: 'selva' }), true);
  assert.equal(store.get().look.palette, 'selva');
  assert.equal(store.setLook({ palette: 'arcoiris' }), false);
  setLeaguePalette(store.get().look.palette); // lo que hace main.js al cambiar los datos
  assert.equal(currentPalette(), 'selva', 'quien sigue a la liga la ve con sus colores');
  // Alguien elige sus propios colores: la liga ya no lo cambia.
  setPalette('noche');
  setLeaguePalette('cielo');
  assert.equal(currentPalette(), 'noche');
  // Vuelve a los de la liga.
  setPalette(FOLLOW_LEAGUE);
  assert.equal(currentPalette(), 'cielo');
  // Quien solo mira no puede cambiar los colores de la liga; viajan en la copia.
  store.setLocked(true);
  assert.equal(store.setLook({ palette: 'pasion' }), false);
  store.setLocked(false);
  assert.match(store.exportJson(), /"palette": "selva"/);
  store.setLook({ palette: '' });
  setLeaguePalette('');
});
