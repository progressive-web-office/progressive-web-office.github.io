/**
 * CANVAS-001..CANVAS-004: a canvas (JSON Canvas 1.0, `.canvas`) shown and
 * edited — cards of text (Markdown), files of the folder, web addresses and
 * groups on a plane that scrolls and zooms, connected by edges — and saved
 * in the same format, keeping what the application does not know.
 */
import './canvas.css';
import { button, h } from '../app/dom';
import { attachZoomPan, zoomAt } from '../app/zoom-pan';
import type { EditorView, ProjectSource, ViewContext } from '../app/views';
import { t, type MessageKey } from '../i18n';
import { findPath } from '../fs/path';
import {
  arrowHead,
  bounds,
  CanvasError,
  colourCss,
  drawingOrder,
  edgeEnds,
  edgeGeometry,
  nearestSide,
  newId,
  nodesInGroup,
  parseCanvas,
  serializeCanvas,
  sideOf,
  SIDES,
  type CanvasDoc,
  type CanvasEdge,
  type CanvasNode,
  type CanvasSide,
  type Point,
  type Rect,
} from './model';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Room around the cards, in canvas units. */
const MARGIN = 400;
const MIN_SIZE = 40;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 4;
const HISTORY = 100;
const PICTURE = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
const NOTE = /\.(md|markdown)$/i;
const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif', svg: 'image/svg+xml' };

type Drag =
  | { kind: 'move'; start: Point; moved: boolean; before: string; nodes: { node: CanvasNode; x: number; y: number }[] }
  | { kind: 'resize'; start: Point; moved: boolean; before: string; node: CanvasNode; width: number; height: number }
  | { kind: 'connect'; from: CanvasNode; side: CanvasSide; path: SVGPathElement }
  | { kind: 'pan'; x: number; y: number };

/** A node to add: its type, size, fields and (otherwise the middle of the view) its place. */
interface NewNode {
  type: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
  text?: string;
  file?: string;
  url?: string;
  label?: string;
}

const basename = (path: string): string => path.split('/').pop() ?? path;
const dirname = (path: string): string => path.split('/').slice(0, -1).join('/');

/** The path of `target` (from the root of the folder) as seen from the folder `fromDir`. */
export function relativePath(fromDir: string, target: string): string {
  const from = fromDir.split('/').filter(Boolean);
  const to = target.split('/').filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  return [...Array<string>(from.length - common).fill('..'), ...to.slice(common)].join('/');
}

export class CanvasView implements EditorView {
  readonly element: HTMLElement;
  private doc: CanvasDoc;
  /** The text of a file that could not be read: saved as it was. */
  private readonly unreadable: Uint8Array | undefined;
  private zoom = 1;
  /** Canvas coordinates of the top left corner of the plane shown. */
  private offset: Point = { x: -MARGIN, y: -MARGIN };
  private readonly selection = new Set<string>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private readOnly = false;
  private drag: Drag | undefined;
  private readonly urls: string[] = [];
  private readonly scroller: HTMLElement;
  private readonly surface = h('div', { class: 'canvas-surface' });
  private readonly world = h('div', { class: 'canvas-world' });
  private readonly svg = document.createElementNS(SVG_NS, 'svg');
  private readonly layer = h('div', { class: 'canvas-layer' });
  private readonly labels = h('div', { class: 'canvas-labels' });
  private readonly zoomLabel = h('span', { class: 'canvas-zoom', 'aria-live': 'polite' });
  private readonly colour: HTMLSelectElement;
  private readonly custom = h('input', { type: 'color', class: 'canvas-custom-colour', 'aria-label': t('canvas.colourCustom'), tabindex: '-1' });
  private readonly tools: HTMLButtonElement[] = [];
  private readonly message = h('p', { class: 'canvas-message', role: 'status' });
  private readonly onMove = (e: PointerEvent): void => this.pointerMove(e);
  private readonly onUp = (e: PointerEvent): void => this.pointerUp(e);

