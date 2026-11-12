// Escudos: SVG generado por código (forma + patrón + iniciales) o logo subido.
// Escudos: forma de escudo + patrón + iniciales (pixel art o vectorial según la versión), o logo subido.
import { h } from './dom.js';
import { gridToSvg, stamp, textWidth } from './pixel.js';
import { isModern } from './theme.js';

export const PATTERN_LABELS = {
  solid: 'Liso', halves: 'Mitades', stripes: 'Rayas', band: 'Banda', chevron: 'Chevron', quarters: 'Cuartos',
};

// Blanco o negro según el brillo del color de fondo.
export function contrastOn(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}

// Iniciales sin acentos (la fuente pixel solo tiene A-Z y 0-9): "Fénix FC" -> "FF".
export function initials(name) {
  const plain = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9\s]/g, '');
  const words = plain.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Escudo pixel art: máscara de escudo en grilla 16x19, patrón, borde e iniciales.
const PW = 16;
const PH = 19;
const insideShield = (u, v) => {
  if (v < 0 || v > 1) return false;
  if (v <= 0.5) return u >= 0.06 && u <= 0.94;
  const k = (v - 0.5) / 0.5;
  return Math.abs(u - 0.5) <= 0.44 * (1 - k ** 1.7);
};
const usesAccent = (pattern, u, v) => {
  switch (pattern) {
    case 'halves': return u >= 0.5;
    case 'stripes': return Math.floor(u * 5) % 2 === 1;
    case 'band': return v >= 0.4 && v < 0.6;
    case 'chevron': { const line = 0.28 + (0.5 - Math.abs(u - 0.5)) * 0.7; return v >= line && v < line + 0.17; }
    case 'quarters': return (u >= 0.5) !== (v >= 0.5);
    default: return false;
  }
};

function pixelCrest(team, size) {
  const OUT = '#0b0b0b';
  const cells = Array.from({ length: PH }, (_, y) => Array.from({ length: PW }, (_, x) =>
    (insideShield((x + 0.5) / PW, (y + 0.5) / PH) ? 'in' : null)));
  const grid = cells.map((row, y) => row.map((c, x) => {
    if (!c) return null;
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !cells[y + dy]?.[x + dx]);
    if (edge) return OUT;
    return usesAccent(team.pattern, (x + 0.5) / PW, (y + 0.5) / PH) ? team.color2 : team.color1;
  }));
  const text = initials(team.name);
  const x0 = Math.floor((PW - textWidth(text)) / 2);
  const ink = contrastOn(team.color1);
  stamp(grid, text, x0, 6, ink, ink === '#ffffff' ? OUT : '#ffffff');
  return gridToSvg(grid, { size, label: `Escudo de ${team.name}` });
}

// team: { name, color1, color2, pattern, logo }
export function crestEl(team, size = 40) {
  if (team.logo) {
    return h('img', {
      class: 'crest', src: team.logo, alt: `Escudo de ${team.name}`, width: size, height: size,
    });
  }
  return isModern() ? vectorCrest(team, size) : pixelCrest(team, size);
}

// ---- Versión moderna: escudo vectorial liso, con el mismo patrón e iniciales ----
const NS = 'http://www.w3.org/2000/svg';
const SHIELD = 'M10 8 H90 V62 C90 92 68 108 50 114 C32 108 10 92 10 62 Z';
let clipSeq = 0;
const svgEl = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

function patternShapes(pattern, c2) {
  const f = { fill: c2 };
  switch (pattern) {
    case 'halves': return [svgEl('rect', { x: 50, y: 0, width: 60, height: 120, ...f })];
    case 'stripes': return [26, 58].map((x) => svgEl('rect', { x, y: 0, width: 16, height: 120, ...f }));
    case 'band': return [svgEl('rect', { x: 0, y: 46, width: 100, height: 24, ...f })];
    case 'chevron': return [svgEl('path', { d: 'M0 38 L50 74 L100 38 V62 L50 98 L0 62 Z', ...f })];
    case 'quarters': return [svgEl('rect', { x: 50, y: 0, width: 60, height: 62, ...f }), svgEl('rect', { x: 0, y: 62, width: 50, height: 60, ...f })];
    default: return [];
  }
}

function vectorCrest(team, size) {
  const id = `crest-clip-${++clipSeq}`;
  const root = svgEl('svg', {
    class: 'crest', viewBox: '0 0 100 120', width: size, height: Math.round(size * 1.2),
    role: 'img', 'aria-label': `Escudo de ${team.name}`,
  });
  const clip = svgEl('clipPath', { id });
  clip.append(svgEl('path', { d: SHIELD }));
  const defs = svgEl('defs');
  defs.append(clip);
  const g = svgEl('g', { 'clip-path': `url(#${id})` });
  g.append(svgEl('rect', { x: 0, y: 0, width: 100, height: 120, fill: team.color1 }), ...patternShapes(team.pattern, team.color2),
    svgEl('rect', { x: 0, y: 0, width: 100, height: 56, fill: '#ffffff', 'fill-opacity': 0.12 })); // brillo suave arriba
  const ink = contrastOn(team.color1);
  const text = svgEl('text', {
    x: 50, y: 76, 'text-anchor': 'middle', 'font-size': 42, 'font-weight': 900, 'letter-spacing': -1,
    'font-family': 'system-ui, "Segoe UI", sans-serif', fill: ink,
    stroke: ink === '#ffffff' ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.7)', 'stroke-width': 3, 'paint-order': 'stroke',
  });
  text.textContent = initials(team.name);
  root.append(defs, g, svgEl('path', { d: SHIELD, fill: 'none', stroke: 'rgba(255,255,255,.9)', 'stroke-width': 4 }), text);
  return root;
}

// Escudo + nombre en línea. Sin equipo (cruce todavía sin definir): "A confirmar", como Promiedos.
export function teamTag(team, size = 24) {
  if (!team) return h('span', { class: 'team-tag tbd' }, h('span', { class: 'crest-tbd', 'aria-hidden': 'true' }, '?'), h('span', {}, 'A confirmar'));
  return h('span', { class: 'team-tag' }, crestEl(team, size), h('span', { class: 'team-name' }, team.name));
}

// Variables CSS de los colores del club (los hex ya vienen validados por el store).
export const teamVars = (team) => `--c1:${team.color1};--c2:${team.color2}`;

// Lee un archivo de imagen y devuelve un PNG cuadrado de 128px (data URL).
// Solo png/jpeg/webp: se re-dibuja en canvas, así nunca se guarda contenido activo.
export function fileToLogo(file, max = 128) {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      reject(new Error('Usá una imagen PNG, JPG o WebP.')); return;
    }
    if (file.size > 5 * 1024 * 1024) { reject(new Error('La imagen supera los 5 MB.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = max; canvas.height = max;
      const ctx = canvas.getContext('2d');
      const scale = Math.min(max / img.width, max / img.height);
      const w = img.width * scale; const hh = img.height * scale;
      ctx.drawImage(img, (max - w) / 2, (max - hh) / 2, w, hh);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}
