/**
 * DRAW-001..DRAW-006, DRAW-011: the drawing editor — shapes, connectors,
 * schematic symbols and wires on a grid, in a dialog.
 */
import { attachZoomPan, zoomAt } from '../app/zoom-pan';
import { button, h } from '../app/dom';
import { t } from '../i18n';
import {
  bbox, connectionPoints, duplicate, emptyDrawing, formatValue, mirror, moveShapes, newId, placeSymbol, reconnect, remove, rotate, route, shapeById, snap,
  type Drawing, type End, type LineShape, type Pt, type Shape, type TextRun, type TextShape,
} from './model';
import { exportPng } from './raster';
import { lineSizes, normalizeRuns, runsFromHtml, runsOf, runsToHtml, styleRuns } from './rich';
import { drawingBody, toSvg } from './svg';
import { searchSymbols, symbolDef, type SymbolCategory, type SymbolDef } from './symbols';

export type Tool = 'select' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'free' | 'text' | 'wire';

/** PDF-021: how the editor opens — over a picture of a PDF page, for example. */
export interface DrawOptions {
  /** A picture under the drawing, the size of the drawing, not part of it. */
  background?: string;
  /** The title of the dialog. */
  title?: string;
  /** The drawing's size cannot be changed (a page). */
  fixedSize?: boolean;
  /** The tool chosen when the editor opens. */
  tool?: Tool;
  /**
   * PDF-021: the whole window for the drawing, fitted to its width; the
   * symbols and objects panels hidden until asked for, no export buttons.
   */
  full?: boolean;
}

/** Sizes of text offered (DRAW-001, PDF-021). */
const TEXT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64];

const SVG_NS = 'http://www.w3.org/2000/svg';
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

const CATEGORIES: SymbolCategory[] = ['electrical', 'logic', 'block', 'fluid', 'flowchart', 'ladder', 'fbd', 'sfc'];
/** How close (in drawing units) a point snaps to a connection point. */
const ATTACH = 8;

/** The name read by screen readers and shown in the list of objects (DRAW-011). */
export function shapeName(s: Shape): string {
  switch (s.kind) {
    case 'symbol': {
      const def = symbolDef(s.sym);
      return [def?.name ?? s.sym, s.ref, s.value].filter(Boolean).join(' ');
    }
    case 'text':
      return `${t('draw.text')}: ${s.text}`;
    case 'line':
      return [s.wire ? t('draw.wire') : s.end || s.start ? t('draw.arrow') : t('draw.line'), s.label].filter(Boolean).join(' ');
    case 'rect':
      return t('draw.rect');
    case 'ellipse':
      return t('draw.ellipse');
    case 'free':
      return t('draw.free');
    default:
      return t('draw.picture');
  }
}

export function symbolPreview(def: SymbolDef): string {
  const [x0, y0, x1, y1] = def.box;
  const pad = 4;
  return `<svg xmlns="${SVG_NS}" viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" width="44" height="32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round">${def.body}</g></svg>`;
}