  constructor(
    bytes: Uint8Array,
    private readonly ctx: ViewContext,
    fileName = 'canvas.canvas',
  ) {
    let problem = '';
    try {
      this.doc = parseCanvas(new TextDecoder().decode(bytes));
    } catch (e) {
      if (!(e instanceof CanvasError)) throw e;
      problem = e.message;
      this.doc = { nodes: [], edges: [], rest: {}, indent: '  ' };
      this.unreadable = bytes;
    }
    this.scroller = h('div', { class: 'canvas-scroller', tabindex: '0', role: 'application', 'aria-label': t('canvas.surface', { name: fileName }) });
    this.svg.setAttribute('class', 'canvas-edges');
    this.svg.setAttribute('aria-hidden', 'true');
    this.world.append(this.svg, this.layer, this.labels);
    this.surface.append(this.world);
    this.scroller.append(this.surface);

    const tool = (label: MessageKey, title: MessageKey, run: () => void, icon?: string): HTMLButtonElement => {
      const b = button(t(label), run, { title: t(title), ...(icon ? { icon } : {}) });
      this.tools.push(b);
      return b;
    };
    this.colour = h(
      'select',
      { 'aria-label': t('canvas.colour'), title: t('canvas.colour') },
      h('option', { value: '' }, t('canvas.colourNone')),
      ...['1', '2', '3', '4', '5', '6'].map((c) => h('option', { value: c }, t(`canvas.colour${c}` as MessageKey))),
      h('option', { value: 'custom' }, t('canvas.colourCustom')),
    );
    this.colour.addEventListener('change', () => {
      if (this.colour.value === 'custom') {
        this.custom.click();
        return;
      }
      this.setColour(this.colour.value || undefined);
    });
    this.custom.addEventListener('input', () => this.setColour(this.custom.value));
    const toolbar = h(
      'div',
      { class: 'canvas-toolbar', role: 'toolbar', 'aria-label': t('canvas.toolbar') },
      tool('canvas.addText', 'canvas.addTextTitle', () => this.addText(), '▭'),
      tool('canvas.addFile', 'canvas.addFileTitle', () => void this.addFile(), '📄'),
      tool('canvas.addLink', 'canvas.addLinkTitle', () => void this.addLink(), '🔗'),
      tool('canvas.addGroup', 'canvas.addGroupTitle', () => this.addGroup(), '⬚'),
      this.colour,
      this.custom,
      tool('canvas.delete', 'canvas.deleteTitle', () => this.deleteSelection(), '🗑'),
      tool('canvas.undo', 'canvas.undo', () => this.undo(), '↶'),
      tool('canvas.redo', 'canvas.redo', () => this.redo(), '↷'),
      button(t('canvas.zoomOut'), () => this.zoomBy(1 / 1.25), { text: '−', className: 'icon' }),
      this.zoomLabel,
      button(t('canvas.zoomIn'), () => this.zoomBy(1.25), { text: '+', className: 'icon' }),
      button(t('canvas.fit'), () => this.fit(), { title: t('canvas.fitTitle') }),
    );
    this.element = h('div', { class: 'canvas-view' }, toolbar, this.message, this.scroller);
    if (problem) {
      this.message.textContent = t('canvas.invalid', { message: problem });
      this.message.classList.add('error');
      this.setReadOnly(true);
    }

    attachZoomPan(this.scroller, { content: () => this.world, zoom: () => this.zoom, setZoom: (z) => this.applyZoom(z) });
    this.scroller.addEventListener('pointerdown', (e) => this.pointerDown(e));
    this.scroller.addEventListener('dblclick', (e) => this.doubleClick(e));
    this.scroller.addEventListener('keydown', (e) => this.key(e));
    this.scroller.addEventListener('click', (e) => this.click(e));
    this.render();
  }

  // ---------------------------------------------------------------- the view

  private project(): ProjectSource | undefined {
    return this.ctx.folderProject?.();
  }

  /** The files of the folder, listed once. */
  private files: Promise<string[]> | undefined;

  /** FOLDER-033: the file a node names, found as links are (relative, from the root, by its end, by its name). */
  private async locate(project: ProjectSource, path: string): Promise<string | undefined> {
    this.files ??= project.walk('').then((list) => list.map((f) => f.path)).catch(() => []);
    return findPath(path, project.path, await this.files, ['.md']);
  }

  private rectOf(n: Rect): Rect {
    return { x: n.x - this.offset.x, y: n.y - this.offset.y, width: n.width, height: n.height };
  }

  /** Draw everything again (after a change of structure). */
  render(): void {
    const b = bounds(this.doc.nodes);
    const next = { x: Math.floor(b.x - MARGIN), y: Math.floor(b.y - MARGIN) };
    // The plane grows to the left or the top: what is shown stays in place.
    const dx = (this.offset.x - next.x) * this.zoom;
    const dy = (this.offset.y - next.y) * this.zoom;
    this.offset = next;
    const width = Math.max(b.width + 2 * MARGIN, 800);
    const height = Math.max(b.height + 2 * MARGIN, 600);
    this.world.style.width = `${width}px`;
    this.world.style.height = `${height}px`;
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.applyZoom(this.zoom);
    if (dx) this.scroller.scrollLeft += dx;
    if (dy) this.scroller.scrollTop += dy;
    this.layer.replaceChildren(...drawingOrder(this.doc.nodes).map((n) => this.nodeElement(n)));
    this.drawEdges();
    this.element.classList.toggle('canvas-read-only', this.readOnly);
    if (!this.doc.nodes.length && !this.unreadable) this.message.textContent = t('canvas.empty');
    else if (!this.unreadable) this.message.textContent = '';
    this.updateColour();
  }

