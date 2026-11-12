// Reparto en grupos "serpiente": con cabezas de serie ordenados, cada grupo recibe
// un equipo fuerte y uno débil (A B C C B A A B C ...), así quedan parejos.
export function splitGroups(teamIds, groupCount) {
  const ids = [...new Set(teamIds)];
  const groups = Array.from({ length: groupCount }, () => []);
  ids.forEach((id, i) => {
    const lap = Math.floor(i / groupCount);
    const pos = i % groupCount;
    groups[lap % 2 === 0 ? pos : groupCount - 1 - pos].push(id);
  });
  return groups;
}

export const groupName = (i) => `Grupo ${String.fromCharCode(65 + i)}`;

// tables: tablas de posiciones por grupo (ya ordenadas), p. ej. [[{teamId}, ...], ...].
// Devuelve los clasificados en orden de siembra: primero todos los 1°, luego los 2°, etc.
// Con la siembra estándar de la llave, nadie se cruza con su propio grupo en la primera ronda
// (cuando hay 2 o más grupos).
// Cruces tipo Mundial (2 clasificados por grupo, cantidad de grupos potencia de 2, mínimo 2):
// 1° de A vs 2° de B, 1° de B vs 2° de A, 1° de C vs 2° de D, etc.
// Los cruces "A-B" van en la mitad superior de la llave y los espejados en la inferior,
// así los dos de un mismo grupo solo pueden volver a verse en la final.
// Devuelve [[local, visitante], ...] o null si el formato no aplica.
export function worldCupPairs(tables) {
  const g = tables.length;
  if (g < 2 || (g & (g - 1)) !== 0) return null;
  if (tables.some((t) => t.length < 2)) return null;
  const first = (i) => tables[i][0].teamId;
  const second = (i) => tables[i][1].teamId;
  const top = [];
  const bottom = [];
  for (let k = 0; k < g; k += 2) {
    top.push([first(k), second(k + 1)]);
    bottom.push([first(k + 1), second(k)]);
  }
  return [...top, ...bottom];
}

export function qualifiers(tables, advance) {
  const out = [];
  for (let pos = 0; pos < advance; pos++) {
    for (const table of tables) if (table[pos]) out.push(table[pos].teamId);
  }
  return out;
}
