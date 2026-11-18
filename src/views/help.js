// Ayuda: temas plegables. Abre en el tema de la pestaña donde está el usuario.
import { h } from '../dom.js';
import { openSheet } from '../ui/sheet.js';

// [id, título, pasos/párrafos]
export const TOPICS = [
  ['inicio', '🚀 Primeros pasos', [
    'Fulbito FC lleva las estadísticas del fútbol entre amigos: quién hace goles, quién asiste, quién gana, los premios de cada partido y mucho más.',
    '1. En 👥 Jugadores sumá a los del grupo (con su cara, apodo y número).',
    '2. En ⚽ Partidos tocá "＋ Nuevo partido", elegí la fecha y los nombres de los dos equipos.',
    '3. En el partido, armá los equipos y cargá los goles a medida que pasan.',
    '4. Al terminar, elegí los premios y finalizalo. El 🏆 Ranking se actualiza solo.',
  ]],
  ['jugadores', '👥 Jugadores', [
    'Tocá "＋ Agregar jugador": nombre, apodo, número, posiciones y su cara (piel, pelo, corte, barba, anteojos, gorra y camiseta).',
    'Los invitados son los que vienen de vez en cuando: juegan y suman, pero se muestran aparte y no pronostican.',
    'Tocá a un jugador para ver su ficha: partidos, goles, asistencias, victorias, rachas, premios y en qué partido ganó cada uno.',
  ]],
  ['partido', '⚽ Armar equipos y cargar el partido', [
    'Armar equipos: tocá A o B al lado de cada jugador. Los elegidos suben arriba, agrupados por equipo. Tocá otra vez el mismo botón para sacarlo.',
    'Goles: tocá ⚽ al lado del que lo hizo y 🤝 al que asistió. Cada acción tiene "Deshacer" en el aviso de abajo.',
    'No puede haber más asistencias que goles de ese equipo.',
    'Gol en contra: "🙈 Agregar gol en contra" (abajo de los goles). Suma para el otro equipo y queda anotado a quien lo hizo.',
    'Tocá un gol de la lista para corregirlo (cambiar el goleador o pasarlo a gol en contra).',
  ]],
  ['premios', '👑 Premios', [
    'En cada partido se eligen: 👑 Figura, 🔥 Golazo de la fecha, 🧱 Muro (el mejor defensor), 🪓 Hachazo (la patada del partido), 📣 Polémica y 🧤 Arquero.',
    'Se cuentan en el ranking y en la ficha de cada jugador.',
  ]],
  ['pronosticos', '🎯 Pronósticos', [
    'Antes del partido, cada jugador del plantel puede pronosticar quién gana (o si empatan) y, si quiere, el resultado exacto.',
    'Se hace en la pantalla del partido, en "🎯 Pronósticos": elegí tu nombre, tocá el equipo o Empate y "Pronosticar".',
    'Uno por jugador y no se puede cambiar. Todos ven lo que pronosticó cada uno.',
    'Se cierran cuando se carga el primer gol (o al finalizar el partido).',
    'Puntos: 3 por el resultado exacto, 1 por acertar quién gana o el empate. Se suman al terminar el partido en "🎯 El Adivino" del ranking.',
    'Sin plata de por medio: si quieren, el que menos acierta paga las birras.',
  ]],
  ['ranking', '🏆 Ranking', [
    'Elegí la categoría con los botones: goles, asistencias, victorias, derrotas, figuras, golazos, muros, hachazos, polémicas, arqueros, rachas y El Adivino.',
    'El podio muestra a los tres primeros. Abajo está el resto y la "Tabla completa" con todos los números (el encabezado queda fijo al bajar).',
    'Tocá a cualquiera para ver su ficha.',
  ]],
  ['comentarios', '💬 Comentarios y compartir', [
    'Cada partido tiene comentarios: se pueden dejar aunque el partido ya esté finalizado.',
    '"📤 Compartir resumen" arma una imagen con el resultado, los goles y los premios para mandar por WhatsApp.',
  ]],
  ['cerrar', '🏁 Finalizar un partido', [
    'Al finalizar, el partido queda bloqueado: solo se pueden agregar comentarios.',
    'Los partidos que quedan abiertos se finalizan solos al día siguiente.',
  ]],
  ['datos', '💾 Datos, colores y app', [
    'En 💾 podés descargar una copia de todo, instalar la app en el celular (📲) y cargar datos de ejemplo para probar.',
    'El botón 🎨 cambia los colores de la app. Queda guardado en este celular.',
    '🔊 activa o silencia los sonidos.',
  ]],
];

const TAB_TOPIC = { partidos: 'partido', ranking: 'ranking', jugadores: 'jugadores' };

export function openHelp(tab = null) {
  const first = TAB_TOPIC[tab] ?? 'inicio';
  return openSheet('❓ Cómo se usa', (close) => h('div', { class: 'help' },
    TOPICS.map(([id, title, lines]) => h('details', { class: 'face-group help-topic', 'data-topic': id, open: id === first },
      h('summary', {}, title),
      h('div', { class: 'help-body' }, lines.map((l) => h('p', {}, l))))),
    h('div', { class: 'row end' }, h('button', { class: 'ghost', onclick: close }, 'Cerrar'))));
}
