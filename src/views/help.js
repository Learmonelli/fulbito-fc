// Manual de uso: hoja con temas plegables. Abre en el tema de la pestaña donde está el usuario.
import { h } from '../dom.js';
import { openSheet } from '../ui/sheet.js';
import { store } from '../store.js';
import { toast } from '../ui/toast.js';

// [id, título, pestaña relacionada (o null), pasos/párrafos]
export const TOPICS = [
  ['inicio', '🚀 Primeros pasos', null, [
    'Fulbito FC lleva tus campeonatos entre amigos: tablas, cuadros, goleadores y campeones.',
    '1. En 👥 Equipos creá los equipos y sumales jugadores.',
    '2. En 📋 Fixture tocá "＋ Nuevo" para armar un campeonato.',
    '3. Tocá cada partido para cargar el resultado. La tabla, el cuadro y las estadísticas se actualizan solos.',
    '¿Querés verla funcionando antes? En 💾 cargá los datos de ejemplo.',
  ]],
  ['equipos', '👥 Equipos y jugadores', 'equipos', [
    'Tocá "＋ Nuevo equipo": nombre, dos colores y un diseño de escudo. También podés subir el escudo propio (PNG, JPG o WebP).',
    'En la ficha del equipo tocá "＋ Sumar jugador": nombre, apodo, número y su cara (piel, pelo, corte, barba, anteojos, gorra). La camiseta es la del equipo.',
    'Pase: en la ficha del jugador, "✏️ Editar jugador" y elegí el equipo nuevo. Lo que ya jugó queda con su equipo anterior y sus estadísticas personales lo siguen.',
    'Un equipo o jugador que ya jugó no se puede borrar, para no perder resultados.',
  ]],
  ['torneos', '🏆 Campeonatos y formatos', 'fixture', [
    'Liga: todos contra todos (con ida y vuelta si querés). Sale campeón el que más puntos suma: 3 por ganar, 1 por empatar.',
    'Copa: eliminación directa. Si los equipos no son 2, 4, 8 o 16, los mejores pasan directo la primera ronda.',
    'Liga + cuadro: primero la liga y, al terminar, los mejores de la tabla juegan el cuadro (final, semis o cuartos).',
    'Grupos + cuadro: como un Mundial. Con 2 por grupo se cruzan 1°A con 2°B y 1°B con 2°A.',
    'Desempate en la tabla: puntos, diferencia de gol, goles a favor y nombre.',
    'Los botones de arriba cambian de campeonato. ⚙ cambia el nombre o lo borra.',
  ]],
  ['partido', '⚽ Cargar un partido', 'fixture', [
    'Tocá el partido. Con − y + poné el marcador y, abajo, el detalle de cada jugador:',
    '👟 jugó · ⚽ goles · 🤝 asistencias · 👑 figura (una por partido) · 🟨 🟥 tarjetas · 🙈 gol en contra.',
    'No hace falta cargar quién hizo cada gol, pero no pueden ser más que los del marcador: el aviso "Goles con autor" te va contando.',
    'En el cuadro no hay empate: si terminan iguales, aparecen los penales.',
    '"↩ Reabrir" vuelve el partido a "sin jugar". En el cuadro, los cruces siguientes se vacían.',
  ]],
  ['ajustar', '✏️ Ajustar el fixture', 'fixture', [
    'La app arma el fixture sola. Para cambiarlo, en 📋 Fixture tocá "✏️ Ajustar fixture" (abajo de las fechas).',
    '📅 Mover: pasa un partido a otra fecha o a una fecha nueva. Las fechas que no se pueden dicen por qué (por ejemplo, "X ya juega en la Fecha 3").',
    '⇄ Localía: invierte local y visitante.',
    '🔁 Intercambiar la fecha: pasa todos los partidos de una fecha a otra y al revés (por ejemplo, jugar el clásico antes).',
    'Siempre se respeta que nadie juegue dos veces en una fecha. Los partidos jugados no se mueven.',
  ]],
  ['cuadro', '🏆 Cuadro', 'cuadro', [
    'Muestra las rondas: octavos, cuartos, semis, final y tercer puesto. Los cruces sin definir dicen "A confirmar".',
    'En Liga + cuadro y Grupos + cuadro, el cuadro se arma cuando termina la fase de liga: tocá "Armar el cuadro". Desde ahí la tabla queda cerrada.',
    'Cuando se juega la final aparece el campeón.',
  ]],
  ['amistosos', '🤝 Amistosos', 'amistosos', [
    'Partidos internos de un equipo: su plantel partido en dos lados (Claros y Oscuros, o los nombres que quieras).',
    'Tocá "＋ Nuevo amistoso", elegí el equipo y repartí a cada jugador en un lado (o 🎲 Sortear). Podés sumar invitados de otros equipos con el buscador.',
    'Se cargan igual que un partido, pero no suman en tablas, cuadros ni títulos.',
  ]],
  ['stats', '📊 Estadísticas', 'equipos', [
    'En 👥 Equipos, "⚽ Jugadores" muestra el podio y los rankings: goles, asistencias, figuras y tarjetas. La "Tabla completa" tiene todo junto.',
    '🏆 Campeonatos / 🤝 Amistosos: elegís qué partidos contar. Nunca se mezclan.',
    'Con "Este campeonato / Todos" ves solo el campeonato elegido o la suma de todos.',
    'Los cuadraditos G / E / P son los últimos 5 resultados de cada equipo.',
    'Rachas: la etiqueta muestra la racha actual (🔥 victorias seguidas, 🛡️ sin perder, 🥶 derrotas seguidas, 😬 sin ganar). En la ficha de cada equipo y jugador están sus mejores rachas.',
    '🛡️ Invicto en el ranking: la mejor racha de partidos seguidos sin perder de cada jugador, contando solo los que jugó.',
  ]],
  ['campeones', '⭐ Campeones', 'campeones', [
    'El palmarés cuenta los títulos de cada equipo.',
    'Cada campeonato muestra al campeón, el 2.° y el 3.°, el goleador y quién fue más veces figura. Los que siguen en juego dicen cuántos partidos faltan.',
  ]],
  ['ligas', '🏆 Tu liga, link y administradores', null, [
    'Cada liga es un torneo con todos sus equipos y tiene su propio link. Con el link, cualquiera mira en vivo: tabla, cuadro, estadísticas y campeones.',
    'Solo los administradores cargan. Los demás ven todo, sin botones para editar.',
    '¿Organizás un torneo? En 💾 entrá con tu email y tocá "＋ Crear una liga nueva". Quedás como dueño.',
    'En 💾 → "👥 Administradores" sumás a otros por su email (por ejemplo, un delegado de cada equipo). Cualquier administrador puede sumar o sacar a otros; al dueño no lo saca nadie.',
    'Para compartir: 💾 → "🔗 Compartir link" y mandalo por WhatsApp.',
    'Para tenerla como app: 💾 → "📲 Instalar en el celular".',
  ]],
  ['datos', '💾 Nube, copias y aspecto', null, [
    'Los datos viven en la nube: todos ven lo mismo y los cambios llegan solos a cada celular.',
    'Los administradores entran desde 💾 con su email y contraseña (la primera vez, con un link al mail).',
    'En 💾 también se puede descargar una copia de todo. Importar una copia (solo el admin) reemplaza todo lo cargado.',
    'El botón 🎨 (arriba) cambia el aspecto: modo 🎮 Pixel o ✨ Moderno y los colores.',
    'Colores de la liga: los elige un administrador en 🎨 y todos la ven así. Si preferís otros, elegí tu paleta en "📱 En este celular" (y "🏆 Los colores de la liga" para volver).',
  ]],
];

const TAB_TOPIC = { fixture: 'torneos', cuadro: 'cuadro', equipos: 'equipos', campeones: 'campeones', amistosos: 'amistosos' };

export function openHelp(tab = null) {
  const s = store.get();
  const first = !s.teams.length ? 'inicio' : TAB_TOPIC[tab] ?? 'inicio';
  return openSheet('❓ Cómo se usa', (close) => h('div', { class: 'help' },
    TOPICS.map(([id, title, , lines]) => h('details', { class: 'face-group help-topic', 'data-topic': id, open: id === first },
      h('summary', {}, title),
      h('div', { class: 'help-body' }, lines.map((l) => h('p', {}, l))))),
    !s.teams.length ? h('div', { class: 'row center' }, h('button', {
      onclick: () => { store.loadDemo(); close(); toast('Datos de ejemplo cargados.'); },
    }, '🧪 Ver con datos de ejemplo')) : null,
    h('div', { class: 'row end' }, h('button', { class: 'ghost', onclick: close }, 'Cerrar'))));
}
