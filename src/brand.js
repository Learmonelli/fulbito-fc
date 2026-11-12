// Marca de Fulbito FC: escudo azul marino y verde lima, y la canchita de fondo.
import { crestEl } from './crest.js';
import { paletteColors } from './theme.js';

export const BRAND = { name: 'Fulbito FC', color1: '#1f4fbf', color2: '#b8f03c', pattern: 'chevron', logo: '' };
// El escudo de la app toma los colores de la paleta elegida (🎨 Aspecto).
export const brandCrest = (size = 40) => crestEl({ ...BRAND, ...paletteColors() }, size);

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};

// Canchita 8-bit de fondo (solo en la versión pixel).
export function pitchBackground() {
  const lines = s('g', { fill: '#f3ead6', stroke: '#f3ead6', 'stroke-width': 4 },
    ...[[8, 8, 224, 4], [8, 348, 224, 4], [8, 8, 4, 344], [228, 8, 4, 344], [8, 178, 224, 4], [116, 176, 8, 8]]
      .map(([x, y, width, height]) => s('rect', { x, y, width, height, stroke: 'none' })),
    s('circle', { cx: 120, cy: 180, r: 42, fill: 'none' }),
    ...[[60, 8, 120, 58], [90, 8, 60, 24], [60, 294, 120, 58], [90, 328, 60, 24]]
      .map(([x, y, width, height]) => s('rect', { x, y, width, height, fill: 'none' })),
    ...['M8 8 h44 M8 8 v24', 'M232 8 h-44 M232 8 v24', 'M8 352 h44 M8 352 v-24', 'M232 352 h-44 M232 352 v-24']
      .map((d) => s('path', { d, fill: 'none' })));
  const svg = s('svg', { viewBox: '0 0 240 360', preserveAspectRatio: 'xMidYMid slice', 'shape-rendering': 'crispEdges' },
    s('rect', { width: 240, height: 360, fill: '#17622f' }),
    s('g', { fill: '#1d7a3c' }, ...[0, 60, 120, 180].map((x) => s('rect', { x, y: 0, width: 30, height: 360 }))),
    lines);
  const div = document.createElement('div');
  div.id = 'pitch-bg';
  div.setAttribute('aria-hidden', 'true');
  div.append(svg);
  return div;
}
