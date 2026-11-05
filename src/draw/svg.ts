/**
 * DRAW-003: a drawing saved as a standalone SVG, the editable drawing kept in
 * its metadata; an SVG made elsewhere opened with its simple shapes editable.
 */
import { bbox, junctions, type Drawing, type LineShape, type Pt, type Shape, type Style, type SymbolShape, type TextShape } from './model';
import { lineGap, lineSizes, runLines, runsOf } from './rich';
import { symbolDef } from './symbols';

const NS = 'http://www.w3.org/2000/svg';
const META = 'pwo-drawing';
export const DEFAULT_STROKE = '#000000';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number): string => String(Math.round(v * 100) / 100);

function styleAttrs(s: Style, fillDefault = 'none'): string {
  const w = s.width ?? 1.5;
  let a = ` stroke="${esc(s.stroke ?? DEFAULT_STROKE)}" stroke-width="${n(w)}" fill="${esc(s.fill ?? fillDefault)}"`;
  if (s.dash === 'dash') a += ` stroke-dasharray="${n(4 * w)} ${n(2 * w)}"`;
  if (s.dash === 'dot') a += ` stroke-dasharray="0 ${n(2 * w)}" stroke-linecap="round"`;
  if (s.opacity !== undefined && s.opacity < 1) a += ` opacity="${n(s.opacity)}"`;
  return a;
}

function arrow(tip: Pt, from: Pt, w: number, color: string): string {
  const a = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
  const size = 4 + 2.5 * w;
  const p = (da: number): string => `${n(tip[0] - size * Math.cos(a + da))} ${n(tip[1] - size * Math.sin(a + da))}`;
  return `<path d="M${n(tip[0])} ${n(tip[1])}L${p(0.4)}L${p(-0.4)}Z" fill="${esc(color)}" stroke="none"/>`;
}

const pointsAttr = (pts: Pt[]): string => pts.map(([x, y]) => `${n(x)},${n(y)}`).join(' ');

/** A smooth path through freehand points (quadratic curves through the midpoints). */
export function smoothPath(pts: Pt[]): string {
  if (pts.length < 3) return `M${pointsAttr(pts).replace(/ /g, 'L')}`;
  let d = `M${n(pts[0]![0])} ${n(pts[0]![1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]!;
    const [nx, ny] = pts[i + 1]!;
    d += `Q${n(x)} ${n(y)} ${n((x + nx) / 2)} ${n((y + ny) / 2)}`;
  }
  const last = pts[pts.length - 1]!;
  return `${d}L${n(last[0])} ${n(last[1])}`;
}

function textEl(x: number, y: number, text: string, size: number, color: string, anchor = 'start', extra = ''): string {
  const lines = text.split('\n');
  const tspans = lines.length === 1 ? esc(text) : lines.map((l, i) => `<tspan x="${n(x)}" dy="${i ? n(size * 1.2) : 0}">${esc(l)}</tspan>`).join('');
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" fill="${esc(color)}"${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}${extra}>${tspans}</text>`;
}

/** DRAW-001, PDF-021: a text whose parts have their own looks: one tspan a line, one inside for each part. */
function richTextEl(s: TextShape, extra: string): string {
  const base = s.size ?? 16;
  const sizes = lineSizes(s);
  const lines = runLines(runsOf(s)).map((line, i) => {
    const parts = line
      .map((r) => {
        const a: string[] = [];
        if (r.size !== undefined) a.push(`font-size="${n(r.size)}"`);
        if (r.bold) a.push('font-weight="bold"');
        if (r.italic) a.push('font-style="italic"');
        if (r.underline) a.push('text-decoration="underline"');
        if (r.fill) a.push(`fill="${esc(r.fill)}"`);
        return a.length ? `<tspan ${a.join(' ')}>${esc(r.text)}</tspan>` : esc(r.text);
      })
      .join('');
    return `<tspan x="${n(s.x)}" dy="${i ? n(lineGap(sizes[i - 1]!, sizes[i]!)) : 0}">${parts || ' '}</tspan>`;
  });
  return `<text x="${n(s.x)}" y="${n(s.y)}" font-size="${n(base)}" fill="${esc(s.fill ?? s.stroke ?? DEFAULT_STROKE)}"${extra}>${lines.join('')}</text>`;
}

