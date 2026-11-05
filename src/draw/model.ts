/**
 * DRAW-001..DRAW-006: the drawing model — shapes, connectors and schematic
 * symbols, in drawing units (CSS pixels at 100 %).
 */
import { lineGap, lineSizes, runLines, runsOf } from './rich';
import { symbolDef, type Pt } from './symbols';

export type { Pt };

export interface Style {
  stroke?: string;
  /** Stroke width. */
  width?: number;
  dash?: 'dash' | 'dot';
  fill?: string;
  opacity?: number;
}

export interface End {
  shape: string;
  /** Index of the pin or connection point. */
  pin: number;
}

export interface RectShape extends Style { id: string; kind: 'rect'; x: number; y: number; w: number; h: number; r?: number }
export interface EllipseShape extends Style { id: string; kind: 'ellipse'; x: number; y: number; w: number; h: number }
export interface LineShape extends Style {
  id: string;
  kind: 'line';
  points: Pt[];
  closed?: boolean;
  start?: 'arrow';
  end?: 'arrow';
  /** Routed in right angles. */
  ortho?: boolean;
  /** An electrical wire (junction dots, no arrows). */
  wire?: boolean;
  from?: End;
  to?: End;
  label?: string;
}
export interface FreeShape extends Style { id: string; kind: 'free'; points: Pt[] }
/** A part of a text with a look of its own (DRAW-001, PDF-021); unset fields take the box's. */
export interface TextRun { text: string; size?: number; bold?: boolean; italic?: boolean; underline?: boolean; fill?: string }
/** `text` is always the whole text; `runs`, when set, cut it in parts with their own looks. */
export interface TextShape extends Style { id: string; kind: 'text'; x: number; y: number; text: string; size?: number; runs?: TextRun[] }
export interface SymbolShape extends Style { id: string; kind: 'symbol'; sym: string; x: number; y: number; rot: 0 | 90 | 180 | 270; mirror?: boolean; ref?: string; value?: string }
/** An imported SVG path, moved as a whole. */
export interface PathShape extends Style { id: string; kind: 'path'; d: string; dx?: number; dy?: number }
/** SVG markup kept as it was (groups, transforms, pictures…), moved as a whole. */
export interface RawShape { id: string; kind: 'raw'; markup: string; dx?: number; dy?: number }

export type Shape = RectShape | EllipseShape | LineShape | FreeShape | TextShape | SymbolShape | PathShape | RawShape;

export interface Drawing {
  width: number;
  height: number;
  /** Grid step; 0 for none. */
  grid: number;
  showGrid?: boolean;
  /** Alternative text (DRAW-011). */
  alt?: string;
  shapes: Shape[];
}

export const GRID = 10;

export function emptyDrawing(width = 640, height = 400): Drawing {
  return { width, height, grid: GRID, showGrid: true, shapes: [] };
}

let counter = 0;
export function newId(d: Drawing): string {
  const ids = new Set(d.shapes.map((s) => s.id));
  let id: string;
  do id = `s${(++counter).toString(36)}`;
  while (ids.has(id));
  return id;
}

export function snap(v: number, grid: number): number {
  return grid > 0 ? Math.round(v / grid) * grid : v;
}

export function shapeById(d: Drawing, id: string): Shape | undefined {
  return d.shapes.find((s) => s.id === id);
}

/** A point of a symbol, turned and mirrored like it, in drawing coordinates. */
export function placePoint(s: SymbolShape, [px, py]: Pt): Pt {
  const x0 = s.mirror ? -px : px;
  const [x, y] = s.rot === 90 ? [-py, x0] : s.rot === 180 ? [-x0, -py] : s.rot === 270 ? [py, -x0] : [x0, py];
  return [s.x + x + 0, s.y + y + 0];
}

export function pinsOf(s: SymbolShape): Pt[] {
  return (symbolDef(s.sym)?.pins ?? []).map((p) => placePoint(s, p));
}

/** The points connectors attach to: pins of symbols, middles of the sides of shapes. */
export function connectionPoints(s: Shape): Pt[] {
  if (s.kind === 'symbol') return pinsOf(s);
  if (s.kind === 'rect' || s.kind === 'ellipse') return [[s.x + s.w / 2, s.y], [s.x + s.w, s.y + s.h / 2], [s.x + s.w / 2, s.y + s.h], [s.x, s.y + s.h / 2]];
  return [];
}

