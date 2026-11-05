/**
 * PDF-021: a drawing (DRAW-001) written as PDF vector graphics — paths,
 * strokes, fills and text kept as text — for the appearance of an annotation
 * or for the content of a page.
 *
 * The operators are in the drawing's own space (y downwards, origin at the
 * top left): the Form XObject that holds them maps that space onto the page
 * with its `/Matrix`.
 */
import type { Drawing } from '../draw/model';
import { drawingBody } from '../draw/svg';

type Matrix = [number, number, number, number, number, number];

export interface VectorFont {
  /** The text encoded for the font, as a PDF string (`<…>`), or null when the font has no glyph for it. */
  encode(text: string): string | null;
  width(text: string, size: number): number;
}

export interface VectorOps {
  /** The content stream. */
  ops: string;
  /** Whether the font `/F1` is used. */
  text: boolean;
  /** Graphics states by name: their opacity. */
  states: Record<string, number>;
}

const n = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** a·b: b applied first, then a. */
export function multiply(a: Matrix, b: Matrix): Matrix {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

export function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return [1, 0, 0, 1, 0, 0];
  // + 0: no -0 in the file.
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det].map((v) => v + 0) as Matrix;
}

export function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** An SVG `transform` attribute as a matrix. */
export function parseTransform(s: string | null): Matrix {
  let m: Matrix = [1, 0, 0, 1, 0, 0];
  if (!s) return m;
  for (const [, name, args] of s.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const v = args!.trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Matrix | undefined;
    switch (name) {
      case 'matrix':
        if (v.length === 6) t = v as Matrix;
        break;
      case 'translate':
        t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        break;
      case 'scale':
        t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const a = ((v[0] ?? 0) * Math.PI) / 180;
        const [c, s2] = [Math.cos(a), Math.sin(a)];
        t = [c, s2, -s2, c, 0, 0];
        if (v.length === 3) t = multiply(multiply([1, 0, 0, 1, v[1]!, v[2]!], t), [1, 0, 0, 1, -v[1]!, -v[2]!]);
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    if (t) m = multiply(m, t);
  }
  return m;
}

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0],
  orange: [255, 165, 0], gray: [128, 128, 128], grey: [128, 128, 128], purple: [128, 0, 128], navy: [0, 0, 128], lime: [0, 255, 0],
};

/** A CSS colour as RGB from 0 to 1, or null for none. */
export function parseColor(s: string | undefined, current = '#000000'): [number, number, number] | null {
  const v = (s ?? '').trim().toLowerCase();
  if (!v || v === 'none' || v === 'transparent') return null;
  if (v === 'currentcolor') return parseColor(current);
  let rgb: number[] | undefined;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const x = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    rgb = [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  } else if (/^rgba?\(/.test(v)) rgb = v.replace(/^rgba?\(|\)$/g, '').split(/[\s,/]+/).slice(0, 3).map((p) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p)));
  else rgb = NAMED[v];
  if (!rgb || rgb.some((c) => !Number.isFinite(c))) return [0, 0, 0];
  return rgb.map((c) => Math.min(1, Math.max(0, c / 255))) as [number, number, number];
}

// --- paths -----------------------------------------------------------------------------------