  private applyZoom(z: number): void {
    this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
    this.world.style.transform = `scale(${this.zoom})`;
    const w = parseFloat(this.world.style.width || '0');
    const hgt = parseFloat(this.world.style.height || '0');
    this.surface.style.width = `${w * this.zoom}px`;
    this.surface.style.height = `${hgt * this.zoom}px`;
    this.zoomLabel.textContent = t('canvas.zoom', { zoom: Math.round(this.zoom * 100) });
    this.ctx.statusChanged();
  }

  private zoomBy(factor: number): void {
    zoomAt(this.scroller, { content: () => this.world, zoom: () => this.zoom, setZoom: (z) => this.applyZoom(z) }, this.zoom * factor);
  }

  /** CANVAS-002: the whole canvas in the window. */
  fit(): void {
    const b = bounds(this.doc.nodes);
    const w = this.scroller.clientWidth || 800;
    const hgt = this.scroller.clientHeight || 600;
    if (!this.doc.nodes.length) {
      this.applyZoom(1);
      this.scroller.scrollLeft = MARGIN - 40;
      this.scroller.scrollTop = MARGIN - 40;
      return;
    }
    this.applyZoom(Math.min(1.5, (w - 48) / Math.max(1, b.width), (hgt - 48) / Math.max(1, b.height)));
    this.scroller.scrollLeft = (b.x - this.offset.x) * this.zoom - 24;
    this.scroller.scrollTop = (b.y - this.offset.y) * this.zoom - 24;
  }

  private place(el: HTMLElement, n: CanvasNode): void {
    const r = this.rectOf(n);
    el.style.left = `${r.x}px`;
    el.style.top = `${r.y}px`;
    el.style.width = `${r.width}px`;
    el.style.height = `${r.height}px`;
  }

  private nodeElement(node: CanvasNode): HTMLElement {
    const known = ['text', 'file', 'link', 'group'].includes(node.type);
    const el = h('div', {
      class: `canvas-node canvas-${known ? node.type : 'unknown'}${this.selection.has(node.id) ? ' selected' : ''}`,
      'data-id': node.id,
      role: 'group',
      'aria-label': this.nodeLabel(node),
    });
    this.place(el, node);
    const colour = colourCss(node.color);
    if (colour) el.style.setProperty('--canvas-colour', colour);
    if (node.type === 'text') el.append(h('div', { class: 'canvas-md' }, ...this.markdown(node.text ?? '')));
    else if (node.type === 'file') el.append(...this.fileContent(node));
    else if (node.type === 'link') {
      const url = typeof node.url === 'string' ? node.url : '';
      el.append(h('div', { class: 'canvas-link-url' }, url), button(t('canvas.openLink', { url }), () => this.openUrl(url), { text: '↗', className: 'icon canvas-open' }));
    } else if (node.type === 'group') {
      el.append(h('div', { class: 'canvas-group-label' }, typeof node.label === 'string' ? node.label : ''));
      void this.groupBackground(el, node);
    } else el.append(h('div', { class: 'canvas-unknown-type' }, t('canvas.unknown', { type: node.type })));
    if (!this.readOnly) {
      for (const side of SIDES) el.append(h('span', { class: `canvas-handle canvas-handle-${side}`, 'data-side': side, title: t('canvas.connect') }));
      el.append(h('span', { class: 'canvas-resize', title: t('canvas.resize') }));
    }
    return el;
  }

  private nodeLabel(n: CanvasNode): string {
    if (n.type === 'text') return (n.text ?? '').split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').slice(0, 60) ?? '';
    if (n.type === 'file') return basename(n.file ?? '');
    if (n.type === 'link') return n.url ?? '';
    if (n.type === 'group') return n.label ?? t('canvas.group');
    return n.type;
  }

  /** Markdown shown read-only (never as HTML from the file). */
  private markdown(text: string): Node[] {
    const box = h('div');
    void import('../document/markdown-reader').then(async ({ readMarkdown }) => {
      const { blocksToDom } = await import('../document/html');
      const doc = readMarkdown(text);
      box.replaceChildren(
        blocksToDom(doc.blocks, document, (key) => {
          const res = doc.resources.get(key);
          if (!res) return undefined;
          const url = URL.createObjectURL(new Blob([res.data as BlobPart], { type: res.mediaType }));
          this.urls.push(url);
          return { url };
        }),
      );
    });
    // Shown at once as plain text, replaced by the rendered Markdown.
    box.textContent = text;
    return [box];
  }