export function editDrawing(host: HTMLElement, initial?: Drawing, options: DrawOptions = {}): Promise<Drawing | null> {
  return new Promise((resolve) => {
    let d: Drawing = initial ? structuredClone(initial) : emptyDrawing();
    let tool: Tool = options.tool ?? 'select';
    let selected: string[] = [];
    let zoom = 1;
    /** The text typed in place (PDF-021). */
    let editing: { id: string; created: boolean; before: string } | undefined;
    const undo: string[] = [];
    const redo: string[] = [];
    const snapshot = (): void => {
      undo.push(JSON.stringify(d));
      if (undo.length > 200) undo.shift();
      redo.length = 0;
    };
    let style = { stroke: '#000000', fill: 'none', width: 1.5, dash: '' as '' | 'dash' | 'dot', size: 16 };

    // --- stage ---------------------------------------------------------------
    const svg = svgEl('svg', { class: 'draw-stage', tabindex: 0, role: 'application', 'aria-roledescription': t('draw.canvas'), 'aria-label': t('draw.canvas') });
    const defs = svgEl('defs');
    defs.innerHTML = `<pattern id="draw-grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#c8d0da" stroke-width="0.5"/></pattern>`;
    const paper = svgEl('rect', { x: 0, y: 0, fill: '#ffffff' });
    const grid = svgEl('rect', { x: 0, y: 0, fill: 'url(#draw-grid)', 'pointer-events': 'none' });
    const content = svgEl('g', { class: 'draw-content' });
    const overlay = svgEl('g', { class: 'draw-overlay' });
    // PDF-021: the page under the drawing.
    const background = options.background ? svgEl('image', { href: options.background, x: 0, y: 0, preserveAspectRatio: 'none', 'pointer-events': 'none', class: 'draw-background' }) : undefined;
    svg.append(defs, paper, ...(background ? [background] : []), grid, content, overlay);
    const stage = h('div', { class: 'draw-scroll' }, svg);
    // The text editor (PDF-021) lies over the drawing, in the scrolled area.
    const status = h('p', { class: 'draw-status', role: 'status' });

    // --- properties ---------------------------------------------------------
    const strokeInput = h('input', { type: 'color', value: style.stroke, 'aria-label': t('draw.stroke') });
    const fillInput = h('input', { type: 'color', value: '#ffffff', 'aria-label': t('draw.fill') });
    const noFill = h('input', { type: 'checkbox', checked: true });
    const widthInput = h('select', { 'aria-label': t('draw.width') }, ...[0.5, 1, 1.5, 2, 3, 5, 8].map((w) => h('option', { value: String(w), selected: w === 1.5 }, `${w}`)));
    const dashInput = h('select', { 'aria-label': t('draw.dash') }, h('option', { value: '' }, '———'), h('option', { value: 'dash' }, '– – –'), h('option', { value: 'dot' }, '· · ·'));
    const refInput = h('input', { type: 'text', size: 5, 'aria-label': t('draw.ref') });
    const valueInput = h('input', { type: 'text', size: 10, 'aria-label': t('draw.value') });
    const textInput = h('input', { type: 'text', size: 18, 'aria-label': t('draw.label') });
    const textSize = h('select', { 'aria-label': t('draw.textSize') }, ...TEXT_SIZES.map((v) => h('option', { value: String(v), selected: v === style.size }, String(v))));
    const textSizeLabel = h('label', {}, `${t('draw.textSize')} `, textSize);
    // DRAW-020, PDF-021: the look of a part of a text — what is selected while typing — or of the whole text.
    const lookButton = (look: 'bold' | 'italic' | 'underline', text: string, key: string): HTMLButtonElement => {
      const b = button(t(`draw.${look}`), () => setLook(look), { text, title: `${t(`draw.${look}`)} (Ctrl+${key})`, className: `draw-look draw-${look}` });
      // The text being typed keeps the focus, and what is selected in it.
      b.addEventListener('mousedown', (e) => e.preventDefault());
      return b;
    };
    const textColor = h('input', { type: 'color', value: '#000000', 'aria-label': t('draw.textColor') });
    const lookProps = h('span', { class: 'draw-look-group' }, lookButton('bold', 'B', 'B'), lookButton('italic', 'I', 'I'), lookButton('underline', 'U', 'U'), h('label', {}, `${t('draw.textColor')} `, textColor));
    const symbolProps = h('span', { class: 'draw-props-group', hidden: true }, h('label', {}, `${t('draw.ref')} `, refInput), h('label', {}, `${t('draw.value')} `, valueInput));
    const textProps = h('span', { class: 'draw-props-group', hidden: true }, h('label', {}, `${t('draw.label')} `, textInput), textSizeLabel, lookProps);
    // DRAW-017: the arrows of a line and its routing in right angles.
    const arrowStart = h('input', { type: 'checkbox' });
    const arrowEnd = h('input', { type: 'checkbox' });
    const orthoInput = h('input', { type: 'checkbox' });
    const arrowProps = h('span', { class: 'draw-props-group' }, h('label', {}, arrowStart, ` ${t('draw.arrowStart')}`), h('label', {}, arrowEnd, ` ${t('draw.arrowEnd')}`));
    const lineProps = h('span', { class: 'draw-props-group', hidden: true }, arrowProps, h('label', { title: t('draw.orthoTitle') }, orthoInput, ` ${t('draw.ortho')}`), h('span', { class: 'hint' }, t('draw.bendHint')));
    const oneLine = (): LineShape | undefined => {
      const one = selected.length === 1 ? shapeById(d, selected[0]!) : undefined;
      return one?.kind === 'line' ? one : undefined;
    };
    arrowStart.addEventListener('change', () => {
      const l = oneLine();
      if (!l) return;
      snapshot();
      if (arrowStart.checked) l.start = 'arrow';
      else delete l.start;
      render();
    });
    arrowEnd.addEventListener('change', () => {
      const l = oneLine();
      if (!l) return;
      snapshot();
      if (arrowEnd.checked) l.end = 'arrow';
      else delete l.end;
      render();
    });
    orthoInput.addEventListener('change', () => {
      const l = oneLine();
      if (!l) return;
      snapshot();
      const a = l.points[0]!;
      const b = l.points[l.points.length - 1]!;
      if (orthoInput.checked) {
        l.ortho = true;
        l.points = route(a, b, Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]));
      } else delete l.ortho;
      render();
    });

    const sel = (): Shape[] => selected.map((id) => shapeById(d, id)).filter((s): s is Shape => !!s);
    const applyStyle = (patch: Partial<Shape>): void => {
      if (!selected.length) return;
      snapshot();
      for (const s of sel()) if (s.kind !== 'raw') Object.assign(s, patch);
      render();
    };
    strokeInput.addEventListener('input', () => {
      style.stroke = strokeInput.value;
      applyStyle({ stroke: style.stroke } as Partial<Shape>);
    });
    const fillChanged = (): void => {
      style.fill = noFill.checked ? 'none' : fillInput.value;
      applyStyle({ fill: style.fill } as Partial<Shape>);
    };
    fillInput.addEventListener('input', () => {
      noFill.checked = false;
      fillChanged();
    });
    noFill.addEventListener('change', fillChanged);
    widthInput.addEventListener('change', () => {
      style.width = Number(widthInput.value);
      applyStyle({ width: style.width } as Partial<Shape>);
    });
    dashInput.addEventListener('change', () => {
      style.dash = dashInput.value as typeof style.dash;
      applyStyle({ dash: style.dash || undefined } as Partial<Shape>);
    });
    refInput.addEventListener('change', () => {
      const s = sel()[0];
      if (s?.kind !== 'symbol') return;
      snapshot();
      s.ref = refInput.value.trim() || undefined;
      render();
    });
    valueInput.addEventListener('change', () => {
      const s = sel()[0];
      if (s?.kind !== 'symbol') return;
      snapshot();
      s.value = formatValue(valueInput.value, symbolDef(s.sym)?.unit) || undefined;
      valueInput.value = s.value ?? '';
      render();
    });
    textSize.addEventListener('change', () => {
      style.size = Number(textSize.value);
      // A part of the text being typed.
      if (editing && wrapSelection({ size: style.size })) return;
      const texts = sel().filter((x): x is TextShape => x.kind === 'text');
      if (!texts.length) return;
      snapshot();
      for (const x of texts) x.size = style.size;
      render();
    });
    textInput.addEventListener('change', () => {
      const s = sel()[0];
      if (!s) return;
      snapshot();
      if (s.kind === 'text' && textInput.value && textInput.value !== s.text) {
        s.text = textInput.value;
        delete s.runs;
      }
      else if (s.kind === 'line') s.label = textInput.value.trim() || undefined;
      render();
    });

    // --- objects list (DRAW-011) -----------------------------------------------
    const objects = h('ul', { class: 'draw-objects', 'aria-label': t('draw.objects') });

    const select = (ids: string[]): void => {
      selected = ids;
      render();
    };

    // --- rendering -------------------------------------------------------------
    const render = (): void => {
      reconnect(d);
      svg.setAttribute('viewBox', `0 0 ${d.width} ${d.height}`);
      svg.setAttribute('width', String(d.width * zoom));
      svg.setAttribute('height', String(d.height * zoom));
      for (const r of [paper, grid, ...(background ? [background] : [])]) {
        r.setAttribute('width', String(d.width));
        r.setAttribute('height', String(d.height));
      }
      grid.toggleAttribute('hidden', !d.showGrid);
      grid.style.display = d.showGrid ? '' : 'none';
      content.innerHTML = drawingBody(d);
      // The text being typed is shown by its editor alone.
      if (editing) content.querySelector<SVGElement>(`[data-id="${CSS.escape(editing.id)}"]`)?.setAttribute('visibility', 'hidden');
      overlay.replaceChildren();
      for (const s of sel()) {
        const b = bbox(s) ?? domBox(s.id);
        if (!b) continue;
        overlay.append(svgEl('rect', { x: b[0] - 3, y: b[1] - 3, width: b[2] - b[0] + 6, height: b[3] - b[1] + 6, class: 'draw-selection' }));
        if ((s.kind === 'rect' || s.kind === 'ellipse') && selected.length === 1) overlay.append(svgEl('rect', { x: b[2] - 4, y: b[3] - 4, width: 8, height: 8, class: 'draw-handle', 'data-handle': 'resize' }));
        if (s.kind === 'line' && selected.length === 1)
          for (const [i, p] of s.points.entries()) {
            const end = i === 0 || i === s.points.length - 1;
            // DRAW-017: the bends, dragged; a double click removes one.
            overlay.append(svgEl('circle', { cx: p[0], cy: p[1], r: end ? 4 : 3.5, class: end ? 'draw-handle' : 'draw-handle draw-bend', 'data-handle': i === 0 ? 'start' : end ? 'end' : 'bend', 'data-index': String(i) }));
          }
      }
      if (tool === 'wire' || tool === 'line' || tool === 'arrow') for (const s of d.shapes) for (const [x, y] of connectionPoints(s)) overlay.append(svgEl('circle', { cx: x, cy: y, r: 2.5, class: 'draw-pin' }));
      // Properties of the selection.
      const one = sel().length === 1 ? sel()[0] : undefined;
      symbolProps.hidden = one?.kind !== 'symbol';
      lineProps.hidden = one?.kind !== 'line';
      if (one?.kind === 'line') {
        arrowProps.hidden = !!one.wire;
        arrowStart.checked = one.start === 'arrow';
        arrowEnd.checked = one.end === 'arrow';
        orthoInput.checked = !!one.ortho;
      }
      textProps.hidden = one?.kind !== 'text' && one?.kind !== 'line' && tool !== 'text';
      textSizeLabel.hidden = one ? one.kind !== 'text' : tool !== 'text';
      lookProps.hidden = textSizeLabel.hidden;
      if (one?.kind === 'text') {
        textSize.value = String(one.size ?? 16);
        const color = one.fill ?? one.stroke ?? '#000000';
        if (/^#[0-9a-f]{6}$/i.test(color)) textColor.value = color;
        const runs = runsOf(one);
        for (const look of ['bold', 'italic', 'underline'] as const) lookProps.querySelector(`.draw-${look}`)?.setAttribute('aria-pressed', String(runs.every((r) => r[look])));
      }
      if (one?.kind === 'symbol') {
        if (document.activeElement !== refInput) refInput.value = one.ref ?? '';
        if (document.activeElement !== valueInput) valueInput.value = one.value ?? '';
      }
      if ((one?.kind === 'text' || one?.kind === 'line') && document.activeElement !== textInput) textInput.value = one.kind === 'text' ? one.text : (one.label ?? '');
      if (one && one.kind !== 'raw') {
        strokeInput.value = /^#[0-9a-f]{6}$/i.test(one.stroke ?? '') ? one.stroke! : '#000000';
        noFill.checked = !one.fill || one.fill === 'none';
        if (!noFill.checked && /^#[0-9a-f]{6}$/i.test(one.fill!)) fillInput.value = one.fill!;
      }
      // Objects list.
      const focused = (document.activeElement as HTMLElement | null)?.dataset?.id;
      objects.replaceChildren(
        ...d.shapes.map((s) => {
          const b = h('button', { type: 'button', 'data-id': s.id, 'aria-pressed': String(selected.includes(s.id)) }, shapeName(s));
          b.addEventListener('click', (e) => select(e.shiftKey ? toggle(s.id) : [s.id]));
          b.addEventListener('keydown', onKey);
          return h('li', {}, b);
        }),
      );
      if (focused) objects.querySelector<HTMLElement>(`[data-id="${CSS.escape(focused)}"]`)?.focus();
      undoBtn.disabled = !undo.length;
      redoBtn.disabled = !redo.length;
      netlistBtn.hidden = bomBtn.hidden = !electrical();
      status.textContent = selected.length ? t('draw.selected', { n: selected.length, name: one ? shapeName(one) : '' }) : '';
    };
    const domBox = (id: string): [number, number, number, number] | undefined => {
      const el = content.querySelector<SVGGraphicsElement>(`[data-id="${CSS.escape(id)}"]`);
      if (!el || typeof el.getBBox !== 'function') return undefined;
      const b = el.getBBox();
      const m = el.transform?.baseVal?.consolidate()?.matrix;
      const [dx, dy] = m ? [m.e, m.f] : [0, 0];
      return [b.x + dx, b.y + dy, b.x + b.width + dx, b.y + b.height + dy];
    };
    /** DRAW-018: the shape under a point — the selected ones first, then from the top — inside its box, or near a line. */
    const shapeAt = (p: Pt): string | undefined => {
      const near = (sh: Shape): boolean => {
        if (sh.kind === 'line' || sh.kind === 'free') return sh.points.slice(1).some((q, i) => segmentDistance(p, sh.points[i]!, q) <= 5);
        const b = bbox(sh) ?? domBox(sh.id);
        return !!b && p[0] >= b[0] - 3 && p[0] <= b[2] + 3 && p[1] >= b[1] - 3 && p[1] <= b[3] + 3;
      };
      const chosen = sel().find(near);
      if (chosen) return chosen.id;
      for (let i = d.shapes.length - 1; i >= 0; i--) if (near(d.shapes[i]!)) return d.shapes[i]!.id;
      return undefined;
    };
    const toggle = (id: string): string[] => (selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

    // --- pointer -----------------------------------------------------------------
    const point = (e: PointerEvent | MouseEvent): Pt => {
      const r = svg.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * d.width, ((e.clientY - r.top) / r.height) * d.height];
    };
    const snapPt = (p: Pt, fine = false): Pt => (fine ? [Math.round(p[0]), Math.round(p[1])] : [snap(p[0], d.grid), snap(p[1], d.grid)]);
    /** The nearest connection point, to attach a connector end to. */
    const attachAt = (p: Pt, except?: string): { end: End; at: Pt } | undefined => {
      let best: { end: End; at: Pt; dist: number } | undefined;
      for (const s of d.shapes) {
        if (s.id === except || s.kind === 'line') continue;
        connectionPoints(s).forEach((c, pin) => {
          const dist = Math.hypot(c[0] - p[0], c[1] - p[1]);
          if (dist <= ATTACH && (!best || dist < best.dist)) best = { end: { shape: s.id, pin }, at: c, dist };
        });
      }
      return best;
    };

    type Drag =
      | { kind: 'move'; from: Pt; last: Pt; moved: boolean }
      | { kind: 'band'; from: Pt; el: SVGRectElement; add: boolean }
      | { kind: 'create'; shape: Shape; from: Pt }
      | { kind: 'resize'; id: string; from: Pt }
      | { kind: 'end'; id: string; which: 'start' | 'end' }
      | { kind: 'bend'; id: string; index: number };
    let drag: Drag | undefined;

    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (isDouble(e)) {
        drag = undefined;
        // The text typed in place keeps the focus (PDF-021).
        e.preventDefault();
        return onDouble(e);
      }
      svg.focus();
      svg.setPointerCapture?.(e.pointerId);
      const p = point(e);
      const target = e.target as Element;
      const handle = target.closest<SVGElement>('[data-handle]')?.dataset.handle;
      if (handle && selected.length === 1) {
        snapshot();
        const index = Number(target.closest<SVGElement>('[data-handle]')?.dataset.index);
        drag =
          handle === 'resize'
            ? { kind: 'resize', id: selected[0]!, from: p }
            : handle === 'bend'
              ? { kind: 'bend', id: selected[0]!, index }
              : { kind: 'end', id: selected[0]!, which: handle as 'start' | 'end' };
        return;
      }
      if (tool === 'select') {
        // DRAW-018: a press inside a shape (between the lines of a component) takes it too.
        const id = target.closest('[data-id]')?.getAttribute('data-id') ?? target.closest('[data-for]')?.getAttribute('data-for') ?? shapeAt(p);
        if (id) {
          if (e.shiftKey) selected = toggle(id);
          else if (!selected.includes(id)) selected = [id];
          snapshot();
          drag = { kind: 'move', from: snapPt(p), last: snapPt(p), moved: false };
          render();
        } else {
          const el = svgEl('rect', { class: 'draw-band', x: p[0], y: p[1], width: 0, height: 0 });
          overlay.append(el);
          drag = { kind: 'band', from: p, el, add: e.shiftKey };
        }
        return;
      }
      snapshot();
      const st = { stroke: style.stroke, width: style.width, ...(style.dash ? { dash: style.dash } : {}) };
      const at = snapPt(p, e.altKey);
      const id = newId(d);
      let shape: Shape;
      if (tool === 'rect' || tool === 'ellipse') shape = { id, kind: tool, x: at[0], y: at[1], w: 0, h: 0, ...st, fill: style.fill };
      else if (tool === 'free') shape = { id, kind: 'free', points: [p], ...st, width: Math.max(2, style.width) };
      else if (tool === 'text') {
        // PDF-021: a text typed where it goes, on several lines; a press on a text edits it.
        const hit = target.closest('[data-id]')?.getAttribute('data-id') ?? shapeAt(p);
        const old = hit ? shapeById(d, hit) : undefined;
        // The focus stays in the text typed in place.
        e.preventDefault();
        if (old?.kind === 'text') {
          undo.pop();
          return openText(old, false);
        }
        const size = style.size;
        // The press is the top left of the first line.
        const created: TextShape = { id, kind: 'text', x: at[0], y: snapPt([p[0], p[1] + size * 0.8], e.altKey || !d.grid)[1], text: '', size, fill: style.stroke };
        d.shapes.push(created);
        return openText(created, true);
      } else {
        const start = attachAt(p);
        const a = start?.at ?? at;
        shape = { id, kind: 'line', points: [a, a], ...st, ...(start ? { from: start.end } : {}) } as LineShape;
        if (tool === 'arrow') (shape as LineShape).end = 'arrow';
        if (tool === 'wire') Object.assign(shape, { wire: true, ortho: true, stroke: style.stroke, width: 1.5 });
      }
      d.shapes.push(shape);
      drag = { kind: 'create', shape, from: at };
      render();
    });

    svg.addEventListener('pointermove', (e) => {
      if (!drag) {
        // DRAW-018: what can be dragged shows it.
        if (tool === 'select' && e.pointerType === 'mouse') svg.style.cursor = shapeAt(point(e)) || (e.target as Element).closest('[data-id]') ? 'move' : '';
        return;
      }
      const p = point(e);
      if (drag.kind === 'move') {
        const q = snapPt(p, e.altKey);
        const [dx, dy] = [q[0] - drag.last[0], q[1] - drag.last[1]];
        if (!dx && !dy) return;
        drag.last = q;
        drag.moved = true;
        moveShapes(d, selected, dx, dy);
        // A connector moved alone leaves the shapes it was attached to.
        for (const s of sel()) if (s.kind === 'line' && !selected.includes(s.from?.shape ?? '')) delete s.from;
        for (const s of sel()) if (s.kind === 'line' && !selected.includes(s.to?.shape ?? '')) delete s.to;
        render();
      } else if (drag.kind === 'band') {
        const [x0, y0] = drag.from;
        drag.el.setAttribute('x', String(Math.min(x0, p[0])));
        drag.el.setAttribute('y', String(Math.min(y0, p[1])));
        drag.el.setAttribute('width', String(Math.abs(p[0] - x0)));
        drag.el.setAttribute('height', String(Math.abs(p[1] - y0)));
      } else if (drag.kind === 'create') {
        const s = drag.shape;
        const q = snapPt(p, e.altKey);
        if (s.kind === 'rect' || s.kind === 'ellipse') {
          let [w, hh] = [q[0] - drag.from[0], q[1] - drag.from[1]];
          if (e.shiftKey) w = hh = Math.max(Math.abs(w), Math.abs(hh)) * Math.sign(w || 1);
          Object.assign(s, { x: Math.min(drag.from[0], drag.from[0] + w), y: Math.min(drag.from[1], drag.from[1] + hh), w: Math.abs(w), h: Math.abs(hh) });
        } else if (s.kind === 'free') s.points.push(p);
        else if (s.kind === 'line') {
          const end = attachAt(p)?.at ?? q;
          s.points = s.ortho ? route(s.points[0]!, end, Math.abs(end[0] - s.points[0]![0]) >= Math.abs(end[1] - s.points[0]![1])) : [s.points[0]!, end];
        }
        content.innerHTML = drawingBody(d);
      } else if (drag.kind === 'resize') {
        const s = shapeById(d, drag.id);
        if (s?.kind === 'rect' || s?.kind === 'ellipse') {
          const q = snapPt(p, e.altKey);
          s.w = Math.max(d.grid || 4, q[0] - s.x);
          s.h = Math.max(d.grid || 4, q[1] - s.y);
          render();
        }
      } else if (drag.kind === 'bend') {
        // DRAW-017: a bend moved freely: the line is no longer routed by itself.
        const s = shapeById(d, drag.id);
        if (s?.kind !== 'line' || !s.points[drag.index]) return;
        delete s.ortho;
        s.points[drag.index] = snapPt(p, e.altKey);
        render();
      } else if (drag.kind === 'end') {
        const s = shapeById(d, drag.id);
        if (s?.kind !== 'line') return;
        const a = attachAt(p);
        const q = a?.at ?? snapPt(p, e.altKey);
        const key = drag.which === 'start' ? 'from' : 'to';
        if (a) s[key] = a.end;
        else delete s[key];
        if (s.ortho) {
          const other = drag.which === 'start' ? s.points[s.points.length - 1]! : s.points[0]!;
          const r = route(other, q, Math.abs(q[0] - other[0]) >= Math.abs(q[1] - other[1]));
          s.points = drag.which === 'start' ? r.reverse() : r;
        } else if (drag.which === 'start') s.points[0] = q;
        else s.points[s.points.length - 1] = q;
        render();
      }
    });

    const release = (e: PointerEvent): void => {
      const dr = drag;
      drag = undefined;
      if (!dr) return;
      if (dr.kind === 'move' && !dr.moved) undo.pop();
      if (dr.kind === 'band') {
        const p = point(e);
        const [x0, x1] = [Math.min(dr.from[0], p[0]), Math.max(dr.from[0], p[0])];
        const [y0, y1] = [Math.min(dr.from[1], p[1]), Math.max(dr.from[1], p[1])];
        const inside = d.shapes.filter((s) => {
          const b = bbox(s) ?? domBox(s.id);
          return b && b[0] >= x0 && b[2] <= x1 && b[1] >= y0 && b[3] <= y1;
        });
        return select([...(dr.add ? selected : []), ...inside.map((s) => s.id)]);
      }
      if (dr.kind === 'create') {
        const s = dr.shape;
        const tiny =
          ((s.kind === 'rect' || s.kind === 'ellipse') && (s.w < 2 || s.h < 2)) ||
          (s.kind === 'line' && s.points.length === 2 && s.points[0]![0] === s.points[1]![0] && s.points[0]![1] === s.points[1]![1]) ||
          (s.kind === 'free' && s.points.length < 2);
        if (tiny) {
          remove(d, [s.id]);
          undo.pop();
          return render();
        }
        if (s.kind === 'line') {
          const end = attachAt(s.points[s.points.length - 1]!, s.from?.shape);
          if (end) s.to = end.end;
        }
        if (s.kind === 'free') s.points = simplify(s.points, 0.8).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
        selected = [s.id];
      }
      render();
    };
    svg.addEventListener('pointerup', release);
    svg.addEventListener('pointercancel', release);
    // A double click told by two presses close in time and place: the drawing is drawn again
    // between them, so the browser's own dblclick (same element twice) does not come.
    let lastDown: { t: number; x: number; y: number } | undefined;
    const isDouble = (e: PointerEvent): boolean => {
      const now = performance.now();
      const double = !!lastDown && now - lastDown.t < 400 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
      lastDown = double ? undefined : { t: now, x: e.clientX, y: e.clientY };
      return double;
    };
    const onDouble = (e: MouseEvent): void => {
      const target = e.target as Element;
      // DRAW-017: a double click on a bend removes it; on a selected line, adds one there.
      const handle = target.closest<SVGElement>('[data-handle]');
      const line = oneLine();
      if (line && handle?.dataset.handle === 'bend') {
        snapshot();
        delete line.ortho;
        line.points.splice(Number(handle.dataset.index), 1);
        return render();
      }
      // Near a line (its selection frame, or the first click, may have hidden it): a bend there.
      const raw = point(e as unknown as PointerEvent);
      let near: { line: LineShape; index: number; dist: number } | undefined;
      for (const sh of d.shapes) {
        if (sh.kind !== 'line' || sh.wire) continue;
        for (let i = 0; i < sh.points.length - 1; i++) {
          const dd = segmentDistance(raw, sh.points[i]!, sh.points[i + 1]!);
          if (dd <= 6 + (sh.width ?? 1) && (!near || dd < near.dist)) near = { line: sh, index: i, dist: dd };
        }
      }
      if (near && (tool === 'select' || line)) {
        snapshot();
        delete near.line.ortho;
        near.line.points.splice(near.index + 1, 0, snapPt(raw, e.altKey));
        return select([near.line.id]);
      }
      const id = target.closest('[data-id]')?.getAttribute('data-id') ?? target.closest('[data-for]')?.getAttribute('data-for');
      const s = id ? shapeById(d, id) : undefined;
      if (!s) return;
      select([s.id]);
      if (s.kind === 'symbol') valueInput.focus();
      else if (s.kind === 'text') openText(s, false);
      else if (s.kind === 'line') textInput.focus();
    };

    // --- text typed in place (PDF-021) ---------------------------------------------
    // Editable rich text: Ctrl+B, Ctrl+I, Ctrl+U, and the size and colour of what is selected.
    const textEditor = h('div', { class: 'draw-text-editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('draw.label'), spellcheck: 'true', hidden: true });
    /** Screen pixels for a drawing unit, while the text is typed. */
    let editScale = 1;
    let editRange: Range | undefined;
    const placeText = (s: TextShape): void => {
      const box = svg.getBoundingClientRect();
      const area = stage.getBoundingClientRect();
      editScale = box.width && d.width ? box.width / d.width : zoom;
      const k = editScale;
      const first = lineSizes(s)[0] ?? s.size ?? 16;
      Object.assign(textEditor.style, {
        left: `${box.left - area.left + stage.scrollLeft + s.x * k - 3}px`,
        top: `${box.top - area.top + stage.scrollTop + (s.y - first * 0.95) * k - 3}px`,
        fontSize: `${(s.size ?? 16) * k}px`,
        color: s.fill ?? s.stroke ?? '#000000',
      });
    };
    const caretAtEnd = (): void => {
      const r = document.createRange();
      r.selectNodeContents(textEditor);
      r.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(r);
    };
    const look = (s: TextShape): string => JSON.stringify([s.text, s.runs ?? null, s.size ?? null, s.fill ?? null]);
    function openText(s: TextShape, created: boolean): void {
      if (editing) closeText();
      editing = { id: s.id, created, before: look(s) };
      selected = [s.id];
      textEditor.hidden = false;
      placeText(s);
      textEditor.innerHTML = runsToHtml(runsOf(s), editScale);
      render();
      textEditor.focus();
      // Typing goes on at the end.
      caretAtEnd();
    }
    /** The runs typed, without the blank at the end. */
    const typedRuns = (s: TextShape): TextRun[] => {
      const runs = runsFromHtml(textEditor, editScale, { size: s.size ?? 16, fill: s.fill ?? s.stroke ?? '#000000' });
      while (runs.length && !runs[runs.length - 1]!.text.trimEnd()) runs.pop();
      const last = runs[runs.length - 1];
      if (last) last.text = last.text.replace(/\s+$/, '');
      return runs;
    };
    function closeText(): void {
      const ed = editing;
      if (!ed) return;
      editing = undefined;
      editRange = undefined;
      textEditor.hidden = true;
      const s = shapeById(d, ed.id);
      if (s?.kind === 'text') {
        const runs = typedRuns(s);
        const text = runs.map((r) => r.text).join('');
        if (!text.trim()) {
          remove(d, [s.id]);
          selected = [];
          // Nothing typed: nothing to undo either.
          if (ed.created) undo.pop();
        } else {
          const next: TextShape = { ...s, text };
          const rich = normalizeRuns(runs);
          if (rich) next.runs = rich;
          else delete next.runs;
          if (look(next) !== ed.before) {
            if (!ed.created) snapshot();
            s.text = text;
            if (rich) s.runs = rich;
            else delete s.runs;
          }
        }
      }
      textEditor.replaceChildren();
      render();
      svg.focus();
    }
    /** A look given to what is selected in the text typed; false when nothing is. */
    function wrapSelection(set: { size?: number; fill?: string }): boolean {
      const r = editRange;
      if (!r || r.collapsed || !textEditor.contains(r.commonAncestorContainer)) {
        textEditor.focus();
        return false;
      }
      const span = document.createElement('span');
      span.append(r.extractContents());
      // The parts inside take the new look too.
      for (const inner of Array.from(span.querySelectorAll<HTMLElement>('[style], [data-size], font'))) {
        if (set.size !== undefined) {
          inner.style.fontSize = '';
          delete inner.dataset.size;
        }
        if (set.fill !== undefined) {
          inner.style.color = '';
          inner.removeAttribute('color');
        }
      }
      if (set.size !== undefined) {
        span.dataset.size = String(set.size);
        span.style.fontSize = `${set.size * editScale}px`;
      }
      if (set.fill !== undefined) span.style.color = set.fill;
      r.insertNode(span);
      const again = document.createRange();
      again.selectNodeContents(span);
      textEditor.focus();
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(again);
      editRange = again;
      return true;
    }
    /** Bold, italic or underline: on what is selected while typing, else on the whole of the texts selected. */
    function setLook(which: 'bold' | 'italic' | 'underline'): void {
      if (editing) {
        textEditor.focus();
        document.execCommand(which);
        return;
      }
      const texts = sel().filter((x): x is TextShape => x.kind === 'text');
      if (!texts.length) return;
      snapshot();
      const on = !texts.every((x) => runsOf(x).every((r) => r[which]));
      for (const x of texts) {
        const rich = normalizeRuns(styleRuns(runsOf(x), { [which]: on }));
        if (rich) x.runs = rich;
        else delete x.runs;
      }
      render();
    }
    textColor.addEventListener('input', () => {
      if (editing && wrapSelection({ fill: textColor.value })) return;
      style.stroke = textColor.value;
      const texts = sel().filter((x): x is TextShape => x.kind === 'text');
      if (!texts.length) return;
      snapshot();
      for (const x of texts) {
        x.fill = textColor.value;
        const rich = x.runs && normalizeRuns(styleRuns(runsOf(x), { fill: undefined }));
        if (rich) x.runs = rich;
        else delete x.runs;
      }
      render();
    });
    document.addEventListener('selectionchange', () => {
      if (!editing) return;
      const selection = window.getSelection();
      if (selection?.rangeCount && textEditor.contains(selection.anchorNode)) editRange = selection.getRangeAt(0).cloneRange();
    });
    // The properties of the text may take the focus for a while (its size, its colour).
    const inProps = (el: EventTarget | null): boolean => el instanceof Element && !!el.closest('.draw-props');
    textEditor.addEventListener('blur', (e) => {
      if (!inProps(e.relatedTarget)) closeText();
    });
    textProps.addEventListener('focusout', (e) => {
      if (editing && e.relatedTarget !== textEditor && !inProps(e.relatedTarget)) closeText();
    });
    textEditor.addEventListener('keydown', (e) => {
      e.stopPropagation();
      // Enter makes a new line; Escape, or Ctrl+Enter, is done.
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        closeText();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        document.execCommand('insertLineBreak');
      }
    });
    // Text pasted as text, its look the box's.
    textEditor.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text/plain');
      if (text === undefined) return;
      e.preventDefault();
      document.execCommand('insertText', false, text);
    });
    textEditor.addEventListener('pointerdown', (e) => e.stopPropagation());
    stage.append(textEditor);

    // --- commands ------------------------------------------------------------------
    const restore = (from: string[], to: string[]): void => {
      const prev = from.pop();
      if (!prev) return;
      to.push(JSON.stringify(d));
      d = JSON.parse(prev) as Drawing;
      selected = selected.filter((id) => shapeById(d, id));
      render();
    };
    const doUndo = (): void => restore(undo, redo);
    const doRedo = (): void => restore(redo, undo);
    const del = (): void => {
      if (!selected.length) return;
      snapshot();
      remove(d, selected);
      select([]);
    };
    const dup = (): void => {
      if (!selected.length) return;
      snapshot();
      select(duplicate(d, selected, d.grid * 2 || 10, d.grid * 2 || 10).map((s) => s.id));
    };
    const turn = (): void => {
      if (!sel().some((s) => s.kind === 'symbol')) return;
      snapshot();
      rotate(d, selected);
      render();
    };
    const flip = (): void => {
      if (!sel().some((s) => s.kind === 'symbol')) return;
      snapshot();
      mirror(d, selected);
      render();
    };
    const order = (front: boolean): void => {
      if (!selected.length) return;
      snapshot();
      const picked = d.shapes.filter((s) => selected.includes(s.id));
      const rest = d.shapes.filter((s) => !selected.includes(s.id));
      d.shapes = front ? [...rest, ...picked] : [...picked, ...rest];
      render();
    };
    const align = (how: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'): void => {
      const boxes = sel().map((s) => [s, bbox(s) ?? domBox(s.id)] as const).filter((x): x is readonly [Shape, [number, number, number, number]] => !!x[1]);
      if (boxes.length < 2) return;
      snapshot();
      const all = boxes.map((x) => x[1]);
      const target = {
        left: Math.min(...all.map((b) => b[0])), right: Math.max(...all.map((b) => b[2])), top: Math.min(...all.map((b) => b[1])), bottom: Math.max(...all.map((b) => b[3])),
        center: (Math.min(...all.map((b) => b[0])) + Math.max(...all.map((b) => b[2]))) / 2, middle: (Math.min(...all.map((b) => b[1])) + Math.max(...all.map((b) => b[3]))) / 2,
      }[how];
      for (const [s, b] of boxes) {
        const dx = how === 'left' ? target - b[0] : how === 'right' ? target - b[2] : how === 'center' ? target - (b[0] + b[2]) / 2 : 0;
        const dy = how === 'top' ? target - b[1] : how === 'bottom' ? target - b[3] : how === 'middle' ? target - (b[1] + b[3]) / 2 : 0;
        moveShapes(d, [s.id], dx, dy);
      }
      render();
    };
    // DRAW-019: the wheel zooms where the pointer is; the middle button, or two fingers, pan; two fingers pinch.
    const zoomPan = {
      content: (): Element => svg,
      zoom: (): number => zoom,
      setZoom: (z: number): void => {
        zoom = Math.min(8, Math.max(0.1, z));
        zoomLabel.textContent = `${Math.round(zoom * 100)} %`;
        render();
      },
      cancel: (): void => {
        if (!drag) return;
        if (drag.kind === 'band') drag.el.remove();
        else {
          const before = undo.pop();
          if (before) d = JSON.parse(before) as Drawing;
        }
        drag = undefined;
        render();
      },
    };
    const setZoom = (z: number): void => zoomAt(stage, zoomPan, z);
    attachZoomPan(stage, zoomPan);
    const addSymbol = (def: SymbolDef): void => {
      snapshot();
      const r = stage.getBoundingClientRect();
      const s = svg.getBoundingClientRect();
      const cx = r.width && s.width ? ((r.left + r.width / 2 - s.left) / s.width) * d.width : d.width / 2;
      const cy = r.height && s.height ? ((r.top + r.height / 2 - s.top) / s.height) * d.height : d.height / 2;
      // Shifted when another symbol is already there.
      let [x, y] = [Math.min(d.width - 40, Math.max(40, cx)), Math.min(d.height - 40, Math.max(40, cy))];
      while (d.shapes.some((o) => o.kind === 'symbol' && Math.abs(o.x - snap(x, d.grid)) < 20 && Math.abs(o.y - snap(y, d.grid)) < 20)) [x, y] = [x + 20, y + 20];
      const placed = placeSymbol(d, def.id, x, y);
      if (style.stroke !== '#000000') placed.stroke = style.stroke;
      setTool('select');
      select([placed.id]);
      svg.focus();
    };

    function onKey(e: KeyboardEvent): void {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return e.shiftKey ? doRedo() : doUndo();
      }
      if (mod && e.key.toLowerCase() === 'y') return void (e.preventDefault(), doRedo());
      if (mod && e.key.toLowerCase() === 'd') return void (e.preventDefault(), dup());
      if (mod && e.key.toLowerCase() === 'a') return void (e.preventDefault(), select(d.shapes.map((s) => s.id)));
      if (mod || e.altKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') return void (e.preventDefault(), del());
      if (e.key === 'Escape' && (selected.length || tool !== 'select')) {
        e.preventDefault();
        e.stopPropagation();
        setTool('select');
        return select([]);
      }
      const step = e.shiftKey ? 1 : d.grid || 10;
      const moves: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (moves[e.key] && selected.length) {
        e.preventDefault();
        snapshot();
        moveShapes(d, selected, ...moves[e.key]!);
        return render();
      }
      if (e.key === 'r' || e.key === 'R') return turn();
      if (e.key === 'm' || e.key === 'M') return flip();
    }
    svg.addEventListener('keydown', onKey);

    // --- toolbar -------------------------------------------------------------------
    const tools: [Tool, string, string][] = [
      ['select', '⬚', t('draw.select')], ['rect', '▭', t('draw.rect')], ['ellipse', '◯', t('draw.ellipse')], ['line', '╱', t('draw.line')],
      ['arrow', '➝', t('draw.arrow')], ['free', '✎', t('draw.free')], ['text', 'T', t('draw.text')], ['wire', '⌐', t('draw.wire')],
    ];
    const toolButtons = tools.map(([value, icon, label]) => {
      const b = button(label, () => setTool(value), { text: icon, title: label, pressed: value === tool });
      b.dataset.tool = value;
      return b;
    });
    const syncTools = (): void => {
      for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
      svg.dataset.tool = tool;
    };
    const setTool = (value: Tool): void => {
      tool = value;
      if (tool !== 'select') selected = [];
      syncTools();
      render();
    };
    const undoBtn = button(t('common.undo'), doUndo, { text: '↶', title: t('common.undo') });
    const redoBtn = button(t('common.redo'), doRedo, { text: '↷', title: t('common.redo') });
    const zoomLabel = h('span', { class: 'draw-zoom' }, '100 %');
    const gridBox = h('input', { type: 'checkbox', checked: !!d.showGrid });
    gridBox.addEventListener('change', () => {
      d.showGrid = gridBox.checked;
      render();
    });
    const snapBox = h('input', { type: 'checkbox', checked: d.grid > 0 });
    snapBox.addEventListener('change', () => {
      d.grid = snapBox.checked ? 10 : 0;
      render();
    });
    const alignSelect = h('select', { 'aria-label': t('draw.align') }, h('option', { value: '' }, t('draw.align')), ...(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((a) => h('option', { value: a }, t(`draw.align.${a}`))));
    alignSelect.addEventListener('change', () => {
      if (alignSelect.value) align(alignSelect.value as Parameters<typeof align>[0]);
      alignSelect.value = '';
    });

    // --- symbols -------------------------------------------------------------------
    const search = h('input', { type: 'search', placeholder: t('draw.searchSymbols'), 'aria-label': t('draw.searchSymbols') });
    const category = h('select', { 'aria-label': t('draw.library') }, h('option', { value: '' }, t('draw.allLibraries')), ...CATEGORIES.map((c) => h('option', { value: c }, t(`draw.lib.${c}`))));
    const list = h('div', { class: 'draw-symbols', role: 'list', 'aria-label': t('draw.symbols') });
    const fillSymbols = (): void => {
      list.replaceChildren(
        ...searchSymbols(search.value, (category.value || undefined) as SymbolCategory | undefined).map((def) => {
          const b = h('button', { type: 'button', class: 'draw-symbol', role: 'listitem', title: def.name, 'aria-label': def.name });
          b.innerHTML = symbolPreview(def);
          b.append(h('span', {}, def.name));
          b.addEventListener('click', () => addSymbol(def));
          return b;
        }),
      );
    };
    search.addEventListener('input', fillSymbols);
    category.addEventListener('change', fillSymbols);
    fillSymbols();

    // --- size, alt text, export ---------------------------------------------------
    const sizeInput = (value: number, label: string, set: (v: number) => void): HTMLInputElement => {
      const input = h('input', { type: 'number', min: '50', max: '5000', step: '10', value: String(value), 'aria-label': label, class: 'draw-size' });
      input.addEventListener('change', () => {
        const v = Number(input.value);
        if (v >= 50 && v <= 5000) {
          snapshot();
          set(v);
          render();
        }
      });
      return input;
    };
    const alt = h('input', { type: 'text', value: d.alt ?? '', 'aria-label': t('draw.alt'), placeholder: t('draw.altHint'), class: 'draw-alt' });
    alt.addEventListener('change', () => {
      d.alt = alt.value.trim() || undefined;
    });
    const fit = (): void => {
      const boxes = d.shapes.map((s) => bbox(s) ?? domBox(s.id)).filter((b): b is [number, number, number, number] => !!b);
      if (!boxes.length) return;
      snapshot();
      const [x0, y0] = [Math.min(...boxes.map((b) => b[0])), Math.min(...boxes.map((b) => b[1]))];
      const [x1, y1] = [Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
      const m = 20;
      moveShapes(d, d.shapes.map((s) => s.id), snap(m - x0, d.grid), snap(m - y0, d.grid));
      d.width = Math.max(50, Math.ceil((x1 - x0 + 2 * m) / 10) * 10);
      d.height = Math.max(50, Math.ceil((y1 - y0 + 2 * m) / 10) * 10);
      widthSize.value = String(d.width);
      heightSize.value = String(d.height);
      render();
    };
    const widthSize = sizeInput(d.width, t('draw.widthPx'), (v) => (d.width = v));
    const heightSize = sizeInput(d.height, t('draw.heightPx'), (v) => (d.height = v));
    const save = (blob: Blob, name: string): void => {
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    };
    const exportSvg = (): void => save(new Blob([toSvg(d)], { type: 'image/svg+xml' }), 'drawing.svg');
    const exportAsPng = async (): Promise<void> => save(await exportPng(d, 2), 'drawing.png');
    // DRAW-021: a PDF of the drawing, as vectors; a picture of it when its text needs more than the standard fonts.
    const exportAsPdf = async (): Promise<void> => {
      if (editing) closeText();
      const [{ drawingPdf }, { drawingOps, WIN_ANSI }] = await Promise.all([import('../pdf/forms'), import('../pdf/vector')]);
      const png = drawingOps(d, WIN_ANSI) ? undefined : new Uint8Array(await (await exportPng(d, 3, '#ffffff')).arrayBuffer());
      const bytes = await drawingPdf(d, png);
      save(new Blob([bytes as BlobPart], { type: 'application/pdf' }), 'drawing.pdf');
    };
    // DRAW-009: the netlist and the parts of an electrical schematic.
    const electrical = (): boolean => d.shapes.some((s) => s.kind === 'symbol' && symbolDef(s.sym)?.category === 'electrical');
    const exportNetlist = async (): Promise<void> => {
      const { spiceNetlist } = await import('./netlist');
      save(new Blob([spiceNetlist(d, d.alt || t('draw.title'))], { type: 'text/plain' }), 'schematic.cir');
    };
    const exportBom = async (): Promise<void> => {
      const { billOfMaterials, bomCsv } = await import('./netlist');
      save(new Blob([bomCsv(billOfMaterials(d), [t('draw.bom.quantity'), t('draw.bom.references'), t('draw.bom.component'), t('draw.value')])], { type: 'text/csv' }), 'bill-of-materials.csv');
    };
    const netlistBtn = button(t('draw.netlist'), () => void exportNetlist(), { title: t('draw.netlistTitle') });
    const bomBtn = button(t('draw.bom'), () => void exportBom(), { title: t('draw.bomTitle') });

    const dialog = h('dialog', { class: `dialog draw-dialog${options.full ? ' draw-full' : ''}`, 'aria-labelledby': 'draw-title' });
    const library = h('aside', { class: 'draw-library', 'aria-label': t('draw.symbols') }, search, category, list);
    const side = h('aside', { class: 'draw-side' }, h('h3', {}, t('draw.objects')), objects);
    // PDF-021: panels shown on demand, the page keeping the room.
    const panelToggle = (panel: HTMLElement, label: string, text: string): HTMLButtonElement => {
      panel.hidden = true;
      const b = button(label, () => {
        panel.hidden = !panel.hidden;
        b.setAttribute('aria-pressed', String(!panel.hidden));
      }, { text, title: label });
      b.setAttribute('aria-pressed', 'false');
      return b;
    };
    const panelButtons = options.full ? [panelToggle(library, t('draw.symbols'), '⌘'), panelToggle(side, t('draw.objects'), '☰')] : [];
    const actions = h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('draw.done'), () => finish(d), { className: 'primary' }));
    const finish = (value: Drawing | null): void => {
      if (editing) closeText();
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.append(
      options.full ? h('div', { class: 'draw-head' }, h('h2', { id: 'draw-title' }, options.title ?? t('draw.title')), actions) : h('h2', { id: 'draw-title' }, options.title ?? t('draw.title')),
      h(
        'div',
        { class: 'draw-toolbar', role: 'toolbar', 'aria-label': t('draw.tools') },
        h('span', { class: 'draw-group' }, ...toolButtons),
        h('span', { class: 'draw-group' }, undoBtn, redoBtn),
        h(
          'span',
          { class: 'draw-group' },
          button(t('draw.delete'), del, { text: '🗑', title: `${t('draw.delete')} (Del)` }),
          button(t('draw.duplicate'), dup, { text: '⧉', title: `${t('draw.duplicate')} (Ctrl+D)` }),
          button(t('draw.rotate'), turn, { text: '⟳', title: `${t('draw.rotate')} (R)` }),
          button(t('draw.mirror'), flip, { text: '⇋', title: `${t('draw.mirror')} (M)` }),
          button(t('draw.front'), () => order(true), { text: '⬆', title: t('draw.front') }),
          button(t('draw.back'), () => order(false), { text: '⬇', title: t('draw.back') }),
          alignSelect,
        ),
        h(
          'span',
          { class: 'draw-group' },
          button(t('draw.zoomOut'), () => setZoom(zoom / 1.25), { text: '−', title: t('draw.zoomOut') }),
          zoomLabel,
          button(t('draw.zoomIn'), () => setZoom(zoom * 1.25), { text: '+', title: t('draw.zoomIn') }),
          h('label', {}, gridBox, ` ${t('draw.grid')}`),
          h('label', {}, snapBox, ` ${t('draw.snap')}`),
        ),
        ...(panelButtons.length ? [h('span', { class: 'draw-group' }, ...panelButtons)] : []),
      ),
      h(
        'div',
        { class: 'draw-props', role: 'group', 'aria-label': t('draw.props') },
        h('label', {}, `${t('draw.stroke')} `, strokeInput),
        h('label', {}, `${t('draw.fill')} `, fillInput),
        h('label', {}, noFill, ` ${t('draw.noFill')}`),
        h('label', {}, `${t('draw.width')} `, widthInput),
        h('label', {}, `${t('draw.dash')} `, dashInput),
        symbolProps,
        lineProps,
        textProps,
      ),
      h(
        'div',
        { class: 'draw-body' },
        library,
        h('div', { class: 'draw-main' }, stage, status),
        side,
      ),
      ...(options.full
        ? []
        : [
            h(
              'div',
              { class: 'draw-footer' },
              h('label', {}, `${t('draw.alt')} `, alt),
              ...(options.fixedSize
                ? []
                : [h('label', {}, `${t('draw.widthPx')} `, widthSize), h('label', {}, `${t('draw.heightPx')} `, heightSize), button(t('draw.fit'), fit, { title: t('draw.fitTitle') })]),
              button(t('draw.exportSvg'), exportSvg),
              button(t('draw.exportPng'), () => void exportAsPng()),
              button(t('draw.exportPdf'), () => void exportAsPdf(), { title: t('draw.exportPdfTitle') }),
              netlistBtn,
              bomBtn,
            ),
            actions,
          ]),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!undo.length || window.confirm(t('draw.discard'))) finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    syncTools();
    render();
    if (options.full) {
      // The page as wide as the window allows, read from the top.
      const box = getComputedStyle(stage);
      const room = stage.clientWidth - parseFloat(box.paddingLeft) - parseFloat(box.paddingRight);
      if (room > 0 && d.width) zoomPan.setZoom(Math.min(4, room / d.width));
    }
    svg.focus();
  });
}

/** Ramer–Douglas–Peucker: fewer points along a freehand stroke. */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points;
  const [a, b] = [points[0]!, points[points.length - 1]!];
  let [index, max] = [0, 0];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const dist = len ? Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / len : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (dist > max) [index, max] = [i, dist];
  }
  if (max <= tolerance) return [a, b];
  return [...simplify(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplify(points.slice(index), tolerance)];
}

/** The distance from a point to a segment. */
function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + k * dx), p[1] - (a[1] + k * dy));
}
