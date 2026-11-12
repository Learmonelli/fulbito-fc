// Avatar vectorial (versión moderna): misma cara que el pixel art (piel, pelo, corte, ojos, barba,
// anteojos, gorra y camiseta del equipo), dibujada con formas lisas. Lee los mismos datos de `face`,
// así un jugador armado en una versión se ve igual en la otra.
import { AV_SKIN, AV_HAIR, AV_SHIRT, resolveFace, shade } from './pmAvatar.js';

const NS = 'http://www.w3.org/2000/svg';
let seq = 0;
const el = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

// Camiseta: torso con el diseño (lisa, rayas, banda, franja, mitades, mangas).
function shirt(g, c1, c2, jersey, clipId) {
  const body = 'M8 66 C8 52 18 45 32 45 C46 45 56 52 56 66 Z';
  g.append(el('path', { d: body, fill: c1 }));
  const k = el('g', { 'clip-path': `url(#${clipId})` });
  if (jersey === 1) [18, 26, 34, 42].forEach((x) => k.append(el('rect', { x, y: 44, width: 4, height: 24, fill: c2 })));
  else if (jersey === 2) k.append(el('path', { d: 'M14 46 L22 46 L52 66 L44 66 Z', fill: c2 }));
  else if (jersey === 3) k.append(el('rect', { x: 0, y: 54, width: 64, height: 5, fill: c2 }));
  else if (jersey === 4) k.append(el('rect', { x: 32, y: 44, width: 32, height: 24, fill: c2 }));
  else if (jersey === 5) { k.append(el('path', { d: 'M8 66 C8 54 13 48 20 46 L22 66 Z', fill: c2 }), el('path', { d: 'M56 66 C56 54 51 48 44 46 L42 66 Z', fill: c2 })); }
  g.append(k);
  g.append(el('path', { d: 'M25 45.5 L32 53 L39 45.5', fill: 'none', stroke: jersey === 0 ? c2 : shade(c1, 0.7), 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  return body;
}

// Pelo de atrás (lo que queda detrás de la cabeza).
function hairBack(g, style, H) {
  if (style === 2) g.append(el('path', { d: 'M17 24 C17 10 47 10 47 24 L48 44 L40 44 L40 30 L24 30 L24 44 L16 44 Z', fill: H }));
  if (style === 4) [[20, 18, 7], [26, 12, 7], [32, 10, 7.5], [38, 12, 7], [44, 18, 7], [17, 26, 5], [47, 26, 5]].forEach(([cx, cy, r]) => g.append(el('circle', { cx, cy, r, fill: H })));
  if (style === 6) g.append(el('path', { d: 'M44 22 C52 24 52 36 47 42 C49 34 47 28 43 26 Z', fill: H }));
}

// Pelo de adelante (flequillo / corte).
function hairFront(g, style, H) {
  const cap = (d) => g.append(el('path', { d, fill: H }));
  if (style === 0 || style === 6) cap('M20 25 C19 13 45 13 44 25 C40 19 25 18 20 25 Z');
  else if (style === 1) cap('M19 28 C17 11 47 11 45 28 C43 21 38 19 32 20 C26 19 21 21 19 28 Z');
  else if (style === 2) cap('M19 27 C18 11 46 11 45 27 C40 18 24 18 19 27 Z');
  else if (style === 3) g.append(el('ellipse', { cx: 27, cy: 17, rx: 4, ry: 2, fill: '#ffffff', 'fill-opacity': 0.25 }));
  else if (style === 4) cap('M20 24 C20 15 44 15 44 24 C40 19 24 19 20 24 Z');
  else if (style === 5) g.append(el('rect', { x: 28.5, y: 6, width: 7, height: 16, rx: 3.5, fill: H }));
}

function eyesAndMouth(g, f, S) {
  const r = [1.4, 1.7, 2.1, 2.3, 1.2, 1.9][f.eyeSize] ?? 1.9;
  const ink = '#1a1a1a';
  const L = 27; const R = 37; const y = 28;
  const dot = (x, rr = r) => g.append(el('circle', { cx: x, cy: y, r: rr, fill: ink }));
  const line = (d, w = 1.6) => g.append(el('path', { d, fill: 'none', stroke: ink, 'stroke-width': w, 'stroke-linecap': 'round' }));
  if (f.eyes === 1) { dot(L); line(`M${R - 2.4} ${y} H${R + 2.4}`); } // guiño
  else if (f.eyes === 2) { line(`M${L - 2.4} ${y + 0.6} Q${L} ${y - 2} ${L + 2.4} ${y + 0.6}`); line(`M${R - 2.4} ${y + 0.6} Q${R} ${y - 2} ${R + 2.4} ${y + 0.6}`); }
  else if (f.eyes === 4) { dot(L, r + 0.6); dot(R, r + 0.6); }
  else if (f.eyeSize === 4) { line(`M${L - 2.2} ${y} H${L + 2.2}`, 1.8); line(`M${R - 2.2} ${y} H${R + 2.2}`, 1.8); }
  else { dot(L); dot(R); }
  // Cejas: enojado = inclinadas hacia adentro.
  if (f.eyes === 3) { line(`M${L - 3} ${y - 4.5} L${L + 2.5} ${y - 3}`, 1.8); line(`M${R + 3} ${y - 4.5} L${R - 2.5} ${y - 3}`, 1.8); }
  else { line(`M${L - 2.8} ${y - 4} Q${L} ${y - 5.2} ${L + 2.8} ${y - 4}`, 1.4); line(`M${R - 2.8} ${y - 4} Q${R} ${y - 5.2} ${R + 2.8} ${y - 4}`, 1.4); }
  // Boca
  const M = shade(S, 0.5);
  if (f.eyes === 2) g.append(el('path', { d: 'M27 34 Q32 39.5 37 34 Z', fill: M }));
  else if (f.eyes === 4) g.append(el('ellipse', { cx: 32, cy: 35.5, rx: 2.2, ry: 2.6, fill: M }));
  else if (f.eyes === 3) g.append(el('path', { d: 'M28 36 Q32 33.5 36 36', fill: 'none', stroke: M, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
  else g.append(el('path', { d: 'M28 34 Q32 37 36 34', fill: 'none', stroke: M, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
}

function facialHair(g, facial, H) {
  const h2 = shade(H, 0.9);
  if (facial === 1 || facial === 4) g.append(el('path', { d: 'M20.5 30 C21 40 26 44 32 44 C38 44 43 40 43.5 30 C41 37 37 39 32 39 C27 39 23 37 20.5 30 Z', fill: h2 }));
  if (facial === 2 || facial === 4) g.append(el('path', { d: 'M26.5 33 Q32 30.5 37.5 33 Q32 32.2 26.5 33 Z', fill: h2, stroke: h2, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }));
  if (facial === 3) g.append(el('path', { d: 'M29 38 Q32 43 35 38 Q32 39.5 29 38 Z', fill: h2, stroke: h2, 'stroke-width': 1.2 }));
}

function glasses(g, kind) {
  const c = '#20262b';
  if (kind === 1) { g.append(el('circle', { cx: 27, cy: 28, r: 4, fill: 'none', stroke: c, 'stroke-width': 1.4 }), el('circle', { cx: 37, cy: 28, r: 4, fill: 'none', stroke: c, 'stroke-width': 1.4 }), el('path', { d: 'M31 28 H33', stroke: c, 'stroke-width': 1.4 })); }
  if (kind === 2) { g.append(el('rect', { x: 22, y: 25, width: 9, height: 6.5, rx: 1.2, fill: 'none', stroke: c, 'stroke-width': 1.5 }), el('rect', { x: 33, y: 25, width: 9, height: 6.5, rx: 1.2, fill: 'none', stroke: c, 'stroke-width': 1.5 }), el('path', { d: 'M31 28 H33', stroke: c, 'stroke-width': 1.5 })); }
  if (kind === 3) { g.append(el('rect', { x: 22, y: 25.5, width: 9, height: 5.5, rx: 2.5, fill: c }), el('rect', { x: 33, y: 25.5, width: 9, height: 5.5, rx: 2.5, fill: c }), el('path', { d: 'M31 27.5 H33', stroke: c, 'stroke-width': 1.5 })); }
  if (kind === 4) { g.append(el('ellipse', { cx: 27, cy: 28, rx: 4, ry: 3.4, fill: c }), el('path', { d: 'M20 22 L44 31', stroke: c, 'stroke-width': 1.2 })); }
}

function hat(g, kind, W) {
  const w = shade(W, 0.72);
  if (kind === 1) { g.append(el('path', { d: 'M19 23 C19 9 45 9 45 23 Z', fill: W }), el('path', { d: 'M17 23 H50 C50 25.5 46 26 42 25.5 H17 Z', fill: w }), el('circle', { cx: 32, cy: 10.5, r: 1.6, fill: w })); }
  if (kind === 2) g.append(el('rect', { x: 19.5, y: 19, width: 25, height: 4.5, rx: 2, fill: W }));
  if (kind === 3) { g.append(el('path', { d: 'M19 24 C19 7 45 7 45 24 Z', fill: W }), el('rect', { x: 18, y: 21, width: 28, height: 5, rx: 2.5, fill: w }), el('circle', { cx: 32, cy: 7, r: 2.6, fill: w })); }
}

// Misma firma que avatarSVGEl del pixel art. view no cambia el dibujo (siempre de frente).
export function vectorAvatar(seed, size = 40, face = null, _view = 'body', label = '', kit = null) {
  const f = resolveFace(seed, face);
  if (kit && Number.isInteger(kit.jersey)) f.jersey = kit.jersey;
  const S = AV_SKIN[f.skin]; const H = AV_HAIR[f.hair];
  const C1 = kit?.c1 || AV_SHIRT[f.shirt]; const C2 = kit?.c2 || AV_SHIRT[f.shirt2];
  const id = ++seq;
  const svg = el('svg', { class: 'vec-avatar avatar', viewBox: '0 0 64 64', width: size, height: size });
  if (label) { svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', label); } else svg.setAttribute('aria-hidden', 'true');
  const defs = el('defs');
  const round = el('clipPath', { id: `av-r-${id}` }); round.append(el('circle', { cx: 32, cy: 32, r: 32 }));
  const torso = el('clipPath', { id: `av-t-${id}` }); torso.append(el('path', { d: 'M8 66 C8 52 18 45 32 45 C46 45 56 52 56 66 Z' }));
  defs.append(round, torso);
  svg.append(defs);
  const g = el('g', { 'clip-path': `url(#av-r-${id})` });
  g.append(el('rect', { width: 64, height: 64, fill: shade(C1, 0.45) }), el('circle', { cx: 32, cy: 26, r: 26, fill: '#ffffff', 'fill-opacity': 0.06 }));
  hairBack(g, f.style, H);
  shirt(g, C1, C2, f.jersey, `av-t-${id}`);
  g.append(el('rect', { x: 27, y: 37, width: 10, height: 10, rx: 4, fill: shade(S, 0.82) })); // cuello
  g.append(el('ellipse', { cx: 19.6, cy: 29, rx: 2.4, ry: 3.4, fill: shade(S, 0.9) }), el('ellipse', { cx: 44.4, cy: 29, rx: 2.4, ry: 3.4, fill: shade(S, 0.9) })); // orejas
  g.append(el('ellipse', { cx: 32, cy: 28, rx: 12.5, ry: 14, fill: S }));
  hairFront(g, f.style, H);
  eyesAndMouth(g, f, S);
  g.append(el('path', { d: 'M32 29 Q30.5 32.5 32.6 32.6', fill: 'none', stroke: shade(S, 0.72), 'stroke-width': 1.3, 'stroke-linecap': 'round' })); // nariz
  facialHair(g, f.facial, H);
  glasses(g, f.glasses);
  hat(g, f.hat, AV_SHIRT[f.hatColor]);
  svg.append(g);
  return svg;
}
