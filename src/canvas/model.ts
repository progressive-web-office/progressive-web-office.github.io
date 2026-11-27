/**
 * CANVAS-001, CANVAS-004: canvases in the open JSON Canvas 1.0 format
 * (`.canvas`) — nodes (text, file, link, group) placed on an infinite plane
 * and edges between them. The parser is tolerant: fields and node types it
 * does not know are kept as they are, and written back in their place.
 */

export type CanvasSide = 'top' | 'right' | 'bottom' | 'left';
export type CanvasEnd = 'none' | 'arrow';
export const SIDES: readonly CanvasSide[] = ['top', 'right', 'bottom', 'left'];

/** A node; fields of other node types or later versions are kept in the object. */
export interface CanvasNode {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** A preset colour ("1".."6") or `#RRGGBB`. */
  color?: string;
  /** Text node: Markdown. */
  text?: string;
  /** File node: path from the root of the folder, and an optional `#heading`. */
  file?: string;
  subpath?: string;
  /** Link node. */
  url?: string;
  /** Group node. */
  label?: string;
  background?: string;
  backgroundStyle?: string;
  [key: string]: unknown;
}

export interface CanvasEdge {
  id: string;
  fromNode: string;
  fromSide?: CanvasSide;
  fromEnd?: CanvasEnd;
  toNode: string;
  toSide?: CanvasSide;
  toEnd?: CanvasEnd;
  color?: string;
  label?: string;
  [key: string]: unknown;
}

export interface CanvasDoc {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  /** The other top-level fields, in their order (`nodes` and `edges` among them when the file had them). */
  rest: Record<string, unknown>;
  /** Indentation of the source, kept when the canvas is written back. */
  indent: string;
}

export class CanvasError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasError';
  }
}

/** Colours of the six presets (red, orange, yellow, green, cyan, purple). */
export const PRESET_COLOURS: Record<string, string> = {
  '1': '#e5484d',
  '2': '#f08c3a',
  '3': '#e2c53d',
  '4': '#46a758',
  '5': '#3ab0c4',
  '6': '#8e6cd8',
};

/** The CSS colour of a canvas colour, or undefined for none or an invalid one. */
export function colourCss(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined;
  if (PRESET_COLOURS[color]) return PRESET_COLOURS[color];
  return /^#[0-9a-f]{6}$/i.test(color) || /^#[0-9a-f]{3}$/i.test(color) ? color : undefined;
}

const isSide = (v: unknown): v is CanvasSide => SIDES.includes(v as CanvasSide);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function detectIndent(text: string): string {
  const m = /\n([ \t]+)"/.exec(text);
  return m ? m[1]! : '  ';
}