/** The arc of an SVG path as cubic Bézier curves (SVG 1.1, appendix F.6). */
function arcToCubics(x1: number, y1: number, rx: number, ry: number, angle: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  if (!rx || !ry) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (angle * Math.PI) / 180;
  const [cos, sin] = [Math.cos(phi), Math.sin(phi)];
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let k = den ? Math.sqrt(Math.max(0, num / den)) : 0;
  if (large === sweep) k = -k;
  const cxp = (k * rx * y1p) / ry;
  const cyp = (-k * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segments = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / segments;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => [cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin, cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos];
  const deriv = (t: number): [number, number] => [-rx * Math.sin(t) * cos - ry * Math.cos(t) * sin, -rx * Math.sin(t) * sin + ry * Math.cos(t) * cos];
  const out: number[][] = [];
  for (let i = 0; i < segments; i++) {
    const a = t1 + i * step;
    const b = a + step;
    const [p0, d0, p1, d1] = [point(a), deriv(a), point(b), deriv(b)];
    out.push([p0[0] + alpha * d0[0], p0[1] + alpha * d0[1], p1[0] - alpha * d1[0], p1[1] - alpha * d1[1], p1[0], p1[1]]);
  }
  return out;
}

/** The PDF path operators of an SVG path's data (every command, absolute and relative). */
export function pathOps(d: string): string {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: string[] = [];
  let i = 0;
  let cmd = '';
  let [x, y, sx, sy] = [0, 0, 0, 0];
  // The last control point, for S and T.
  let cubic: [number, number] | undefined;
  let quad: [number, number] | undefined;
  const numAt = (): number => Number(tokens[i++]);
  const more = (): boolean => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]!);
  const curve = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): void => {
    out.push(`${n(x1)} ${n(y1)} ${n(x2)} ${n(y2)} ${n(x3)} ${n(y3)} c`);
  };
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) cmd = tokens[i++]!;
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const [ox, oy] = rel ? [x, y] : [0, 0];
    const c = cmd.toUpperCase();
    let nextCubic: [number, number] | undefined;
    let nextQuad: [number, number] | undefined;
    if (c === 'Z') {
      out.push('h');
      [x, y] = [sx, sy];
      // Numbers after a Z mean nothing.
      cmd = '';
    } else if (c === 'M') {
      [x, y] = [ox + numAt(), oy + numAt()];
      [sx, sy] = [x, y];
      out.push(`${n(x)} ${n(y)} m`);
      // Further pairs are lines.
      cmd = rel ? 'l' : 'L';
    } else if (c === 'L') {
      [x, y] = [ox + numAt(), oy + numAt()];
      out.push(`${n(x)} ${n(y)} l`);
    } else if (c === 'H') {
      x = ox + numAt();
      out.push(`${n(x)} ${n(y)} l`);
    } else if (c === 'V') {
      y = oy + numAt();
      out.push(`${n(x)} ${n(y)} l`);
    } else if (c === 'C') {
      const v = [numAt(), numAt(), numAt(), numAt(), numAt(), numAt()];
      curve(ox + v[0]!, oy + v[1]!, ox + v[2]!, oy + v[3]!, ox + v[4]!, oy + v[5]!);
      nextCubic = [ox + v[2]!, oy + v[3]!];
      [x, y] = [ox + v[4]!, oy + v[5]!];
    } else if (c === 'S') {
      const v = [numAt(), numAt(), numAt(), numAt()];
      const [c1x, c1y] = cubic ? [2 * x - cubic[0], 2 * y - cubic[1]] : [x, y];
      curve(c1x, c1y, ox + v[0]!, oy + v[1]!, ox + v[2]!, oy + v[3]!);
      nextCubic = [ox + v[0]!, oy + v[1]!];
      [x, y] = [ox + v[2]!, oy + v[3]!];
    } else if (c === 'Q' || c === 'T') {
      const [qx, qy] = c === 'Q' ? [ox + numAt(), oy + numAt()] : quad ? [2 * x - quad[0], 2 * y - quad[1]] : [x, y];
      const [ex, ey] = [ox + numAt(), oy + numAt()];
      curve(x + ((qx - x) * 2) / 3, y + ((qy - y) * 2) / 3, ex + ((qx - ex) * 2) / 3, ey + ((qy - ey) * 2) / 3, ex, ey);
      nextQuad = [qx, qy];
      [x, y] = [ex, ey];
    } else if (c === 'A') {
      const [rx, ry, rot, large, sweep] = [numAt(), numAt(), numAt(), numAt(), numAt()];
      const [ex, ey] = [ox + numAt(), oy + numAt()];
      for (const b of arcToCubics(x, y, rx, ry, rot, !!large, !!sweep, ex, ey)) curve(b[0]!, b[1]!, b[2]!, b[3]!, b[4]!, b[5]!);
      [x, y] = [ex, ey];
    } else {
      // An unknown command: what follows is skipped.
      while (more()) i++;
      continue;
    }
    cubic = nextCubic;
    quad = nextQuad;
    // Data cut short: the path stops at the last whole command.
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      out.pop();
      break;
    }
  }
  return out.join('\n');
}

const K = 0.5522847498;

function ellipseOps(cx: number, cy: number, rx: number, ry: number): string {
  const [ox, oy] = [rx * K, ry * K];
  return [
    `${n(cx + rx)} ${n(cy)} m`,
    `${n(cx + rx)} ${n(cy + oy)} ${n(cx + ox)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)} c`,
    `${n(cx - ox)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + oy)} ${n(cx - rx)} ${n(cy)} c`,
    `${n(cx - rx)} ${n(cy - oy)} ${n(cx - ox)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)} c`,
    `${n(cx + ox)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - oy)} ${n(cx + rx)} ${n(cy)} c`,
    'h',
  ].join('\n');
}