/** The bounding box [x0, y0, x1, y1] of a shape, when it can be known without rendering. */
export function bbox(s: Shape): [number, number, number, number] | undefined {
  switch (s.kind) {
    case 'rect':
    case 'ellipse':
      return [s.x, s.y, s.x + s.w, s.y + s.h];
    case 'line':
    case 'free': {
      const xs = s.points.map((p) => p[0]);
      const ys = s.points.map((p) => p[1]);
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }
    case 'symbol': {
      const def = symbolDef(s.sym);
      if (!def) return [s.x - 10, s.y - 10, s.x + 10, s.y + 10];
      const [a, b, c, e] = def.box;
      const pts = [placePoint(s, [a, b]), placePoint(s, [c, e])];
      return [Math.min(pts[0]![0], pts[1]![0]), Math.min(pts[0]![1], pts[1]![1]), Math.max(pts[0]![0], pts[1]![0]), Math.max(pts[0]![1], pts[1]![1])];
    }
    case 'text': {
      const sizes = lineSizes(s);
      const widths = runLines(runsOf(s)).map((line) => line.reduce((w, r) => w + r.text.length * (r.size ?? s.size ?? 16) * (r.bold ? 0.6 : 0.55), 0));
      const below = sizes.slice(1).reduce((y, z, i) => y + lineGap(sizes[i]!, z), 0);
      return [s.x, s.y - sizes[0]!, s.x + Math.max(...widths), s.y + below + sizes[sizes.length - 1]! * 0.3];
    }
    default:
      return undefined;
  }
}

/** The next free reference with this prefix (R1, R2…). */
export function nextRef(d: Drawing, prefix: string): string {
  let max = 0;
  for (const s of d.shapes) {
    if (s.kind !== 'symbol' || !s.ref?.startsWith(prefix)) continue;
    const n = Number(s.ref.slice(prefix.length));
    if (Number.isInteger(n)) max = Math.max(max, n);
  }
  return `${prefix}${max + 1}`;
}

export function placeSymbol(d: Drawing, sym: string, x: number, y: number): SymbolShape {
  const def = symbolDef(sym);
  const s: SymbolShape = { id: newId(d), kind: 'symbol', sym, x: snap(x, d.grid), y: snap(y, d.grid), rot: 0 };
  if (def?.prefix) s.ref = nextRef(d, def.prefix);
  d.shapes.push(s);
  return s;
}

const PREFIXES: Record<string, string> = { p: 'p', n: 'n', u: 'µ', µ: 'µ', m: 'm', k: 'k', K: 'k', M: 'M', G: 'G' };

