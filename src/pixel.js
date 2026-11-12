// Utilidades de pixel art: dibujar una grilla de colores como SVG nítido.
const NS = 'http://www.w3.org/2000/svg';

// grid: array de filas; cada celda es un color CSS (hex) o null (transparente).
// Se agrupan celdas contiguas del mismo color para generar menos nodos.
export function gridToSvg(grid, { size, label, className = 'crest' }) {
  const rows = grid.length;
  const cols = grid[0].length;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${cols} ${rows}`);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(Math.round((size * rows) / cols)));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  svg.setAttribute('class', className);
  for (let y = 0; y < rows; y++) {
    let x = 0;
    while (x < cols) {
      const color = grid[y][x];
      if (!color) { x++; continue; }
      let run = 1;
      while (x + run < cols && grid[y][x + run] === color) run++;
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
      r.setAttribute('width', String(run)); r.setAttribute('height', '1');
      r.setAttribute('fill', color);
      svg.append(r);
      x += run;
    }
  }
  return svg;
}

// Fuente 3x5 para iniciales y números (solo mayúsculas).
const F = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'],
  C: ['011', '100', '100', '100', '011'], D: ['110', '101', '101', '101', '110'],
  E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'],
  I: ['111', '010', '010', '010', '111'], J: ['001', '001', '001', '101', '010'],
  K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'],
  O: ['010', '101', '101', '101', '010'], P: ['110', '101', '110', '100', '100'],
  Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'],
  U: ['101', '101', '101', '101', '111'], V: ['101', '101', '101', '101', '010'],
  W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
  2: ['110', '001', '010', '100', '111'], 3: ['110', '001', '010', '001', '110'],
  4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '110', '001', '110'],
  6: ['011', '100', '110', '101', '010'], 7: ['111', '001', '010', '010', '010'],
  8: ['010', '101', '010', '101', '010'], 9: ['010', '101', '011', '001', '110'],
  '?': ['110', '001', '010', '000', '010'],
};

// Dibuja texto en la grilla (modifica grid). Devuelve nada.
export function stamp(grid, text, x0, y0, fill, outline) {
  const chars = [...text].map((c) => (F[c] ? c : '?'));
  const cells = [];
  chars.forEach((c, i) => {
    F[c].forEach((row, dy) => [...row].forEach((bit, dx) => {
      if (bit === '1') cells.push([x0 + i * 4 + dx, y0 + dy]);
    }));
  });
  const set = (x, y, c) => { if (grid[y] && x >= 0 && x < grid[y].length && grid[y][x]) grid[y][x] = c; };
  const solid = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of cells) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!solid.has(`${x + dx},${y + dy}`)) set(x + dx, y + dy, outline);
      }
    }
  }
  for (const [x, y] of cells) set(x, y, fill);
}

export const textWidth = (text) => text.length * 4 - 1;

// Hash determinístico (FNV-1a) para derivar rasgos estables de un id.
export function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