function rectOps(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0) return `${n(x)} ${n(y)} ${n(w)} ${n(h)} re`;
  r = Math.min(r, w / 2, h / 2);
  const o = r * (1 - K);
  return [
    `${n(x + r)} ${n(y)} m`,
    `${n(x + w - r)} ${n(y)} l`,
    `${n(x + w - o)} ${n(y)} ${n(x + w)} ${n(y + o)} ${n(x + w)} ${n(y + r)} c`,
    `${n(x + w)} ${n(y + h - r)} l`,
    `${n(x + w)} ${n(y + h - o)} ${n(x + w - o)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`,
    `${n(x + r)} ${n(y + h)} l`,
    `${n(x + o)} ${n(y + h)} ${n(x)} ${n(y + h - o)} ${n(x)} ${n(y + h - r)} c`,
    `${n(x)} ${n(y + r)} l`,
    `${n(x)} ${n(y + o)} ${n(x + o)} ${n(y)} ${n(x + r)} ${n(y)} c`,
    'h',
  ].join('\n');
}

const pointsOf = (s: string | null): number[] => (s ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);

function polyOps(points: number[], closed: boolean): string {
  const out: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) out.push(`${n(points[i]!)} ${n(points[i + 1]!)} ${i ? 'l' : 'm'}`);
  if (closed && out.length) out.push('h');
  return out.join('\n');
}

// --- elements ----------------------------------------------------------------------------------

interface Paint {
  stroke: string;
  fill: string;
  width: number;
  dash: string;
  cap: string;
  join: string;
  opacity: number;
  color: string;
  size: number;
  anchor: string;
}

const INHERITED: [keyof Paint, string][] = [
  ['stroke', 'stroke'], ['fill', 'fill'], ['width', 'stroke-width'], ['dash', 'stroke-dasharray'], ['cap', 'stroke-linecap'],
  ['join', 'stroke-linejoin'], ['color', 'color'], ['size', 'font-size'], ['anchor', 'text-anchor'],
];

/** The painting properties of an element, from its attributes and style, over those of its parent. */
function paintOf(el: Element, parent: Paint): Paint {
  const p: Paint = { ...parent };
  const props: Record<string, string> = {};
  for (const [, attr] of INHERITED) {
    const v = el.getAttribute(attr);
    if (v !== null) props[attr] = v;
  }
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const [k, v] = decl.split(':').map((x) => x.trim());
    if (k && v) props[k] = v;
  }
  for (const [key, attr] of INHERITED) {
    const v = props[attr];
    if (v === undefined) continue;
    if (key === 'width' || key === 'size') {
      const f = parseFloat(v);
      if (Number.isFinite(f)) p[key] = f;
    } else (p as unknown as Record<string, string>)[key] = v;
  }
  const op = parseFloat(el.getAttribute('opacity') ?? '');
  if (Number.isFinite(op)) p.opacity *= op;
  return p;
}

const TEXTUAL = new Set(['title', 'desc', 'metadata', 'defs']);

/**
 * The operators of a drawing, in its own space; null when it holds what
 * cannot be written as vectors (a picture, a text the font cannot show) —
 * the caller then uses a picture of it.
 */