/** A value written the usual way: "4k7" → "4.7 kΩ", "100n" → "100 nF" (UNIT-001 symbols). */
export function formatValue(input: string, unit: string | undefined): string {
  const v = input.trim();
  if (!unit) return v;
  const esc = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rkm = new RegExp(`^(\\d+)([pnuµmkKMG])(\\d+)\\s*(?:${esc})?$`).exec(v);
  if (rkm) return `${rkm[1]}.${rkm[3]} ${PREFIXES[rkm[2]!]}${unit}`;
  const m = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*([pnuµmkKMG]?)\\s*(?:${esc})?$`).exec(v);
  if (!m) return v;
  return `${m[1]!.replace(',', '.')} ${m[2] ? PREFIXES[m[2]] : ''}${unit}`;
}

/** A path in right angles from a to b, horizontal first unless told otherwise. */
export function route(a: Pt, b: Pt, horizontalFirst = true): Pt[] {
  if (a[0] === b[0] || a[1] === b[1]) return [a, b];
  return [a, horizontalFirst ? [b[0], a[1]] : [a[0], b[1]], b];
}

const same = (a: Pt, b: Pt): boolean => a[0] === b[0] && a[1] === b[1];

function clean(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) if (!out.length || !same(out[out.length - 1]!, p)) out.push(p);
  // Drop the middle point of three in a row.
  for (let i = out.length - 2; i > 0; i--) {
    const [a, b, c] = [out[i - 1]!, out[i]!, out[i + 1]!];
    if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1);
  }
  return out;
}

function endPoint(d: Drawing, end: End | undefined): Pt | undefined {
  if (!end) return undefined;
  const s = shapeById(d, end.shape);
  return s ? connectionPoints(s)[end.pin] : undefined;
}

/** Moves the end of an orthogonal path to p, bending the segment next to it. */
function moveEnd(points: Pt[], p: Pt, atStart: boolean): Pt[] {
  const pts = atStart ? [...points] : [...points].reverse();
  const old = pts[0]!;
  if (pts.length < 3) {
    // A straight wire keeps its direction from its fixed end, then bends.
    const other = pts[pts.length - 1]!;
    pts.splice(0, pts.length, ...route(other, p, old[1] === other[1]).reverse());
  } else {
    const next = pts[1]!;
    const horizontal = old[1] === next[1];
    pts[0] = p;
    pts[1] = horizontal ? [next[0], p[1]] : [p[0], next[1]];
  }
  const out = clean(pts);
  return atStart ? out : out.reverse();
}

/** Brings the ends of attached connectors back onto their pins. */
export function reconnect(d: Drawing): void {
  for (const s of d.shapes) {
    if (s.kind !== 'line') continue;
    const a = endPoint(d, s.from);
    const b = endPoint(d, s.to);
    if (!s.ortho) {
      if (a) s.points[0] = a;
      if (b) s.points[s.points.length - 1] = b;
      continue;
    }
    if (a && !same(a, s.points[0]!)) s.points = moveEnd(s.points, a, true);
    if (b && !same(b, s.points[s.points.length - 1]!)) s.points = moveEnd(s.points, b, false);
  }
}

/** The connectors attached to a shape. */
export function attachedTo(d: Drawing, id: string): LineShape[] {
  return d.shapes.filter((s): s is LineShape => s.kind === 'line' && (s.from?.shape === id || s.to?.shape === id));
}

export function translate(s: Shape, dx: number, dy: number): void {
  switch (s.kind) {
    case 'line':
    case 'free':
      s.points = s.points.map(([x, y]) => [x + dx, y + dy]);
      break;
    case 'path':
    case 'raw':
      s.dx = (s.dx ?? 0) + dx;
      s.dy = (s.dy ?? 0) + dy;
      break;
    default:
      s.x += dx;
      s.y += dy;
  }
}

/** Moves shapes; connectors follow the shapes they are attached to. */
export function moveShapes(d: Drawing, ids: string[], dx: number, dy: number): void {
  const set = new Set(ids);
  for (const s of d.shapes) if (set.has(s.id)) translate(s, dx, dy);
  reconnect(d);
}

export function rotate(d: Drawing, ids: string[]): void {
  for (const s of d.shapes) if (ids.includes(s.id) && s.kind === 'symbol') s.rot = ((s.rot + 90) % 360) as SymbolShape['rot'];
  reconnect(d);
}

export function mirror(d: Drawing, ids: string[]): void {
  for (const s of d.shapes) if (ids.includes(s.id) && s.kind === 'symbol') s.mirror = !s.mirror;
  reconnect(d);
}

/** Removes shapes, and the connectors left attached to nothing. */
export function remove(d: Drawing, ids: string[]): void {
  const set = new Set(ids);
  d.shapes = d.shapes.filter((s) => !set.has(s.id));
  for (const s of d.shapes) {
    if (s.kind !== 'line') continue;
    if (s.from && set.has(s.from.shape)) delete s.from;
    if (s.to && set.has(s.to.shape)) delete s.to;
  }
}

/** Copies of shapes, shifted; new references; connectors between copied shapes follow. */
export function duplicate(d: Drawing, ids: string[], dx: number, dy: number): Shape[] {
  const map = new Map<string, string>();
  const copies: Shape[] = [];
  for (const s of d.shapes.filter((x) => ids.includes(x.id))) {
    const c = structuredClone(s);
    c.id = newId(d);
    map.set(s.id, c.id);
    translate(c, dx, dy);
    if (c.kind === 'symbol' && c.ref) {
      const prefix = symbolDef(c.sym)?.prefix;
      if (prefix) c.ref = nextRef(d, prefix);
    }
    d.shapes.push(c);
    copies.push(c);
  }
  for (const c of copies) {
    if (c.kind !== 'line') continue;
    if (c.from) c.from = map.has(c.from.shape) ? { ...c.from, shape: map.get(c.from.shape)! } : undefined;
    if (c.to) c.to = map.has(c.to.shape) ? { ...c.to, shape: map.get(c.to.shape)! } : undefined;
    if (!c.from) delete c.from;
    if (!c.to) delete c.to;
  }
  return copies;
}

const onSegment = (p: Pt, a: Pt, b: Pt): boolean =>
  (a[0] === b[0] && p[0] === a[0] && p[1] > Math.min(a[1], b[1]) && p[1] < Math.max(a[1], b[1])) ||
  (a[1] === b[1] && p[1] === a[1] && p[0] > Math.min(a[0], b[0]) && p[0] < Math.max(a[0], b[0]));

/** Where three or more wire branches meet (DRAW-006), sorted. */
export function junctions(d: Drawing): Pt[] {
  const wires = d.shapes.filter((s): s is LineShape => s.kind === 'line' && !!s.wire);
  const candidates = new Map<string, Pt>();
  for (const w of wires) for (const p of w.points) candidates.set(p.join(), p);
  const pins = new Set(d.shapes.flatMap((s) => (s.kind === 'symbol' ? pinsOf(s).map((p) => p.join()) : [])));
  const out: Pt[] = [];
  for (const [key, p] of candidates) {
    let n = pins.has(key) ? 1 : 0;
    for (const w of wires) {
      const pts = w.points;
      for (let i = 0; i < pts.length; i++) {
        if (!same(pts[i]!, p)) continue;
        // An end counts once, a bend twice.
        n += i === 0 || i === pts.length - 1 ? 1 : 2;
      }
      for (let i = 1; i < pts.length; i++) if (onSegment(p, pts[i - 1]!, pts[i]!)) n += 2;
    }
    if (n >= 3) out.push(p);
  }
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}