/** Read a canvas; an empty file is an empty canvas. */
export function parseCanvas(text: string): CanvasDoc {
  const source = text.replace(/^﻿/, '');
  if (!source.trim()) return { nodes: [], edges: [], rest: {}, indent: '  ' };
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch (e) {
    throw new CanvasError(`not JSON: ${(e as Error).message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CanvasError('not a canvas object');
  const top = raw as Record<string, unknown>;
  const nodesRaw = top.nodes ?? [];
  const edgesRaw = top.edges ?? [];
  if (!Array.isArray(nodesRaw)) throw new CanvasError('"nodes" is not a list');
  if (!Array.isArray(edgesRaw)) throw new CanvasError('"edges" is not a list');
  const nodes = nodesRaw.map((n, i): CanvasNode => {
    if (!n || typeof n !== 'object') throw new CanvasError(`node ${i + 1} is not an object`);
    const node = n as CanvasNode;
    if (typeof node.id !== 'string' || !node.id) throw new CanvasError(`node ${i + 1} has no id`);
    if (typeof node.type !== 'string') throw new CanvasError(`node ${node.id} has no type`);
    for (const k of ['x', 'y', 'width', 'height'] as const) if (!finite(node[k])) throw new CanvasError(`node ${node.id} has no ${k}`);
    return node;
  });
  const edges = edgesRaw.map((e, i): CanvasEdge => {
    if (!e || typeof e !== 'object') throw new CanvasError(`edge ${i + 1} is not an object`);
    const edge = e as CanvasEdge;
    if (typeof edge.id !== 'string' || !edge.id) throw new CanvasError(`edge ${i + 1} has no id`);
    if (typeof edge.fromNode !== 'string' || typeof edge.toNode !== 'string') throw new CanvasError(`edge ${edge.id} has no ends`);
    return edge;
  });
  return { nodes, edges, rest: top, indent: detectIndent(source) };
}

/** Write a canvas: the fields kept in their order, `nodes` and `edges` updated. */
export function serializeCanvas(doc: CanvasDoc): string {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.rest)) out[k] = k === 'nodes' ? doc.nodes : k === 'edges' ? doc.edges : v;
  if (!('nodes' in out)) out.nodes = doc.nodes;
  if (!('edges' in out)) out.edges = doc.edges;
  return `${JSON.stringify(out, null, doc.indent)}\n`;
}

export const emptyCanvasText = (): string => serializeCanvas({ nodes: [], edges: [], rest: {}, indent: '  ' });

/** A random identifier of 16 hexadecimal digits, as canvases use. */
export function newId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const id = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (!used.has(id)) return id;
  }
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The rectangle holding every node (a zero rectangle for an empty canvas). */
export function bounds(nodes: readonly Rect[]): Rect {
  if (!nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x = Math.min(...nodes.map((n) => n.x));
  const y = Math.min(...nodes.map((n) => n.y));
  const right = Math.max(...nodes.map((n) => n.x + n.width));
  const bottom = Math.max(...nodes.map((n) => n.y + n.height));
  return { x, y, width: right - x, height: bottom - y };
}

const inside = (a: Rect, b: Rect): boolean => a.x >= b.x && a.y >= b.y && a.x + a.width <= b.x + b.width && a.y + a.height <= b.y + b.height;

/** The nodes lying wholly inside a group (they move with it). */
export function nodesInGroup(group: CanvasNode, nodes: readonly CanvasNode[]): CanvasNode[] {
  return nodes.filter((n) => n !== group && n.id !== group.id && inside(n, group));
}

export interface Point {
  x: number;
  y: number;
}

/** The middle of a side of a node. */
export function anchor(n: Rect, side: CanvasSide): Point {
  switch (side) {
    case 'top':
      return { x: n.x + n.width / 2, y: n.y };
    case 'bottom':
      return { x: n.x + n.width / 2, y: n.y + n.height };
    case 'left':
      return { x: n.x, y: n.y + n.height / 2 };
    case 'right':
      return { x: n.x + n.width, y: n.y + n.height / 2 };
  }
}

/** The sides facing each other, when an edge does not say. */
export function facingSides(from: Rect, to: Rect): [CanvasSide, CanvasSide] {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** The side of a node nearest to a point. */
export function nearestSide(n: Rect, p: Point): CanvasSide {
  let best: CanvasSide = 'top';
  let dist = Infinity;
  for (const s of SIDES) {
    const a = anchor(n, s);
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < dist) {
      dist = d;
      best = s;
    }
  }
  return best;
}

const NORMAL: Record<CanvasSide, Point> = { top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };

export interface EdgeGeometry {
  from: Point;
  to: Point;
  c1: Point;
  c2: Point;
  /** SVG path data of the curve. */
  path: string;
  /** Middle of the curve (for the label). */
  middle: Point;
  /** Direction at each end, pointing out of the curve (for arrow heads). */
  fromDir: Point;
  toDir: Point;
}

/** A cubic curve leaving each node perpendicularly to its side. */
export function edgeGeometry(from: Rect, to: Rect, fromSide?: CanvasSide, toSide?: CanvasSide): EdgeGeometry {
  const [fs, ts] = facingSides(from, to);
  const s1 = fromSide ?? fs;
  const s2 = toSide ?? ts;
  const p1 = anchor(from, s1);
  const p2 = anchor(to, s2);
  const reach = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3);
  const c1 = { x: p1.x + NORMAL[s1].x * reach, y: p1.y + NORMAL[s1].y * reach };
  const c2 = { x: p2.x + NORMAL[s2].x * reach, y: p2.y + NORMAL[s2].y * reach };
  const at = (t: number, a: number, b: number, c: number, d: number): number => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d;
  const middle = { x: at(0.5, p1.x, c1.x, c2.x, p2.x), y: at(0.5, p1.y, c1.y, c2.y, p2.y) };
  const unit = (v: Point): Point => {
    const l = Math.hypot(v.x, v.y) || 1;
    return { x: v.x / l, y: v.y / l };
  };
  return {
    from: p1,
    to: p2,
    c1,
    c2,
    path: `M ${round(p1.x)} ${round(p1.y)} C ${round(c1.x)} ${round(c1.y)}, ${round(c2.x)} ${round(c2.y)}, ${round(p2.x)} ${round(p2.y)}`,
    middle,
    fromDir: unit({ x: p1.x - c1.x, y: p1.y - c1.y }),
    toDir: unit({ x: p2.x - c2.x, y: p2.y - c2.y }),
  };
}

const round = (v: number): number => Math.round(v * 10) / 10;

/** Points of an arrow head at `tip`, pointing along `dir`. */
export function arrowHead(tip: Point, dir: Point, size = 12): string {
  const back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size };
  const side = { x: -dir.y * size * 0.5, y: dir.x * size * 0.5 };
  return [tip, { x: back.x + side.x, y: back.y + side.y }, { x: back.x - side.x, y: back.y - side.y }].map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
}

/** An edge's ends, with the defaults of the format (no arrow at the start, an arrow at the end). */
export const edgeEnds = (e: CanvasEdge): { from: CanvasEnd; to: CanvasEnd } => ({ from: e.fromEnd === 'arrow' ? 'arrow' : 'none', to: e.toEnd === 'none' ? 'none' : 'arrow' });

export const sideOf = (v: unknown): CanvasSide | undefined => (isSide(v) ? v : undefined);

/** Groups first (drawn behind), in their order, then the other nodes in theirs. */
export function drawingOrder(nodes: readonly CanvasNode[]): CanvasNode[] {
  return [...nodes.filter((n) => n.type === 'group'), ...nodes.filter((n) => n.type !== 'group')];
}