  private fileContent(node: CanvasNode): Node[] {
    const path = typeof node.file === 'string' ? node.file : '';
    const subpath = typeof node.subpath === 'string' ? node.subpath : '';
    const head = h('div', { class: 'canvas-file-name', title: t('canvas.openFile') }, `${basename(path)}${subpath}`);
    const body = h('div', { class: 'canvas-file-body' });
    const project = this.project();
    if (!project) body.append(h('p', { class: 'hint' }, t('canvas.noFolder')));
    else if (PICTURE.test(path) || NOTE.test(path)) {
      void this.locate(project, path)
        .then((found) => {
          if (!found) throw new Error('missing');
          return project.read(found);
        })
        .then((bytes) => {
          if (PICTURE.test(path)) {
            const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[path.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' }));
            this.urls.push(url);
            body.replaceChildren(h('img', { src: url, alt: basename(path), draggable: 'false' }));
          } else body.replaceChildren(h('div', { class: 'canvas-md' }, ...this.markdown(new TextDecoder().decode(bytes))));
        })
        .catch(() => body.replaceChildren(h('p', { class: 'hint error' }, t('canvas.missing', { name: path }))));
    }
    return [head, body];
  }

  private async groupBackground(el: HTMLElement, node: CanvasNode): Promise<void> {
    const project = this.project();
    if (!project || typeof node.background !== 'string' || !PICTURE.test(node.background)) return;
    try {
      const found = await this.locate(project, node.background);
      if (!found) return;
      const bytes = await project.read(found);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[node.background.split('.').pop()!.toLowerCase()] ?? 'application/octet-stream' }));
      this.urls.push(url);
      el.style.backgroundImage = `url("${url}")`;
      el.style.backgroundSize = node.backgroundStyle === 'repeat' ? 'auto' : node.backgroundStyle === 'ratio' ? 'contain' : 'cover';
      el.style.backgroundRepeat = node.backgroundStyle === 'repeat' ? 'repeat' : 'no-repeat';
    } catch {
      /* the background is left out */
    }
  }

  private drawEdges(): void {
    const byId = new Map(this.doc.nodes.map((n) => [n.id, n]));
    const parts: SVGElement[] = [];
    const labels: HTMLElement[] = [];
    for (const edge of this.doc.edges) {
      const from = byId.get(edge.fromNode);
      const to = byId.get(edge.toNode);
      if (!from || !to) continue;
      const g = edgeGeometry(this.rectOf(from), this.rectOf(to), sideOf(edge.fromSide), sideOf(edge.toSide));
      const colour = colourCss(edge.color) ?? 'var(--canvas-edge, #8a8f98)';
      const selected = this.selection.has(`edge:${edge.id}`);
      const group = document.createElementNS(SVG_NS, 'g');
      group.setAttribute('class', `canvas-edge${selected ? ' selected' : ''}`);
      group.dataset.edge = edge.id;
      const hit = document.createElementNS(SVG_NS, 'path');
      hit.setAttribute('d', g.path);
      hit.setAttribute('class', 'canvas-edge-hit');
      const line = document.createElementNS(SVG_NS, 'path');
      line.setAttribute('d', g.path);
      line.setAttribute('class', 'canvas-edge-line');
      line.setAttribute('stroke', colour);
      group.append(hit, line);
      const ends = edgeEnds(edge);
      for (const [end, tip, dir] of [
        [ends.from, g.from, g.fromDir],
        [ends.to, g.to, g.toDir],
      ] as const) {
        if (end !== 'arrow') continue;
        const head = document.createElementNS(SVG_NS, 'polygon');
        head.setAttribute('points', arrowHead(tip, dir));
        head.setAttribute('fill', colour);
        group.append(head);
      }
      parts.push(group);
      if (typeof edge.label === 'string' && edge.label) {
        const label = h('div', { class: `canvas-edge-label${selected ? ' selected' : ''}`, 'data-edge': edge.id }, edge.label);
        label.style.left = `${g.middle.x}px`;
        label.style.top = `${g.middle.y}px`;
        labels.push(label);
      }
    }
    this.svg.replaceChildren(...parts);
    this.labels.replaceChildren(...labels);
  }

  // ---------------------------------------------------------------- changes

  private snapshot(): string {
    return JSON.stringify({ nodes: this.doc.nodes, edges: this.doc.edges });
  }

  /** Keep the state before a change, for undo (CANVAS-003). */
  private remember(before = this.snapshot()): void {
    this.undoStack.push(before);
    if (this.undoStack.length > HISTORY) this.undoStack.shift();
    this.redoStack = [];
  }

  private changed(): void {
    this.ctx.changed();
    this.ctx.statusChanged();
  }

  /** Apply a change: remembered for undo, drawn again, the document marked as changed. */
  private change(apply: () => void): void {
    if (this.readOnly) return;
    this.remember();
    apply();
    this.render();
    this.changed();
  }

  private restore(state: string): void {
    const { nodes, edges } = JSON.parse(state) as { nodes: CanvasNode[]; edges: CanvasEdge[] };
    this.doc.nodes = nodes;
    this.doc.edges = edges;
    for (const id of [...this.selection]) if (!nodes.some((n) => n.id === id) && !edges.some((e) => `edge:${e.id}` === id)) this.selection.delete(id);
    this.render();
    this.changed();
  }

  undo(): void {
    const state = this.undoStack.pop();
    if (state === undefined || this.readOnly) return;
    this.redoStack.push(this.snapshot());
    this.restore(state);
  }

  redo(): void {
    const state = this.redoStack.pop();
    if (state === undefined || this.readOnly) return;
    this.undoStack.push(this.snapshot());
    this.restore(state);
  }

  private ids(): string[] {
    return [...this.doc.nodes.map((n) => n.id), ...this.doc.edges.map((e) => e.id)];
  }

  /** The middle of what is shown, in canvas units. */
  private centre(): Point {
    const w = this.scroller.clientWidth || 800;
    const hgt = this.scroller.clientHeight || 600;
    return { x: (this.scroller.scrollLeft + w / 2) / this.zoom + this.offset.x, y: (this.scroller.scrollTop + hgt / 2) / this.zoom + this.offset.y };
  }

  private addNode(node: NewNode): CanvasNode {
    const c = this.centre();
    const { type, x, y, width, height, ...fields } = node;
    // The fields in the order of the format: id, type, its own fields, then the place.
    const ordered: CanvasNode = { id: newId(this.ids()), type, ...fields, x: Math.round(x ?? c.x - width / 2), y: Math.round(y ?? c.y - height / 2), width, height };
    this.change(() => {
      if (ordered.type === 'group') this.doc.nodes.unshift(ordered);
      else this.doc.nodes.push(ordered);
      this.selection.clear();
      this.selection.add(ordered.id);
    });
    return ordered;
  }

  /** CANVAS-003: a text card, edited at once. */
  addText(text = ''): CanvasNode {
    const node = this.addNode({ type: 'text', text, width: 260, height: 140 });
    if (!text) this.editText(node);
    return node;
  }

  async addFile(): Promise<void> {
    if (this.readOnly) return;
    const project = this.project();
    let path: string | null;
    if (project) {
      const files = (await project.walk('')).map((f) => f.path).filter((p) => !p.split('/').some((s) => s.startsWith('.')) && p !== project.path).sort();
      if (!files.length) return this.ctx.notify?.(t('canvas.noFiles'));
      path = await this.ctx.choose(t('canvas.fileTitle'), t('canvas.fileMessage'), files.slice(0, 500), files[0]!);
    } else path = await this.ask(t('canvas.filePrompt'), '');
    if (!path) return;
    this.addNode({ type: 'file', file: path, width: PICTURE.test(path) ? 320 : 400, height: PICTURE.test(path) ? 240 : 400 });
  }

  async addLink(): Promise<void> {
    if (this.readOnly) return;
    const url = (await this.ask(t('canvas.linkPrompt'), 'https://'))?.trim();
    if (!url) return;
    if (!/^(https?|mailto):/i.test(url)) return this.ctx.notify?.(t('canvas.badLink', { url }));
    this.addNode({ type: 'link', url, width: 400, height: 120 });
  }

  /** A group around the selected cards, or an empty one. */
  addGroup(): CanvasNode {
    const chosen = this.doc.nodes.filter((n) => this.selection.has(n.id));
    if (chosen.length) {
      const b = bounds(chosen);
      return this.addNode({ type: 'group', label: t('canvas.group'), x: b.x - 30, y: b.y - 30, width: b.width + 60, height: b.height + 60 });
    }
    return this.addNode({ type: 'group', label: t('canvas.group'), width: 480, height: 320 });
  }

  /** CANVAS-003: an edge between two cards. */
  connect(fromId: string, fromSide: CanvasSide, toId: string, toSide: CanvasSide): CanvasEdge | undefined {
    if (fromId === toId || this.readOnly) return undefined;
    const edge: CanvasEdge = { id: newId(this.ids()), fromNode: fromId, fromSide, toNode: toId, toSide };
    this.change(() => {
      this.doc.edges.push(edge);
      this.selection.clear();
      this.selection.add(`edge:${edge.id}`);
    });
    return edge;
  }

  /** Move cards (and the cards inside the groups moved). */
  moveNodes(ids: string[], dx: number, dy: number): void {
    const moving = this.withGroups(ids);
    this.change(() => {
      for (const n of moving) {
        n.x = Math.round(n.x + dx);
        n.y = Math.round(n.y + dy);
      }
    });
  }

  private withGroups(ids: Iterable<string>): CanvasNode[] {
    const out = new Set<CanvasNode>();
    for (const id of ids) {
      const n = this.doc.nodes.find((x) => x.id === id);
      if (!n) continue;
      out.add(n);
      if (n.type === 'group') for (const inner of nodesInGroup(n, this.doc.nodes)) out.add(inner);
    }
    return [...out];
  }

  setText(id: string, text: string): void {
    const n = this.doc.nodes.find((x) => x.id === id);
    if (!n || n.text === text) return;
    this.change(() => void (n.text = text));
  }

  setColour(colour: string | undefined): void {
    const nodes = this.doc.nodes.filter((n) => this.selection.has(n.id));
    const edges = this.doc.edges.filter((e) => this.selection.has(`edge:${e.id}`));
    if (!nodes.length && !edges.length) return this.updateColour();
    this.change(() => {
      for (const x of [...nodes, ...edges]) {
        if (colour) x.color = colour;
        else delete x.color;
      }
    });
  }

  private updateColour(): void {
    const first = this.doc.nodes.find((n) => this.selection.has(n.id)) ?? this.doc.edges.find((e) => this.selection.has(`edge:${e.id}`));
    const c = typeof first?.color === 'string' ? first.color : '';
    this.colour.value = c === '' || /^[1-6]$/.test(c) ? c : 'custom';
    if (c.startsWith('#')) this.custom.value = c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c;
  }

  /** Delete the selected cards and edges (and the edges of the cards deleted). */
  deleteSelection(): void {
    if (!this.selection.size) return;
    const nodes = new Set(this.doc.nodes.filter((n) => this.selection.has(n.id)).map((n) => n.id));
    this.change(() => {
      this.doc.nodes = this.doc.nodes.filter((n) => !nodes.has(n.id));
      this.doc.edges = this.doc.edges.filter((e) => !this.selection.has(`edge:${e.id}`) && !nodes.has(e.fromNode) && !nodes.has(e.toNode));
      this.selection.clear();
    });
  }

  select(ids: string[]): void {
    this.selection.clear();
    for (const id of ids) this.selection.add(id);
    this.render();
  }

  // ---------------------------------------------------------------- editing in place

  private nodeEl(id: string): HTMLElement | undefined {
    return [...this.layer.querySelectorAll<HTMLElement>('.canvas-node')].find((e) => e.dataset.id === id);
  }

  editText(node: CanvasNode): void {
    if (this.readOnly || node.type !== 'text') return;
    const el = this.nodeEl(node.id);
    if (!el) return;
    const area = h('textarea', { class: 'canvas-edit', 'aria-label': t('canvas.editText'), spellcheck: 'true' });
    area.value = node.text ?? '';
    el.querySelector('.canvas-md')?.replaceWith(area);
    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      if (keep && area.value !== (node.text ?? '')) this.setText(node.id, area.value);
      else this.render();
      this.scroller.focus();
    };
    area.addEventListener('blur', () => finish(true));
    area.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) finish(true);
    });
    area.addEventListener('pointerdown', (e) => e.stopPropagation());
    area.focus();
  }

  /** Edit a label in place (a group's, an edge's). */
  private editLabel(target: HTMLElement, current: string, set: (value: string) => void): void {
    if (this.readOnly) return;
    const input = h('input', { type: 'text', class: 'canvas-label-edit', 'aria-label': t('canvas.editLabel') });
    input.value = current;
    target.replaceChildren(input);
    let done = false;
    const finish = (keep: boolean): void => {
      if (done) return;
      done = true;
      if (keep && input.value !== current) set(input.value);
      else this.render();
      this.scroller.focus();
    };
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'Enter') finish(true);
    });
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
    input.focus();
    input.select();
  }

  setEdgeLabel(id: string, label: string): void {
    const e = this.doc.edges.find((x) => x.id === id);
    if (!e) return;
    this.change(() => {
      if (label) e.label = label;
      else delete e.label;
    });
  }

  setGroupLabel(id: string, label: string): void {
    const n = this.doc.nodes.find((x) => x.id === id);
    if (!n) return;
    this.change(() => {
      if (label) n.label = label;
      else delete n.label;
    });
  }

  private ask(label: string, value: string): Promise<string | null> {
    return new Promise((resolve) => {
      const input = h('input', { type: 'text', 'aria-label': label });
      input.value = value;
      const dialog = h('dialog', { class: 'dialog', 'aria-label': label });
      const close = (v: string | null): void => {
        dialog.close();
        dialog.remove();
        resolve(v);
      };
      input.addEventListener('keydown', (e) => e.key === 'Enter' && close(input.value));
      dialog.append(
        h('label', { class: 'vault-field' }, h('span', {}, label), input),
        h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => close(null)), button(t('common.ok'), () => close(input.value), { className: 'primary' })),
      );
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        close(null);
      });
      this.element.append(dialog);
      dialog.showModal?.();
      input.focus();
    });
  }

  // ---------------------------------------------------------------- opening (CANVAS-002)

  openFile(node: CanvasNode): void {
    const project = this.project();
    if (!project || typeof node.file !== 'string') return void this.ctx.notify?.(t('canvas.noFolder'));
    const file = node.file;
    void this.locate(project, file).then((found) => {
      if (!found) return void this.ctx.notify?.(t('canvas.missing', { name: file }));
      const rel = relativePath(dirname(project.path), found);
      if (!this.ctx.openLink?.(encodeURI(rel))) this.ctx.notify?.(t('canvas.noFolder'));
    });
  }

  openUrl(url: string): void {
    if (!/^(https?|mailto):/i.test(url)) return void this.ctx.notify?.(t('canvas.badLink', { url }));
    if (window.confirm(t('canvas.openLinkConfirm', { url }))) window.open(url, '_blank', 'noopener,noreferrer');
  }

  private click(e: MouseEvent): void {
    // Links in Markdown cards: notes of the folder or web addresses.
    const a = (e.target as Element).closest?.('.canvas-md a[href]') as HTMLAnchorElement | null;
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href') ?? '';
    if (/^(https?|mailto):/i.test(href)) this.openUrl(href);
    else this.ctx.openLink?.(href);
  }

  // ---------------------------------------------------------------- pointer and keys

  private worldPoint(e: { clientX: number; clientY: number }): Point {
    const r = this.world.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.zoom + this.offset.x, y: (e.clientY - r.top) / this.zoom + this.offset.y };
  }

  private pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    // A handle of a card wins over the label or the line of an edge lying over it (zoomed out, a label covers the side it leaves from).
    const handle = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.classList.contains('canvas-handle') && this.layer.contains(el)) : undefined;
    const target = (handle ?? e.target) as HTMLElement;
    if (target.closest('textarea, input, button, select, a')) return;
    const nodeEl = target.closest<HTMLElement>('.canvas-node');
    const node = nodeEl ? this.doc.nodes.find((n) => n.id === nodeEl.dataset.id) : undefined;
    const edgeId = target.closest<SVGElement | HTMLElement>('[data-edge]')?.dataset.edge;
    if (node && !this.readOnly && target.classList.contains('canvas-handle')) {
      const side = (target.dataset.side ?? 'right') as CanvasSide;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('class', 'canvas-edge-line canvas-connecting');
      this.svg.append(path);
      this.drag = { kind: 'connect', from: node, side, path };
    } else if (node && !this.readOnly && target.classList.contains('canvas-resize')) {
      this.drag = { kind: 'resize', start: this.worldPoint(e), moved: false, before: this.snapshot(), node, width: node.width, height: node.height };
    } else if (node) {
      if (e.shiftKey) {
        if (this.selection.has(node.id)) this.selection.delete(node.id);
        else this.selection.add(node.id);
      } else if (!this.selection.has(node.id)) {
        this.selection.clear();
        this.selection.add(node.id);
      }
      this.markSelection();
      if (!this.readOnly) {
        const moving = this.withGroups(this.doc.nodes.filter((n) => this.selection.has(n.id)).map((n) => n.id));
        this.drag = { kind: 'move', start: this.worldPoint(e), moved: false, before: this.snapshot(), nodes: moving.map((n) => ({ node: n, x: n.x, y: n.y })) };
      }
    } else if (edgeId) {
      if (!e.shiftKey) this.selection.clear();
      this.selection.add(`edge:${edgeId}`);
      this.markSelection();
    } else {
      if (!e.shiftKey && this.selection.size) {
        this.selection.clear();
        this.markSelection();
      }
      this.drag = { kind: 'pan', x: e.clientX, y: e.clientY };
    }
    if (this.drag) {
      e.preventDefault();
      this.scroller.focus({ preventScroll: true });
      window.addEventListener('pointermove', this.onMove);
      window.addEventListener('pointerup', this.onUp);
      window.addEventListener('pointercancel', this.onUp);
    }
  }

  /** The selection marked without drawing the cards again. */
  private markSelection(): void {
    for (const el of this.layer.querySelectorAll<HTMLElement>('.canvas-node')) el.classList.toggle('selected', this.selection.has(el.dataset.id ?? ''));
    this.drawEdges();
    this.updateColour();
  }

  private pointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pan') {
      this.scroller.scrollLeft -= e.clientX - d.x;
      this.scroller.scrollTop -= e.clientY - d.y;
      d.x = e.clientX;
      d.y = e.clientY;
      return;
    }
    const p = this.worldPoint(e);
    if (d.kind === 'connect') {
      const g = edgeGeometry(this.rectOf(d.from), { x: p.x - this.offset.x, y: p.y - this.offset.y, width: 0, height: 0 }, d.side);
      d.path.setAttribute('d', g.path);
      return;
    }
    const dx = Math.round(p.x - d.start.x);
    const dy = Math.round(p.y - d.start.y);
    if (!d.moved && Math.hypot(dx, dy) < 2) return;
    d.moved = true;
    if (d.kind === 'move') {
      for (const m of d.nodes) {
        m.node.x = m.x + dx;
        m.node.y = m.y + dy;
        const el = this.nodeEl(m.node.id);
        if (el) this.place(el, m.node);
      }
    } else {
      d.node.width = Math.max(MIN_SIZE, d.width + dx);
      d.node.height = Math.max(MIN_SIZE, d.height + dy);
      const el = this.nodeEl(d.node.id);
      if (el) this.place(el, d.node);
    }
    this.drawEdges();
  }

  private pointerUp(e: PointerEvent): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    const d = this.drag;
    this.drag = undefined;
    if (!d) return;
    if (d.kind === 'connect') {
      d.path.remove();
      // The card under the pointer, found on the plane: an edge or a label above it does not hide it.
      const p = this.worldPoint(e);
      const inside = (n: CanvasNode): boolean => n.id !== d.from.id && p.x >= n.x && p.x <= n.x + n.width && p.y >= n.y && p.y <= n.y + n.height;
      const nodes = [...this.doc.nodes].reverse();
      const to = nodes.find((n) => n.type !== 'group' && inside(n)) ?? nodes.find(inside);
      if (to) this.connect(d.from.id, d.side, to.id, nearestSide(to, p));
      return;
    }
    if ((d.kind === 'move' || d.kind === 'resize') && d.moved) {
      this.remember(d.before);
      this.render();
      this.changed();
    }
  }

  private doubleClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    if (target.closest('textarea, input')) return;
    const edgeEl = target.closest<HTMLElement | SVGElement>('[data-edge]');
    if (edgeEl?.dataset.edge) {
      const edge = this.doc.edges.find((x) => x.id === edgeEl.dataset.edge);
      if (!edge || this.readOnly) return;
      // An edge without a label gets one where its middle is.
      let label = [...this.labels.querySelectorAll<HTMLElement>('.canvas-edge-label')].find((l) => l.dataset.edge === edge.id);
      if (!label) {
        const from = this.doc.nodes.find((n) => n.id === edge.fromNode);
        const to = this.doc.nodes.find((n) => n.id === edge.toNode);
        if (!from || !to) return;
        const g = edgeGeometry(this.rectOf(from), this.rectOf(to), sideOf(edge.fromSide), sideOf(edge.toSide));
        label = h('div', { class: 'canvas-edge-label', 'data-edge': edge.id });
        label.style.left = `${g.middle.x}px`;
        label.style.top = `${g.middle.y}px`;
        this.labels.append(label);
      }
      this.editLabel(label, edge.label ?? '', (v) => this.setEdgeLabel(edge.id, v));
      return;
    }
    const nodeEl = target.closest<HTMLElement>('.canvas-node');
    const node = nodeEl ? this.doc.nodes.find((n) => n.id === nodeEl.dataset.id) : undefined;
    if (!node) {
      // A double click on the plane makes a text card there.
      if (this.readOnly) return;
      const p = this.worldPoint(e);
      const made = this.addNode({ type: 'text', text: '', width: 260, height: 140, x: p.x - 130, y: p.y - 70 });
      this.editText(made);
      return;
    }
    if (node.type === 'text') this.editText(node);
    else if (node.type === 'file') this.openFile(node);
    else if (node.type === 'link' && typeof node.url === 'string') this.openUrl(node.url);
    else if (node.type === 'group') {
      const label = nodeEl!.querySelector<HTMLElement>('.canvas-group-label');
      if (label) this.editLabel(label, node.label ?? '', (v) => this.setGroupLabel(node.id, v));
    }
  }

  private key(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).closest('textarea, input, select')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
      e.preventDefault();
      this.redo();
    } else if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      this.select(this.doc.nodes.map((n) => n.id));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && !mod) {
      e.preventDefault();
      this.deleteSelection();
    } else if (e.key.startsWith('Arrow') && !mod) {
      const ids = this.doc.nodes.filter((n) => this.selection.has(n.id)).map((n) => n.id);
      if (!ids.length) return;
      e.preventDefault();
      const step = e.shiftKey ? 50 : 10;
      const [dx, dy] = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : [0, step];
      this.moveNodes(ids, dx, dy);
    } else if ((e.key === '+' || e.key === '=') && !mod) {
      e.preventDefault();
      this.zoomBy(1.25);
    } else if (e.key === '-' && !mod) {
      e.preventDefault();
      this.zoomBy(1 / 1.25);
    } else if (e.key === '0' && !mod) {
      e.preventDefault();
      this.fit();
    } else if (e.key === 'Escape' && this.selection.size) {
      this.select([]);
    } else if (e.key === 'Enter' && !mod) {
      const node = this.doc.nodes.find((n) => this.selection.has(n.id));
      if (node?.type === 'text') {
        e.preventDefault();
        this.editText(node);
      }
    }
  }

  // ---------------------------------------------------------------- EditorView

  save(): Uint8Array {
    if (this.unreadable) return this.unreadable;
    return new TextEncoder().encode(serializeCanvas(this.doc));
  }

  /** The canvas as it would be saved (for tests). */
  get canvas(): CanvasDoc {
    return this.doc;
  }

  status(): string {
    return t('canvas.status', { nodes: this.doc.nodes.length, edges: this.doc.edges.length, zoom: Math.round(this.zoom * 100) });
  }

  mounted(): void {
    this.fit();
  }

  focus(): void {
    this.scroller.focus({ preventScroll: true });
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly || !!this.unreadable;
    for (const b of this.tools) b.disabled = this.readOnly;
    this.colour.disabled = this.readOnly;
    if (this.layer.isConnected || this.layer.childNodes.length) this.render();
  }

  destroy(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.length = 0;
    this.element.remove();
  }
}