function symbolSvg(s: SymbolShape): string {
  const def = symbolDef(s.sym);
  const color = s.stroke ?? DEFAULT_STROKE;
  const t = `translate(${n(s.x)} ${n(s.y)})${s.rot ? ` rotate(${s.rot})` : ''}${s.mirror ? ' scale(-1 1)' : ''}`;
  let out = `<g data-id="${esc(s.id)}" class="symbol" transform="${t}" color="${esc(color)}"${styleAttrs({ ...s, stroke: 'currentColor' })} stroke-linejoin="round">${def?.body ?? '<rect x="-10" y="-10" width="20" height="20"/>'}</g>`;
  const box = bbox(s)!;
  const label = (x: number, y: number, text: string, anchor: string): string => textEl(x, y, text, 11, color, anchor, ` data-for="${esc(s.id)}"`);
  if (def?.inside) {
    if (s.value) out += textEl(s.x, s.y + 4, s.value, 12, color, 'middle', ` data-for="${esc(s.id)}"`);
    return out;
  }
  // Beside a vertical symbol (a battery, a source, or any symbol turned), above and below a horizontal one.
  const horizontal = box[2] - box[0] >= box[3] - box[1];
  // DRAW-012: a ladder variable above its contact or coil, an SFC condition to the right of its transition.
  if (def?.label === 'above' && horizontal) {
    if (s.value) out += label(s.x, box[1] - 4, s.value, 'middle');
    if (s.ref) out += label(s.x, box[3] + 13, s.ref, 'middle');
    return out;
  }
  if (def?.label === 'right') {
    if (s.value) out += label(box[2] + 6, s.y + 4, s.value, 'start');
    if (s.ref) out += label(box[0] - 6, s.y + 4, s.ref, 'end');
    return out;
  }
  if (horizontal) {
    if (s.ref) out += label(s.x, box[1] - 4, s.ref, 'middle');
    if (s.value) out += label(s.x, box[3] + 13, s.value, 'middle');
  } else {
    const x = box[2] + 5;
    if (s.ref && s.value) out += label(x, s.y - 2, s.ref, 'start') + label(x, s.y + 11, s.value, 'start');
    else if (s.ref || s.value) out += label(x, s.y + 4, (s.ref ?? s.value)!, 'start');
  }
  return out;
}