export function drawingOps(d: Drawing, font: VectorFont): VectorOps | null {
  const doc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${drawingBody(d)}</svg>`, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) return null;
  const out: string[] = [];
  const states: Record<string, number> = {};
  let text = false;
  const state = (alpha: number): string => {
    const name = `GS${Math.round(alpha * 100)}`;
    states[name] = Math.round(alpha * 100) / 100;
    return `/${name} gs`;
  };
  const base: Paint = { stroke: 'none', fill: '#000000', width: 1, dash: 'none', cap: 'butt', join: 'miter', opacity: 1, color: '#000000', size: 16, anchor: 'start' };

  const paintPath = (geometry: string, p: Paint, fillable = true): void => {
    if (!geometry) return;
    const fill = fillable ? parseColor(p.fill, p.color) : null;
    const stroke = p.width > 0 ? parseColor(p.stroke, p.color) : null;
    if (!fill && !stroke) return;
    const head: string[] = [];
    if (p.opacity < 1) head.push(state(p.opacity));
    if (fill) head.push(`${fill.map(n).join(' ')} rg`);
    if (stroke) {
      head.push(`${stroke.map(n).join(' ')} RG`, `${n(p.width)} w`);
      const dash = p.dash === 'none' ? [] : pointsOf(p.dash).filter((v) => Number.isFinite(v) && v >= 0);
      if (dash.length && dash.some((v) => v > 0)) head.push(`[${dash.map(n).join(' ')}] 0 d`);
      if (p.cap === 'round') head.push('1 J');
      else if (p.cap === 'square') head.push('2 J');
      if (p.join === 'round') head.push('1 j');
      else if (p.join === 'bevel') head.push('2 j');
    }
    out.push('q', ...head, geometry, fill && stroke ? 'B' : fill ? 'f' : 'S', 'Q');
  };

  const textOps = (x: number, y: number, s: string, p: Paint): boolean => {
    if (!s) return true;
    const encoded = font.encode(s);
    if (encoded === null) return false;
    const fill = parseColor(p.fill, p.color);
    if (!fill) return true;
    text = true;
    const w = font.width(s, p.size);
    const dx = p.anchor === 'middle' ? -w / 2 : p.anchor === 'end' ? -w : 0;
    // The text upright again in the drawing's space, where y goes down.
    out.push('q', ...(p.opacity < 1 ? [state(p.opacity)] : []), `${fill.map(n).join(' ')} rg`, 'BT', `/F1 ${n(p.size)} Tf`, `1 0 0 -1 ${n(x + dx)} ${n(y)} Tm`, `${encoded} Tj`, 'ET', 'Q');
    return true;
  };

  const num = (el: Element, name: string, fallback = 0): number => {
    const v = parseFloat(el.getAttribute(name) ?? '');
    return Number.isFinite(v) ? v : fallback;
  };

  const walk = (el: Element, parent: Paint): boolean => {
    if (TEXTUAL.has(el.localName)) return true;
    const p = paintOf(el, parent);
    const m = parseTransform(el.getAttribute('transform'));
    const moved = m.join(',') !== '1,0,0,1,0,0';
    if (moved) out.push('q', `${m.map(n).join(' ')} cm`);
    let ok = true;
    switch (el.localName) {
      case 'g':
      case 'svg':
        for (const child of Array.from(el.children)) if (!walk(child, p)) ok = false;
        break;
      case 'rect':
        paintPath(rectOps(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), num(el, 'rx', num(el, 'ry'))), p);
        break;
      case 'circle':
        paintPath(ellipseOps(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r')), p);
        break;
      case 'ellipse':
        paintPath(ellipseOps(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry')), p);
        break;
      case 'line':
        paintPath(polyOps([num(el, 'x1'), num(el, 'y1'), num(el, 'x2'), num(el, 'y2')], false), p, false);
        break;
      case 'polyline':
        paintPath(polyOps(pointsOf(el.getAttribute('points')), false), p);
        break;
      case 'polygon':
        paintPath(polyOps(pointsOf(el.getAttribute('points')), true), p);
        break;
      case 'path':
        paintPath(pathOps(el.getAttribute('d') ?? ''), p);
        break;
      case 'text': {
        const x = num(el, 'x');
        let y = num(el, 'y');
        const spans = Array.from(el.children).filter((c) => c.localName === 'tspan');
        if (!spans.length) ok = textOps(x, y, el.textContent ?? '', p);
        for (const span of spans) {
          y += num(span, 'dy');
          if (span.hasAttribute('y')) y = num(span, 'y');
          if (!textOps(span.hasAttribute('x') ? num(span, 'x') : x, y, span.textContent ?? '', paintOf(span, p))) ok = false;
        }
        break;
      }
      default:
        // A picture, a gradient, foreign content…
        ok = false;
    }
    if (moved) out.push('Q');
    return ok;
  };

  for (const child of Array.from(root.children)) if (!walk(child, base)) return null;
  return { ops: out.join('\n'), text, states };
}

/** The characters of the standard fonts' WinAnsi encoding beyond Latin-1. */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/**
 * A font of the WinAnsi encoding (Helvetica…), to tell whether a drawing can
 * be written as vectors with it; its widths are rough.
 */
export const WIN_ANSI: VectorFont = {
  encode: (text) => ([...text].every((c) => (c >= ' ' && c <= '~') || (c >= '\u00a0' && c <= '\u00ff') || WIN_ANSI_EXTRA.includes(c)) ? '<>' : null),
  width: (text, size) => text.length * size * 0.5,
};

/** The texts of a drawing, for the comment of its annotation. */
export function drawingText(d: Drawing): string {
  return d.shapes
    .map((s) => (s.kind === 'text' ? s.text : s.kind === 'line' ? (s.label ?? '') : ''))
    .filter(Boolean)
    .join('\n');
}