function lineSvg(s: LineShape): string {
  const color = s.stroke ?? DEFAULT_STROKE;
  const w = s.width ?? (s.wire ? 1.5 : 1.5);
  const tag = s.closed ? 'polygon' : 'polyline';
  let out = `<${tag} data-id="${esc(s.id)}" points="${pointsAttr(s.points)}"${styleAttrs(s)} stroke-linejoin="round"/>`;
  const pts = s.points;
  if (pts.length >= 2) {
    if (s.end === 'arrow') out += arrow(pts[pts.length - 1]!, pts[pts.length - 2]!, w, color);
    if (s.start === 'arrow') out += arrow(pts[0]!, pts[1]!, w, color);
  }
  if (s.label && pts.length >= 2) {
    const i = Math.floor((pts.length - 1) / 2);
    const [a, b] = [pts[i]!, pts[i + 1]!];
    // Beside a vertical segment, above another.
    const vertical = a[0] === b[0];
    out += vertical
      ? textEl(a[0] + 6, (a[1] + b[1]) / 2 + 4, s.label, 12, color, 'start', ` data-for="${esc(s.id)}"`)
      : textEl((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 5, s.label, 12, color, 'middle', ` data-for="${esc(s.id)}"`);
  }
  return out;
}

export function shapeSvg(s: Shape): string {
  const id = s.kind === 'raw' ? '' : ` data-id="${esc(s.id)}"`;
  switch (s.kind) {
    case 'rect':
      return `<rect${id} x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}"${s.r ? ` rx="${n(s.r)}"` : ''}${styleAttrs(s)}/>`;
    case 'ellipse':
      return `<ellipse${id} cx="${n(s.x + s.w / 2)}" cy="${n(s.y + s.h / 2)}" rx="${n(s.w / 2)}" ry="${n(s.h / 2)}"${styleAttrs(s)}/>`;
    case 'line':
      return lineSvg(s);
    case 'free':
      return `<path${id} d="${smoothPath(s.points)}"${styleAttrs({ width: 2.5, ...s })} stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'text':
      if (s.runs && runsOf(s) === s.runs) return richTextEl(s, `${id}${s.opacity !== undefined && s.opacity < 1 ? ` opacity="${n(s.opacity)}"` : ''}`);
      return textEl(s.x, s.y, s.text, s.size ?? 16, s.fill ?? s.stroke ?? DEFAULT_STROKE, 'start', `${id}${s.opacity !== undefined && s.opacity < 1 ? ` opacity="${n(s.opacity)}"` : ''}`);
    case 'symbol':
      return symbolSvg(s);
    case 'path':
      return `<path${id} d="${esc(s.d)}"${styleAttrs(s)}${s.dx || s.dy ? ` transform="translate(${n(s.dx ?? 0)} ${n(s.dy ?? 0)})"` : ''}/>`;
    case 'raw':
      return `<g data-id="${esc(s.id)}"${s.dx || s.dy ? ` transform="translate(${n(s.dx ?? 0)} ${n(s.dy ?? 0)})"` : ''}>${s.markup}</g>`;
  }
}

/** The shapes, junction dots included, without the svg element. */
export function drawingBody(d: Drawing): string {
  let out = d.shapes.map(shapeSvg).join('');
  for (const [x, y] of junctions(d)) out += `<circle cx="${n(x)}" cy="${n(y)}" r="3" fill="${DEFAULT_STROKE}" class="junction"/>`;
  return out;
}

export function toSvg(d: Drawing): string {
  const json = esc(JSON.stringify(d));
  return (
    `<svg xmlns="${NS}" width="${n(d.width)}" height="${n(d.height)}" viewBox="0 0 ${n(d.width)} ${n(d.height)}" font-family="sans-serif">` +
    (d.alt ? `<title>${esc(d.alt)}</title>` : '') +
    `<metadata id="${META}">${json}</metadata>` +
    drawingBody(d) +
    '</svg>'
  );
}

/** Whether an SVG holds an editable drawing made here. */
export function isDrawing(svg: string): boolean {
  return svg.includes(`<metadata id="${META}">`);
}

const num = (el: Element, name: string, fallback = 0): number => {
  const v = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(v) ? v : fallback;
};

function readStyle(el: Element): Style {
  const props: Record<string, string> = {};
  for (const name of ['stroke', 'fill', 'stroke-width', 'opacity']) {
    const v = el.getAttribute(name);
    if (v) props[name] = v;
  }
  for (const decl of (el.getAttribute('style') ?? '').split(';')) {
    const [k, v] = decl.split(':').map((x) => x.trim());
    if (k && v) props[k] = v;
  }
  const st: Style = {};
  if (props.stroke && props.stroke !== 'none') st.stroke = props.stroke;
  // SVG fills shapes in black unless told otherwise.
  st.fill = props.fill ?? (el.localName === 'line' || el.localName === 'polyline' ? 'none' : '#000000');
  if (props['stroke-width']) st.width = parseFloat(props['stroke-width']);
  if (props.opacity) st.opacity = parseFloat(props.opacity);
  if (!props.stroke || props.stroke === 'none') st.width = st.width ?? 0;
  return st;
}

const parsePoints = (s: string): Pt[] => {
  const v = s.trim().split(/[\s,]+/).map(Number);
  const out: Pt[] = [];
  for (let i = 0; i + 1 < v.length; i += 2) out.push([v[i]!, v[i + 1]!]);
  return out;
};

function importElement(el: Element, id: string): Shape {
  const raw = (): Shape => ({ id, kind: 'raw', markup: new XMLSerializer().serializeToString(el).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, '') });
  if (el.hasAttribute('transform')) return raw();
  const st = readStyle(el);
  switch (el.localName) {
    case 'rect': {
      const r = num(el, 'rx', num(el, 'ry'));
      return { id, kind: 'rect', x: num(el, 'x'), y: num(el, 'y'), w: num(el, 'width'), h: num(el, 'height'), ...(r ? { r } : {}), ...st };
    }
    case 'circle': {
      const r = num(el, 'r');
      return { id, kind: 'ellipse', x: num(el, 'cx') - r, y: num(el, 'cy') - r, w: 2 * r, h: 2 * r, ...st };
    }
    case 'ellipse': {
      const [rx, ry] = [num(el, 'rx'), num(el, 'ry')];
      return { id, kind: 'ellipse', x: num(el, 'cx') - rx, y: num(el, 'cy') - ry, w: 2 * rx, h: 2 * ry, ...st };
    }
    case 'line':
      return { id, kind: 'line', points: [[num(el, 'x1'), num(el, 'y1')], [num(el, 'x2'), num(el, 'y2')]], ...st };
    case 'polyline':
    case 'polygon':
      return { id, kind: 'line', points: parsePoints(el.getAttribute('points') ?? ''), ...(el.localName === 'polygon' ? { closed: true } : {}), ...st };
    case 'path':
      return { id, kind: 'path', d: el.getAttribute('d') ?? '', ...st };
    case 'text': {
      if (el.children.length) return raw();
      const size = parseFloat(el.getAttribute('font-size') ?? '') || 16;
      return { id, kind: 'text', x: num(el, 'x'), y: num(el, 'y'), text: el.textContent ?? '', size, ...(st.fill !== '#000000' ? { fill: st.fill } : {}) };
    }
    default:
      return raw();
  }
}

export function fromSvg(text: string): Drawing {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Not an SVG picture');
  const meta = root.querySelector(`metadata#${META}`);
  if (meta?.textContent) {
    const d = JSON.parse(meta.textContent) as Drawing;
    if (Array.isArray(d.shapes)) return d;
  }
  const vb = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const width = parseFloat(root.getAttribute('width') ?? '') || vb[2] || 640;
  const height = parseFloat(root.getAttribute('height') ?? '') || vb[3] || 400;
  const d: Drawing = { width, height, grid: 10, showGrid: false, shapes: [] };
  const title = root.querySelector(':scope > title')?.textContent?.trim();
  if (title) d.alt = title;
  let i = 0;
  for (const el of Array.from(root.children)) {
    if (['title', 'desc', 'metadata'].includes(el.localName)) continue;
    d.shapes.push(importElement(el, `i${++i}`));
  }
  return d;
}
