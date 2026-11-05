/**
 * DRAW-008, DRAW-013..DRAW-016: a bitmap painting editor, for a new picture or a
 * picture of a document — pencil, brush, eraser, fill, gradient, shapes,
 * text, colour picker, selection moved, copied or deleted — with layers
 * (DRAW-013): painted layers and vector layers whose shapes stay shapes
 * (DRAW-014), shown or hidden, with their opacity, reordered, merged; a
 * background of a colour, transparent or a picture; pictures imported as
 * layers; the picture cropped, rotated (a quarter turn or any angle),
 * flipped, resized (DRAW-015); the alpha channel kept where the format has
 * one. A layered picture is saved as OpenRaster (.ora), else flattened.
 */
import { attachZoomPan, zoomAt } from '../app/zoom-pan';
import { button, h } from '../app/dom';
import { immersive } from '../app/immersive';
import { t } from '../i18n';
import { ORA_TYPE, readOra, writeOra, type OraLayer } from './ora';
import { along, floodFill, hexToRgba, keepsAlpha, pixelAt, rectBetween, rgbaToHex } from './pixels';
import { bounds, drawShapes, moved, shapeAt, type VectorShape } from './vector';

export interface PaintedPicture {
  bytes: Uint8Array;
  mediaType: string;
  width: number;
  height: number;
}

export interface PaintOptions {
  /** The picture may be saved with its layers (OpenRaster); else it is always flattened. */
  layered?: boolean;
}

type Tool = 'pencil' | 'brush' | 'eraser' | 'fill' | 'gradient' | 'line' | 'rect' | 'ellipse' | 'text' | 'picker' | 'select';
type Pt = [number, number];
interface Rect { x: number; y: number; w: number; h: number }

interface Layer {
  id: number;
  name: string;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  visible: boolean;
  opacity: number;
  /** DRAW-014: a vector layer: its shapes, drawn on its canvas. */
  shapes?: VectorShape[];
  /** Bumped at each change of its pixels: an undo step copies only the layers changed. */
  version: number;
  snap?: { version: number; data: ImageData };
}

interface State {
  width: number;
  height: number;
  active: number;
  layers: { id: number; name: string; visible: boolean; opacity: number; shapes?: VectorShape[]; data: ImageData; version: number }[];
}

const MAX_UNDO = 30;
const PIXEL_TOOLS: Tool[] = ['pencil', 'brush', 'eraser', 'fill', 'gradient'];

const newCanvas = (w: number, hh: number): HTMLCanvasElement => {
  const c = h('canvas', { class: 'paint-layer' });
  c.width = w;
  c.height = hh;
  return c;
};
const context = (c: HTMLCanvasElement): CanvasRenderingContext2D => c.getContext('2d', { willReadFrequently: true })!;
const toBlob = (c: HTMLCanvasElement, type: string): Promise<Uint8Array> =>
  new Promise<Blob | null>((r) => c.toBlob(r, type, 0.92)).then(async (b) => (b ? new Uint8Array(await b.arrayBuffer()) : new Uint8Array()));

export async function paintPicture(
  host: HTMLElement,
  source?: { bytes: Uint8Array; mediaType: string },
  size: { width: number; height: number } = { width: 800, height: 500 },
  opts: PaintOptions = {},
): Promise<PaintedPicture | null> {
  // An OpenRaster file: its layers; another picture: one layer.
  const ora = source?.mediaType === ORA_TYPE ? readOra(source.bytes) : undefined;
  const bitmap = source && !ora ? await createImageBitmap(new Blob([source.bytes as BlobPart], { type: source.mediaType })) : undefined;
  const oraBitmaps = ora ? await Promise.all(ora.layers.map((l) => createImageBitmap(new Blob([l.png as BlobPart], { type: 'image/png' })))) : [];
  const mediaType = source && [...['image/png', 'image/jpeg', 'image/webp'], ORA_TYPE].includes(source.mediaType) ? source.mediaType : 'image/png';
  const opaque = mediaType !== ORA_TYPE && !keepsAlpha(mediaType);
  return new Promise((resolve) => {
    // --- layers ------------------------------------------------------------------------
    let width = ora?.width ?? bitmap?.width ?? size.width;
    let height = ora?.height ?? bitmap?.height ?? size.height;
    let nextId = 1;
    const layers: Layer[] = [];
    let active = 0;
    const A = (): Layer => layers[active]!;
    const makeLayer = (name: string, shapes?: VectorShape[]): Layer => {
      const canvas = newCanvas(width, height);
      return { id: nextId++, name, canvas, ctx: context(canvas), visible: true, opacity: 1, version: 0, ...(shapes ? { shapes } : {}) };
    };
    const touch = (l: Layer = A()): void => void l.version++;
    const renderVector = (l: Layer): void => {
      if (!l.shapes) return;
      l.ctx.clearRect(0, 0, width, height);
      drawShapes(l.ctx, l.shapes);
      touch(l);
    };
    if (ora) {
      ora.layers.forEach((o, i) => {
        const l = makeLayer(o.name || `${t('paint.layer')} ${i + 1}`, o.shapes);
        l.visible = o.visible;
        l.opacity = o.opacity;
        if (l.shapes) renderVector(l);
        else l.ctx.drawImage(oraBitmaps[i]!, o.x, o.y);
        layers.push(l);
      });
      oraBitmaps.forEach((b) => b.close());
    }
    if (!layers.length) {
      const bg = makeLayer(t('paint.background'));
      if (bitmap) bg.ctx.drawImage(bitmap, 0, 0);
      else {
        bg.ctx.fillStyle = '#ffffff';
        bg.ctx.fillRect(0, 0, width, height);
      }
      layers.push(bg);
    }
    bitmap?.close();
    active = layers.length - 1;

    const overlay = h('canvas', { class: 'paint-canvas paint-overlay', tabindex: '0', role: 'img', 'aria-label': t('paint.canvas') });
    const octx = overlay.getContext('2d')!;
    const stack = h('div', { class: 'paint-stack' });
    let tool: Tool = 'brush';
    let zoom = Math.min(1, 900 / width);
    let changed = false;

    // --- undo: the layers changed since the last step are copied ----------------------
    const undo: State[] = [];
    const redo: State[] = [];
    const capture = (): State => ({
      width,
      height,
      active,
      layers: layers.map((l) => {
        if (!l.snap || l.snap.version !== l.version || l.snap.data.width !== width || l.snap.data.height !== height) l.snap = { version: l.version, data: l.ctx.getImageData(0, 0, width, height) };
        return { id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, data: l.snap.data, version: l.version, ...(l.shapes ? { shapes: [...l.shapes] } : {}) };
      }),
    });
    const snapshot = (): void => {
      undo.push(capture());
      if (undo.length > MAX_UNDO) undo.shift();
      redo.length = 0;
      changed = true;
      sync();
    };
    const apply = (s: State): void => {
      width = s.width;
      height = s.height;
      const old = new Map(layers.map((l) => [l.id, l]));
      layers.length = 0;
      for (const saved of s.layers) {
        const l = old.get(saved.id) ?? makeLayer(saved.name);
        l.id = saved.id;
        l.name = saved.name;
        l.visible = saved.visible;
        l.opacity = saved.opacity;
        l.shapes = saved.shapes ? [...saved.shapes] : undefined;
        l.canvas.width = width;
        l.canvas.height = height;
        l.ctx.putImageData(saved.data, 0, 0);
        l.version = saved.version;
        l.snap = { version: saved.version, data: saved.data };
        layers.push(l);
      }
      active = Math.min(s.active, layers.length - 1);
    };
    const restore = (from: State[], to: State[]): void => {
      commitFloat();
      const s = from.pop();
      if (!s) return;
      to.push(capture());
      apply(s);
      selection = undefined;
      picked = undefined;
      relayout();
    };

    // --- controls ------------------------------------------------------------------
    const colorInput = h('input', { type: 'color', value: '#1f2937', 'aria-label': t('paint.color') });
    const color2Input = h('input', { type: 'color', value: '#ffffff', 'aria-label': t('paint.color2') });
    const sizeInput = h('input', { type: 'range', min: '1', max: '64', value: '6', 'aria-label': t('paint.size') });
    const sizeLabel = h('span', { class: 'paint-value' }, '6 px');
    const opacityInput = h('input', { type: 'range', min: '5', max: '100', value: '100', 'aria-label': t('paint.opacity') });
    const opacityLabel = h('span', { class: 'paint-value' }, '100 %');
    const filled = h('input', { type: 'checkbox' });
    // DRAW-016: from the first colour to the second along a line, around a point, turning; or every hue around.
    const gradientKind = h('select', { 'aria-label': t('paint.gradientKind') }, ...(['linear', 'radial', 'conic', 'hues'] as const).map((k) => h('option', { value: k }, t(`paint.gradient.${k}` as 'paint.gradient.linear'))));
    sizeInput.addEventListener('input', () => (sizeLabel.textContent = `${sizeInput.value} px`));
    opacityInput.addEventListener('input', () => (opacityLabel.textContent = `${opacityInput.value} %`));
    const color = (): string => colorInput.value;
    const lineWidth = (): number => Number(sizeInput.value);
    const alpha = (): number => Number(opacityInput.value) / 100;
    const status = h('p', { class: 'paint-status', role: 'status' });
    const say = (text: string): void => {
      status.textContent = text;
      clearTimeout(sayTimer);
      sayTimer = setTimeout(sync, 4000);
    };
    let sayTimer: ReturnType<typeof setTimeout> | undefined;

    const tools: [Tool, string, string][] = [
      ['pencil', '✏', t('paint.pencil')], ['brush', '🖌', t('paint.brush')], ['eraser', '⌫', t('paint.eraser')], ['fill', '🪣', t('paint.fill')], ['gradient', '🌈', t('paint.gradient')],
      ['line', '╱', t('draw.line')], ['rect', '▭', t('draw.rect')], ['ellipse', '◯', t('draw.ellipse')], ['text', 'T', t('draw.text')],
      ['picker', '💧', t('paint.picker')], ['select', '⬚', t('paint.select')],
    ];
    const toolButtons = tools.map(([value, icon, label]) => {
      const b = button(label, () => setTool(value), { text: icon, title: label, pressed: value === tool });
      b.dataset.tool = value;
      return b;
    });
    const setTool = (value: Tool): void => {
      if (value !== 'select') commitFloat();
      tool = value;
      for (const b of toolButtons) b.setAttribute('aria-pressed', String(b.dataset.tool === tool));
      overlay.dataset.tool = tool;
      if (value !== 'select') picked = undefined;
      drawOverlay();
    };
    const undoBtn = button(t('common.undo'), () => restore(undo, redo), { text: '↶', title: t('common.undo') });
    const redoBtn = button(t('common.redo'), () => restore(redo, undo), { text: '↷', title: t('common.redo') });
    const zoomLabel = h('span', { class: 'paint-value' });
    const wInput = h('input', { type: 'number', min: '1', max: '8000', 'aria-label': t('draw.widthPx'), class: 'draw-size' });
    const hInput = h('input', { type: 'number', min: '1', max: '8000', 'aria-label': t('draw.heightPx'), class: 'draw-size' });
    function sync(): void {
      undoBtn.disabled = !undo.length;
      redoBtn.disabled = !redo.length;
      zoomLabel.textContent = `${Math.round(zoom * 100)} %`;
      for (const c of [...layers.map((l) => l.canvas), overlay]) {
        c.style.width = `${width * zoom}px`;
        c.style.height = `${height * zoom}px`;
      }
      wInput.value = String(width);
      hInput.value = String(height);
      const sel = selection ? ` · ${t('paint.selection')} ${selection.w} × ${selection.h}` : '';
      status.textContent = `${width} × ${height} px · ${A().name}${A().shapes ? ` (${t('paint.vector')})` : ''}${sel}`;
    }

    // --- the layers panel -------------------------------------------------------------
    const layerList = h('ul', { class: 'paint-layers', role: 'listbox', 'aria-label': t('paint.layers') });
    const layerOpacity = h('input', { type: 'range', min: '0', max: '100', 'aria-label': t('paint.layerOpacity') });
    const layerOpacityLabel = h('span', { class: 'paint-value' });
    layerOpacity.addEventListener('input', () => {
      A().opacity = Number(layerOpacity.value) / 100;
      layerOpacityLabel.textContent = `${layerOpacity.value} %`;
      relayout(false);
    });
    layerOpacity.addEventListener('pointerdown', () => snapshot());
    layerOpacity.addEventListener('keydown', () => snapshot(), { once: false });
    const selectLayer = (i: number): void => {
      commitFloat();
      picked = undefined;
      selection = undefined;
      active = Math.max(0, Math.min(i, layers.length - 1));
      relayout(false);
    };
    const renderLayers = (): void => {
      layerList.replaceChildren(
        ...[...layers]
          .map((l, i) => {
            const eye = button(t(l.visible ? 'paint.hideLayer' : 'paint.showLayer', { name: l.name }), () => {
              snapshot();
              l.visible = !l.visible;
              relayout(false);
            }, { text: l.visible ? '👁' : '◌', className: 'paint-eye' });
            const row = h(
              'li',
              { class: `paint-layer-row${i === active ? ' active' : ''}`, role: 'option', 'aria-selected': String(i === active), tabindex: '-1' },
              eye,
              h('span', { class: 'paint-layer-kind', 'aria-hidden': 'true' }, l.shapes ? '◇' : '▦'),
              h('span', { class: 'paint-layer-name' }, l.name),
              l.opacity < 1 ? h('span', { class: 'paint-value' }, `${Math.round(l.opacity * 100)} %`) : null,
            );
            row.addEventListener('click', (e) => {
              if ((e.target as HTMLElement).closest('.paint-eye')) return;
              selectLayer(i);
            });
            row.addEventListener('dblclick', () => renameLayer());
            return row;
          })
          .reverse(),
      );
      layerOpacity.value = String(Math.round(A().opacity * 100));
      layerOpacityLabel.textContent = `${layerOpacity.value} %`;
      for (const [b, ok] of layerButtonsState()) b.disabled = !ok;
    };
    /** The layers shown in order, the overlay on top, sized for the zoom. */
    function relayout(rebuild = true): void {
      if (rebuild || stack.childElementCount !== layers.length + 1) stack.replaceChildren(...layers.map((l) => l.canvas), overlay);
      overlay.width = width;
      overlay.height = height;
      layers.forEach((l, i) => {
        l.canvas.style.opacity = String(l.opacity);
        l.canvas.hidden = !l.visible;
        l.canvas.classList.toggle('active', i === active);
      });
      drawOverlay();
      renderLayers();
      sync();
    }
    const addLayer = (vector: boolean): void => {
      commitFloat();
      snapshot();
      const n = layers.length + 1;
      const l = makeLayer(`${t(vector ? 'paint.vectorLayer' : 'paint.layer')} ${n}`, vector ? [] : undefined);
      layers.splice(active + 1, 0, l);
      active++;
      relayout();
    };
    const duplicateLayer = (): void => {
      commitFloat();
      snapshot();
      const src = A();
      const l = makeLayer(t('paint.copyOf', { name: src.name }), src.shapes ? [...src.shapes] : undefined);
      l.ctx.drawImage(src.canvas, 0, 0);
      l.opacity = src.opacity;
      layers.splice(active + 1, 0, l);
      active++;
      relayout();
    };
    const deleteLayer = (): void => {
      if (layers.length < 2) return;
      commitFloat();
      snapshot();
      layers.splice(active, 1);
      active = Math.max(0, active - 1);
      relayout();
    };
    const moveLayer = (by: number): void => {
      const to = active + by;
      if (to < 0 || to >= layers.length) return;
      commitFloat();
      snapshot();
      const [l] = layers.splice(active, 1);
      layers.splice(to, 0, l!);
      active = to;
      relayout();
    };
    /** The layer drawn on the one under it, with its opacity; a vector layer becomes pixels. */
    const mergeDown = (): void => {
      if (active < 1) return;
      commitFloat();
      snapshot();
      const top = A();
      const under = layers[active - 1]!;
      if (under.shapes) rasterize(under);
      if (top.visible) {
        under.ctx.save();
        under.ctx.globalAlpha = top.opacity;
        under.ctx.drawImage(top.canvas, 0, 0);
        under.ctx.restore();
      }
      touch(under);
      layers.splice(active, 1);
      active--;
      relayout();
    };
    /** A vector layer made pixels: it can be painted on, its shapes no longer shapes. */
    function rasterize(l: Layer = A()): void {
      if (!l.shapes) return;
      l.shapes = undefined;
      touch(l);
    }
    const renameLayer = (): void => {
      const name = window.prompt(t('paint.renameLayer'), A().name)?.trim();
      if (!name || name === A().name) return;
      snapshot();
      A().name = name;
      relayout(false);
    };
    const layerButtons = {
      bitmap: button(t('paint.newLayer'), () => addLayer(false), { text: '＋▦', title: t('paint.newLayer') }),
      vector: button(t('paint.newVectorLayer'), () => addLayer(true), { text: '＋◇', title: t('paint.newVectorLayer') }),
      import: button(t('paint.importImage'), () => void importImage(), { text: '🖼＋', title: t('paint.importImageTitle') }),
      duplicate: button(t('paint.duplicateLayer'), duplicateLayer, { text: '⧉', title: t('paint.duplicateLayer') }),
      up: button(t('paint.layerUp'), () => moveLayer(1), { text: '▲', title: t('paint.layerUp') }),
      down: button(t('paint.layerDown'), () => moveLayer(-1), { text: '▼', title: t('paint.layerDown') }),
      merge: button(t('paint.mergeDown'), mergeDown, { text: '⤓', title: t('paint.mergeDown') }),
      rasterize: button(t('paint.rasterize'), () => {
        snapshot();
        rasterize();
        relayout(false);
      }, { text: '◇→▦', title: t('paint.rasterizeTitle') }),
      rotate: button(t('paint.rotateLayer'), () => rotateLayerBy(), { text: '⟳', title: t('paint.rotateLayer') }),
      rename: button(t('paint.renameLayer'), renameLayer, { text: '✎', title: t('paint.renameLayer') }),
      remove: button(t('paint.deleteLayer'), deleteLayer, { text: '🗑', title: t('paint.deleteLayer') }),
    };
    const layerButtonsState = (): [HTMLButtonElement, boolean][] => [
      [layerButtons.up, active < layers.length - 1],
      [layerButtons.down, active > 0],
      [layerButtons.merge, active > 0],
      [layerButtons.remove, layers.length > 1],
      [layerButtons.rasterize, !!A().shapes],
      [layerButtons.rotate, !A().shapes],
    ];

    // --- the picture: crop, rotate, flip, resize, background (DRAW-015) ----------------
    /** Every layer drawn again on a new canvas of the new size; vector layers kept when `shapes` says how. */
    const transform = (w: number, hh: number, draw: (c: CanvasRenderingContext2D, from: HTMLCanvasElement) => void, shapes?: (s: VectorShape) => VectorShape): void => {
      for (const l of layers) {
        const old = newCanvas(width, height);
        old.getContext('2d')!.drawImage(l.canvas, 0, 0);
        l.canvas.width = w;
        l.canvas.height = hh;
        if (l.shapes && shapes) {
          l.shapes = l.shapes.map(shapes);
          drawShapes(l.ctx, l.shapes);
        } else {
          l.shapes = undefined;
          l.ctx.save();
          draw(l.ctx, old);
          l.ctx.restore();
        }
        touch(l);
      }
      width = w;
      height = hh;
      selection = undefined;
      picked = undefined;
      relayout();
    };
    const hasVector = (): boolean => layers.some((l) => l.shapes);
    const vectorsOk = (): boolean => !hasVector() || window.confirm(t('paint.vectorBecomesPixels'));
    const crop = (): void => {
      commitFloat();
      const r = selection;
      if (!r) return say(t('paint.cropNeedsSelection'));
      snapshot();
      transform(r.w, r.h, (c, from) => c.drawImage(from, -r.x, -r.y), (s) => moved(s, -r.x, -r.y));
    };
    /** The whole picture turned; any angle makes the canvas larger, its new corners transparent. */
    const rotate = (degrees: number): void => {
      commitFloat();
      const quarter = ((degrees % 360) + 360) % 90 === 0;
      if (!quarter && !vectorsOk()) return;
      if (quarter && hasVector() && !vectorsOk()) return;
      const rad = (degrees * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = Math.round(width * cos + height * sin);
      const hh = Math.round(width * sin + height * cos);
      snapshot();
      const [ow, oh] = [width, height];
      transform(w, hh, (c, from) => {
        c.translate(w / 2, hh / 2);
        c.rotate(rad);
        c.drawImage(from, -ow / 2, -oh / 2);
      });
    };
    const rotateBy = (): void => {
      const value = window.prompt(t('paint.rotatePrompt'), '15');
      const degrees = Number(value?.replace(',', '.'));
      if (value === null || value === undefined || !Number.isFinite(degrees) || !degrees) return;
      rotate(degrees);
    };
    const flip = (horizontal: boolean): void => {
      commitFloat();
      snapshot();
      const [w, hh] = [width, height];
      transform(
        w,
        hh,
        (c, from) => {
          c.translate(horizontal ? w : 0, horizontal ? 0 : hh);
          c.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
          c.drawImage(from, 0, 0);
        },
        (s) =>
          s.kind === 'line'
            ? horizontal ? { ...s, x1: w - s.x1, x2: w - s.x2 } : { ...s, y1: hh - s.y1, y2: hh - s.y2 }
            : s.kind === 'text'
              ? s
              : horizontal ? { ...s, x: w - s.x - s.w } : { ...s, y: hh - s.y - s.h },
      );
    };
    /** The active layer turned around its centre, the canvas kept. */
    const rotateLayerBy = (): void => {
      if (A().shapes) return;
      const value = window.prompt(t('paint.rotatePrompt'), '90');
      const degrees = Number(value?.replace(',', '.'));
      if (value === null || value === undefined || !Number.isFinite(degrees) || !degrees) return;
      commitFloat();
      snapshot();
      const l = A();
      const old = newCanvas(width, height);
      old.getContext('2d')!.drawImage(l.canvas, 0, 0);
      l.ctx.clearRect(0, 0, width, height);
      l.ctx.save();
      l.ctx.translate(width / 2, height / 2);
      l.ctx.rotate((degrees * Math.PI) / 180);
      l.ctx.drawImage(old, -width / 2, -height / 2);
      l.ctx.restore();
      touch(l);
      relayout(false);
    };
    /** The canvas resized, the picture kept at the top left; the background extended with its colour. */
    const resizeCanvas = (): void => {
      const [w, hh] = [Math.round(Number(wInput.value)), Math.round(Number(hInput.value))];
      if (!(w >= 1 && hh >= 1 && w <= 8000 && hh <= 8000) || (w === width && hh === height)) return sync();
      commitFloat();
      snapshot();
      const bottom = layers[0]!;
      const fill = !bottom.shapes && background.mode === 'color' ? background.color : undefined;
      transform(w, hh, (c, from) => {
        if (fill && c === bottom.ctx) {
          c.fillStyle = fill;
          c.fillRect(0, 0, w, hh);
        }
        c.drawImage(from, 0, 0);
      }, (s) => s);
    };
    wInput.addEventListener('change', resizeCanvas);
    hInput.addEventListener('change', resizeCanvas);

    /** The bottom layer: a colour, transparent, or a picture fitted as asked. */
    const background: { mode: 'color' | 'transparent' | 'image'; color: string } = { mode: opaque || !source ? 'color' : 'transparent', color: '#ffffff' };
    const setBackground = async (): Promise<void> => {
      const choice = await chooseBackground(dialog, background.color);
      if (!choice) return;
      commitFloat();
      let bitmap: ImageBitmap | undefined;
      if (choice.mode === 'image') {
        const file = await pickImage();
        if (!file) return;
        bitmap = await createImageBitmap(file).catch(() => undefined);
        if (!bitmap) return say(t('paint.notAnImage'));
      }
      snapshot();
      // The bottom layer is the background; a vector one gets a painted layer under it.
      if (layers[0]!.shapes || layers.length === 0) {
        layers.unshift(makeLayer(t('paint.background')));
        active++;
      }
      const bg = layers[0]!;
      bg.ctx.clearRect(0, 0, width, height);
      if (choice.mode === 'color' || (choice.mode === 'image' && opaque)) {
        bg.ctx.fillStyle = choice.color;
        bg.ctx.fillRect(0, 0, width, height);
      }
      if (bitmap) {
        const r = fitRect(bitmap.width, bitmap.height, width, height, choice.fit);
        bg.ctx.drawImage(bitmap, r.x, r.y, r.w, r.h);
        bitmap.close();
      }
      background.mode = choice.mode;
      background.color = choice.color;
      touch(bg);
      relayout(false);
    };

    /** DRAW-015: a picture of the device as a new layer, placed in the middle and moved before it is put down. */
    async function importImage(): Promise<void> {
      const file = await pickImage();
      if (!file) return;
      const bitmap = await createImageBitmap(file).catch(() => undefined);
      if (!bitmap) return say(t('paint.notAnImage'));
      commitFloat();
      snapshot();
      // Larger than the canvas: made smaller to fit, its proportions kept.
      const r = fitRect(bitmap.width, bitmap.height, width, height, bitmap.width > width || bitmap.height > height ? 'contain' : 'center');
      const image = newCanvas(Math.max(1, Math.round(r.w)), Math.max(1, Math.round(r.h)));
      image.getContext('2d')!.drawImage(bitmap, 0, 0, image.width, image.height);
      bitmap.close();
      const l = makeLayer(file.name.replace(/\.[^.]+$/, '') || t('paint.layer'));
      layers.splice(active + 1, 0, l);
      active++;
      relayout();
      setTool('select');
      floating = { image, x: Math.round(r.x), y: Math.round(r.y) };
      selection = { x: floating.x, y: floating.y, w: image.width, h: image.height };
      drawOverlay();
      sync();
      say(t('paint.imported'));
    }

    /** DRAW-016: a grid drawn on the active layer, every so many pixels. */
    const drawGrid = (): void => {
      if (A().shapes) return say(t('paint.vectorNoPixels'));
      const value = window.prompt(t('paint.gridPrompt'), '20');
      // Not a whole number of pixels: 5 mm at 96 dpi is 18.9.
      const step = Number(value?.replace(',', '.'));
      if (!value || !(step >= 2)) return;
      commitFloat();
      snapshot();
      const c = A().ctx;
      c.save();
      c.globalAlpha = alpha();
      c.strokeStyle = color();
      c.lineWidth = Math.max(1, Math.round(lineWidth() / 6));
      c.beginPath();
      for (let i = 0; i * step <= width; i++) {
        const x = Math.round(i * step) + 0.5;
        c.moveTo(x, 0);
        c.lineTo(x, height);
      }
      for (let i = 0; i * step <= height; i++) {
        const y = Math.round(i * step) + 0.5;
        c.moveTo(0, y);
        c.lineTo(width, y);
      }
      c.stroke();
      c.restore();
      touch();
    };

    // --- selection ------------------------------------------------------------------
    let selection: Rect | undefined;
    /** Pixels lifted from the active layer, moved over it until dropped. */
    let floating: { image: HTMLCanvasElement; x: number; y: number } | undefined;
    let clipboard: HTMLCanvasElement | undefined;
    /** DRAW-014: the shape picked on a vector layer. */
    let picked: number | undefined;
    const cut = (r: Rect): HTMLCanvasElement => {
      const c = newCanvas(r.w, r.h);
      c.getContext('2d')!.putImageData(A().ctx.getImageData(r.x, r.y, r.w, r.h), 0, 0);
      return c;
    };
    const clearRect = (r: Rect): void => {
      const l = A();
      if (opaque && active === 0) {
        l.ctx.fillStyle = '#ffffff';
        l.ctx.fillRect(r.x, r.y, r.w, r.h);
      } else l.ctx.clearRect(r.x, r.y, r.w, r.h);
      touch(l);
    };
    const lift = (): void => {
      if (!selection || floating || A().shapes) return;
      snapshot();
      floating = { image: cut(selection), x: selection.x, y: selection.y };
      clearRect(selection);
    };
    function commitFloat(): void {
      if (!floating) return;
      A().ctx.drawImage(floating.image, floating.x, floating.y);
      touch();
      floating = undefined;
      drawOverlay();
    }
    const deleteSelection = (): void => {
      const l = A();
      if (l.shapes && picked !== undefined) {
        snapshot();
        l.shapes.splice(picked, 1);
        picked = undefined;
        renderVector(l);
        return drawOverlay();
      }
      if (floating) {
        floating = undefined;
        selection = undefined;
        return drawOverlay();
      }
      if (!selection) return;
      snapshot();
      clearRect(selection);
      selection = undefined;
      drawOverlay();
      sync();
    };
    const copy = (): void => {
      if (floating) clipboard = floating.image;
      else if (selection && !A().shapes) clipboard = cut(selection);
    };
    const paste = (): void => {
      if (!clipboard) return;
      if (A().shapes) return say(t('paint.vectorNoPixels'));
      commitFloat();
      snapshot();
      setTool('select');
      floating = { image: clipboard, x: 0, y: 0 };
      selection = { x: 0, y: 0, w: clipboard.width, h: clipboard.height };
      drawOverlay();
      sync();
    };

    function drawOverlay(preview?: (c: CanvasRenderingContext2D) => void): void {
      octx.clearRect(0, 0, overlay.width, overlay.height);
      if (floating) {
        octx.save();
        octx.globalAlpha = A().opacity;
        octx.drawImage(floating.image, floating.x, floating.y);
        octx.restore();
      }
      if (preview) preview(octx);
      const dashed = (r: Rect): void => {
        octx.save();
        octx.lineWidth = 1 / zoom;
        octx.setLineDash([5 / zoom, 4 / zoom]);
        octx.strokeStyle = '#000';
        octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        octx.strokeStyle = '#fff';
        octx.lineDashOffset = 5 / zoom;
        octx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        octx.restore();
      };
      if (selection) dashed(floating ? { ...selection, x: floating.x, y: floating.y } : selection);
      const shape = picked !== undefined ? A().shapes?.[picked] : undefined;
      if (shape) dashed(bounds(shape, measure));
    }
    const measure = (text: string, px: number): number => {
      octx.save();
      octx.font = `${px}px sans-serif`;
      const w = octx.measureText(text).width;
      octx.restore();
      return w;
    };

    // --- painting ---------------------------------------------------------------
    const point = (e: PointerEvent): Pt => {
      const r = overlay.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height];
    };
    const shapeFrom = (kind: Tool, a: Pt, b: Pt, square: boolean): VectorShape => {
      let [w, hh] = [b[0] - a[0], b[1] - a[1]];
      if (kind === 'line') {
        const end = square ? snap45(a, b) : b;
        return { kind: 'line', x1: a[0], y1: a[1], x2: end[0], y2: end[1], color: color(), width: lineWidth(), opacity: alpha() };
      }
      if (square) {
        w = Math.max(Math.abs(w), Math.abs(hh)) * Math.sign(w || 1);
        hh = Math.abs(w) * Math.sign(hh || 1);
      }
      return { kind: kind === 'rect' ? 'rect' : 'ellipse', x: a[0], y: a[1], w, h: hh, color: color(), width: lineWidth(), opacity: alpha(), filled: filled.checked };
    };
    const gradient = (c: CanvasRenderingContext2D, a: Pt, b: Pt): void => {
      const kind = gradientKind.value;
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const g =
        kind === 'radial'
          ? c.createRadialGradient(a[0], a[1], 0, a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]) || 1)
          : kind === 'linear'
            ? c.createLinearGradient(a[0], a[1], b[0], b[1])
            : c.createConicGradient(angle, a[0], a[1]);
      if (kind === 'hues') for (let i = 0; i <= 12; i++) g.addColorStop(i / 12, `hsl(${i * 30} 100% 50%)`);
      else {
        g.addColorStop(0, color());
        g.addColorStop(1, color2Input.value);
      }
      c.save();
      c.globalAlpha = alpha();
      c.fillStyle = g;
      // Within the selection, or the whole layer.
      const r = selection ?? { x: 0, y: 0, w: width, h: height };
      c.fillRect(r.x, r.y, r.w, r.h);
      c.restore();
    };
    /** A freehand stroke: drawn on a sheet, put down with its opacity when done (no darker overlaps). */
    let sheet: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | undefined;
    let drag: { from: Pt; last: Pt; mode: 'paint' | 'shape' | 'gradient' | 'select' | 'move' | 'moveShape'; offset?: Pt; original?: VectorShape } | undefined;

    const stamp = (from: Pt, to: Pt): void => {
      if (!sheet) return;
      const c = sheet.ctx;
      if (tool === 'pencil') {
        // Hard pixels: no smoothing.
        c.fillStyle = color();
        const s = Math.max(1, Math.round(lineWidth() / 3));
        for (const [x, y] of along(from, to, 0.5)) c.fillRect(Math.floor(x - s / 2 + 0.5), Math.floor(y - s / 2 + 0.5), s, s);
        return;
      }
      c.lineWidth = lineWidth();
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = tool === 'eraser' ? '#000' : color();
      c.beginPath();
      c.moveTo(...from);
      c.lineTo(...to);
      c.stroke();
    };
    const showSheet = (): void => {
      if (!sheet) return;
      drawOverlay((c) => {
        c.globalAlpha = tool === 'eraser' ? 0.5 : alpha() * A().opacity;
        c.drawImage(sheet!.canvas, 0, 0);
        c.globalAlpha = 1;
      });
    };
    /** The colour of the picture as shown (all visible layers). */
    const shownColorAt = (x: number, y: number): string => {
      const c = newCanvas(1, 1);
      const cx = c.getContext('2d')!;
      for (const l of layers) {
        if (!l.visible) continue;
        cx.globalAlpha = l.opacity;
        cx.drawImage(l.canvas, x, y, 1, 1, 0, 0, 1, 1);
      }
      return rgbaToHex(pixelAt(cx.getImageData(0, 0, 1, 1).data, 1, 0, 0));
    };

    overlay.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      overlay.focus();
      overlay.setPointerCapture?.(e.pointerId);
      const p = point(e);
      const l = A();
      if (tool === 'picker') {
        const [x, y] = [Math.floor(p[0]), Math.floor(p[1])];
        if (x >= 0 && y >= 0 && x < width && y < height) colorInput.value = shownColorAt(x, y);
        return;
      }
      if (!l.visible) return say(t('paint.hiddenLayer'));
      if (l.shapes && PIXEL_TOOLS.includes(tool)) return say(t('paint.vectorNoPixels'));
      if (tool === 'fill') {
        commitFloat();
        snapshot();
        const img = l.ctx.getImageData(0, 0, width, height);
        floodFill(img.data, width, height, p[0], p[1], hexToRgba(color(), alpha()));
        l.ctx.putImageData(img, 0, 0);
        touch(l);
        return;
      }
      if (tool === 'text') {
        const text = window.prompt(t('draw.textPrompt'))?.trim();
        if (!text) return;
        commitFloat();
        snapshot();
        const px = Math.max(10, lineWidth() * 4);
        if (l.shapes) {
          l.shapes.push({ kind: 'text', x: p[0], y: p[1], text, size: px, color: color(), opacity: alpha() });
          return renderVector(l);
        }
        l.ctx.globalAlpha = alpha();
        l.ctx.fillStyle = color();
        l.ctx.font = `${px}px sans-serif`;
        l.ctx.textBaseline = 'top';
        text.split('\n').forEach((line, i) => l.ctx.fillText(line, p[0], p[1] + i * px * 1.2));
        l.ctx.globalAlpha = 1;
        touch(l);
        return;
      }
      if (tool === 'select' && l.shapes) {
        // DRAW-014: a shape picked, then moved.
        const i = shapeAt(l.shapes, p[0], p[1], measure);
        picked = i >= 0 ? i : undefined;
        drawOverlay();
        if (picked !== undefined) {
          snapshot();
          drag = { from: p, last: p, mode: 'moveShape', original: l.shapes[picked] };
          syncProps(l.shapes[picked]!);
        }
        return;
      }
      if (tool === 'select') {
        const r = floating ? { ...selection!, x: floating.x, y: floating.y } : selection;
        if (r && p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h) {
          lift();
          drag = { from: p, last: p, mode: 'move', offset: [p[0] - floating!.x, p[1] - floating!.y] };
          return;
        }
        commitFloat();
        selection = undefined;
        drag = { from: p, last: p, mode: 'select' };
        return;
      }
      commitFloat();
      if (tool === 'gradient') {
        drag = { from: p, last: p, mode: 'gradient' };
        return;
      }
      selection = undefined;
      if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
        drag = { from: p, last: p, mode: 'shape' };
        return;
      }
      const c = newCanvas(width, height);
      sheet = { canvas: c, ctx: c.getContext('2d')! };
      drag = { from: p, last: p, mode: 'paint' };
      stamp(p, [p[0] + 0.01, p[1]]);
      showSheet();
    });
    overlay.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const p = point(e);
      if (drag.mode === 'paint') {
        stamp(drag.last, p);
        drag.last = p;
        showSheet();
      } else if (drag.mode === 'shape') {
        drag.last = p;
        drawOverlay((c) => drawShapes(c, [shapeFrom(tool, drag!.from, p, e.shiftKey)]));
      } else if (drag.mode === 'gradient') {
        drag.last = p;
        drawOverlay((c) => {
          gradient(c, drag!.from, p);
          c.save();
          c.strokeStyle = '#000';
          c.setLineDash([4 / zoom, 4 / zoom]);
          c.lineWidth = 1 / zoom;
          c.beginPath();
          c.moveTo(...drag!.from);
          c.lineTo(...p);
          c.stroke();
          c.restore();
        });
      } else if (drag.mode === 'select') {
        selection = rectBetween(drag.from, p, width, height);
        drawOverlay();
        sync();
      } else if (drag.mode === 'move' && floating) {
        floating.x = Math.round(p[0] - drag.offset![0]);
        floating.y = Math.round(p[1] - drag.offset![1]);
        drawOverlay();
      } else if (drag.mode === 'moveShape' && picked !== undefined && A().shapes && drag.original) {
        A().shapes![picked] = moved(drag.original, p[0] - drag.from[0], p[1] - drag.from[1]);
        renderVector(A());
        drawOverlay();
      }
    });
    const release = (e: PointerEvent): void => {
      const dr = drag;
      drag = undefined;
      if (!dr) return;
      const l = A();
      if (dr.mode === 'paint' && sheet) {
        snapshot();
        l.ctx.save();
        l.ctx.globalAlpha = tool === 'eraser' ? 1 : alpha();
        if (tool === 'eraser' && !(opaque && active === 0)) l.ctx.globalCompositeOperation = 'destination-out';
        else if (tool === 'eraser') {
          // Erasing the background of a JPEG paints white.
          const sc = sheet.ctx;
          sc.globalCompositeOperation = 'source-in';
          sc.fillStyle = '#ffffff';
          sc.fillRect(0, 0, width, height);
        }
        l.ctx.drawImage(sheet.canvas, 0, 0);
        l.ctx.restore();
        touch(l);
        sheet = undefined;
        drawOverlay();
      } else if (dr.mode === 'shape') {
        if (Math.hypot(dr.last[0] - dr.from[0], dr.last[1] - dr.from[1]) >= 2) {
          snapshot();
          const s = shapeFrom(tool, dr.from, dr.last, e.shiftKey);
          if (l.shapes) {
            l.shapes.push(s);
            renderVector(l);
          } else {
            drawShapes(l.ctx, [s]);
            touch(l);
          }
        }
        drawOverlay();
      } else if (dr.mode === 'gradient') {
        if (Math.hypot(dr.last[0] - dr.from[0], dr.last[1] - dr.from[1]) >= 2) {
          snapshot();
          gradient(l.ctx, dr.from, dr.last);
          touch(l);
        }
        drawOverlay();
      } else if (dr.mode === 'select') {
        if (selection && (selection.w < 2 || selection.h < 2)) selection = undefined;
        drawOverlay();
        sync();
      } else if (dr.mode === 'move' && floating && selection) {
        selection = { ...selection, x: floating.x, y: floating.y };
        drawOverlay();
      } else if (dr.mode === 'moveShape' && Math.hypot(dr.last[0] - dr.from[0], dr.last[1] - dr.from[1]) < 1) {
        // A click without moving: no step to undo.
        undo.pop();
      }
    };
    overlay.addEventListener('pointerup', release);
    overlay.addEventListener('pointercancel', release);
    overlay.addEventListener('dblclick', (e) => {
      // DRAW-014: the text of a text shape changed.
      const l = A();
      if (!l.shapes) return;
      const p = point(e as unknown as PointerEvent);
      const i = shapeAt(l.shapes, p[0], p[1], measure);
      const s = l.shapes[i];
      if (s?.kind !== 'text') return;
      const text = window.prompt(t('draw.textPrompt'), s.text)?.trim();
      if (!text || text === s.text) return;
      snapshot();
      l.shapes[i] = { ...s, text };
      renderVector(l);
      drawOverlay();
    });

    /** DRAW-014: the colour, size and opacity of the picked shape follow the controls. */
    const syncProps = (s: VectorShape): void => {
      colorInput.value = s.color;
      opacityInput.value = String(Math.round(s.opacity * 100));
      opacityLabel.textContent = `${opacityInput.value} %`;
      if (s.kind !== 'text') {
        sizeInput.value = String(Math.round(s.width));
        sizeLabel.textContent = `${sizeInput.value} px`;
      }
      if (s.kind === 'rect' || s.kind === 'ellipse') filled.checked = s.filled;
    };
    const restyle = (): void => {
      const l = A();
      const s = picked !== undefined ? l.shapes?.[picked] : undefined;
      if (!s || !l.shapes) return;
      snapshot();
      const base = { ...s, color: color(), opacity: alpha() };
      l.shapes[picked!] =
        base.kind === 'text' ? base : base.kind === 'line' ? { ...base, width: lineWidth() } : { ...base, width: lineWidth(), filled: filled.checked };
      renderVector(l);
      drawOverlay();
    };
    for (const el of [colorInput, sizeInput, opacityInput, filled]) el.addEventListener('change', restyle);

    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z') return void (e.preventDefault(), e.shiftKey ? restore(redo, undo) : restore(undo, redo));
      if (mod && k === 'y') return void (e.preventDefault(), restore(redo, undo));
      if (mod && k === 'c') return void (e.preventDefault(), copy());
      if (mod && k === 'x') return void (e.preventDefault(), copy(), deleteSelection());
      if (mod && k === 'v') return void (e.preventDefault(), paste());
      if (mod && k === 'a') {
        e.preventDefault();
        commitFloat();
        setTool('select');
        selection = { x: 0, y: 0, w: width, h: height };
        drawOverlay();
        return sync();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') return void (e.preventDefault(), deleteSelection());
      if (e.key === 'Escape' && (selection || floating || picked !== undefined)) {
        e.preventDefault();
        e.stopPropagation();
        commitFloat();
        selection = undefined;
        picked = undefined;
        drawOverlay();
        return sync();
      }
      // The selection, or the picked shape, moved with the arrows (Shift: ten pixels).
      const step = e.shiftKey ? 10 : 1;
      const moves: Record<string, Pt> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = moves[e.key];
      if (!move) return;
      const l = A();
      if (l.shapes && picked !== undefined) {
        e.preventDefault();
        snapshot();
        l.shapes[picked] = moved(l.shapes[picked]!, move[0], move[1]);
        renderVector(l);
        return drawOverlay();
      }
      if (selection && !l.shapes) {
        e.preventDefault();
        lift();
        floating!.x += move[0];
        floating!.y += move[1];
        selection = { ...selection, x: floating!.x, y: floating!.y };
        drawOverlay();
      }
    };
    overlay.addEventListener('keydown', onKey);

    // DRAW-019: the wheel zooms where the pointer is; the middle button, or two fingers, pan; two fingers pinch.
    const scroller = h('div', { class: 'paint-scroll' }, stack);
    const zoomPan = {
      content: (): Element => overlay,
      zoom: (): number => zoom,
      setZoom: (z: number): void => {
        zoom = Math.min(8, Math.max(0.1, z));
        sync();
      },
      cancel: (): void => {
        const dr = drag;
        drag = undefined;
        if (!dr) return;
        // The stroke begun is dropped; a shape being moved goes back.
        sheet = undefined;
        if (dr.mode === 'moveShape' && dr.original && picked !== undefined && A().shapes) {
          A().shapes![picked] = dr.original;
          renderVector(A());
          undo.pop();
        }
        drawOverlay();
      },
    };
    const setZoom = (z: number): void => zoomAt(scroller, zoomPan, z);
    attachZoomPan(scroller, zoomPan);

    // --- saving ------------------------------------------------------------------------
    /** All the visible layers, as shown; a JPEG on white. */
    const flatten = (w = width, hh = height): HTMLCanvasElement => {
      const c = newCanvas(w, hh);
      const cx = c.getContext('2d')!;
      if (opaque) {
        cx.fillStyle = '#ffffff';
        cx.fillRect(0, 0, w, hh);
      }
      for (const l of layers) {
        if (!l.visible) continue;
        cx.globalAlpha = l.opacity;
        cx.drawImage(l.canvas, 0, 0, w, hh);
      }
      return c;
    };
    /** Whether the layers would be lost in a flat picture. */
    const layered = (): boolean => layers.length > 1 || layers.some((l) => l.shapes || l.opacity < 1 || !l.visible);
    const dialog = h('dialog', { class: 'dialog paint-dialog', 'aria-labelledby': 'paint-title' });
    const finish = (value: PaintedPicture | null): void => {
      clearTimeout(sayTimer);
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const done = async (): Promise<void> => {
      commitFloat();
      // A new picture is kept even blank; an edited one only when changed.
      if (!changed && source) return finish(null);
      if (opts.layered && (layered() || mediaType === ORA_TYPE)) {
        const scale = Math.min(1, 256 / Math.max(width, height));
        const oraLayers: OraLayer[] = await Promise.all(
          layers.map(async (l) => ({ name: l.name, png: await toBlob(l.canvas, 'image/png'), x: 0, y: 0, opacity: l.opacity, visible: l.visible, ...(l.shapes ? { shapes: l.shapes } : {}) })),
        );
        const merged = await toBlob(flatten(), 'image/png');
        const thumb = await toBlob(flatten(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))), 'image/png');
        return finish({ bytes: writeOra({ width, height, layers: oraLayers }, merged, thumb), mediaType: ORA_TYPE, width, height });
      }
      const type = mediaType === ORA_TYPE ? 'image/png' : mediaType;
      if (layered() && !window.confirm(t('paint.flattenConfirm'))) return;
      const bytes = await toBlob(flatten(), type);
      if (!bytes.length) return finish(null);
      finish({ bytes, mediaType: type, width, height });
    };

    // --- the window -------------------------------------------------------------------
    const group = (label: string, ...kids: HTMLElement[]): HTMLElement => h('span', { class: 'draw-group', role: 'group', 'aria-label': label }, ...kids);
    const layersPanel = h(
      'aside',
      { class: 'paint-layers-panel', 'aria-label': t('paint.layers') },
      h('h3', {}, t('paint.layers')),
      layerList,
      h('label', { class: 'paint-layer-opacity' }, `${t('paint.layerOpacity')} `, layerOpacity, layerOpacityLabel),
      h('div', { class: 'paint-layer-buttons' }, ...Object.values(layerButtons)),
    );
    // DRAW-022: the layers float over the picture, shown on demand.
    const layersToggle = button(
      t('paint.layers'),
      () => {
        layersPanel.hidden = !layersPanel.hidden;
        layersToggle.setAttribute('aria-pressed', String(!layersPanel.hidden));
      },
      { text: '☰', title: t('paint.layers') },
    );
    layersToggle.setAttribute('aria-pressed', 'true');
    const toolbarEl = h(
      'div',
      { class: 'draw-toolbar', role: 'toolbar', 'aria-label': t('paint.tools') },
      group(t('paint.tools'), ...toolButtons),
      group(t('common.undo'), undoBtn, redoBtn),
      group(
        t('paint.selection'),
        button(t('paint.copy'), copy, { text: '⧉', title: `${t('paint.copy')} (Ctrl+C)` }),
        button(t('paint.paste'), paste, { text: '📋', title: `${t('paint.paste')} (Ctrl+V)` }),
        button(t('paint.deleteSelection'), deleteSelection, { text: '🗑', title: `${t('paint.deleteSelection')} (Del)` }),
      ),
      group(
        t('paint.picture'),
        button(t('paint.crop'), crop, { text: '✂', title: t('paint.cropTitle') }),
        button(t('paint.rotateLeft'), () => rotate(-90), { text: '⟲', title: t('paint.rotateLeft') }),
        button(t('paint.rotateRight'), () => rotate(90), { text: '⟳', title: t('paint.rotateRight') }),
        button(t('paint.rotateAngle'), rotateBy, { text: '∠', title: t('paint.rotateAngle') }),
        button(t('paint.flipH'), () => flip(true), { text: '⇋', title: t('paint.flipH') }),
        button(t('paint.flipV'), () => flip(false), { text: '⇅', title: t('paint.flipV') }),
        button(t('paint.backgroundSet'), () => void setBackground(), { text: '🖼', title: t('paint.backgroundSetTitle') }),
        button(t('paint.grid'), drawGrid, { text: '▦', title: t('paint.gridTitle') }),
      ),
      group(t('draw.zoomIn'), button(t('draw.zoomOut'), () => setZoom(zoom / 1.25), { text: '−', title: t('draw.zoomOut') }), zoomLabel, button(t('draw.zoomIn'), () => setZoom(zoom * 1.25), { text: '+', title: t('draw.zoomIn') })),
      group(t('paint.layers'), layersToggle),
    );
    const propsEl = h(
      'div',
      { class: 'draw-props', role: 'group', 'aria-label': t('draw.props') },
      h('label', {}, `${t('paint.color')} `, colorInput),
      h('label', {}, `${t('paint.color2')} `, color2Input),
      h('label', {}, `${t('paint.size')} `, sizeInput, sizeLabel),
      h('label', {}, `${t('paint.opacity')} `, opacityInput, opacityLabel),
      h('label', {}, filled, ` ${t('paint.filled')}`),
      h('label', {}, `${t('paint.gradientKind')} `, gradientKind),
      h('label', {}, `${t('draw.widthPx')} `, wInput),
      h('label', {}, `${t('draw.heightPx')} `, hInput),
    );
    // DRAW-022: the picture has the whole window, the tools over it.
    immersive({
      dialog,
      title: h('h2', { id: 'paint-title' }, t('paint.title')),
      actions: h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), button(t('draw.done'), () => void done(), { className: 'primary' })),
      rows: [toolbarEl, propsEl],
      body: h('div', { class: 'paint-main' }, scroller, layersPanel, status),
      scroller,
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!changed || window.confirm(t('paint.discard'))) finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    relayout();
    setTool('brush');
    overlay.focus();
  });
}

/** The end of a line held to a multiple of 45°. */
function snap45(a: Pt, b: Pt): Pt {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const angle = Math.round(Math.atan2(b[1] - a[1], b[0] - a[0]) / (Math.PI / 4)) * (Math.PI / 4);
  return [a[0] + len * Math.cos(angle), a[1] + len * Math.sin(angle)];
}

export type Fit = 'stretch' | 'contain' | 'cover' | 'center';

/** Where a picture of w × h goes in a canvas of cw × ch. */
export function fitRect(w: number, hh: number, cw: number, ch: number, fit: Fit): Rect {
  if (fit === 'stretch') return { x: 0, y: 0, w: cw, h: ch };
  const s = fit === 'center' ? 1 : fit === 'contain' ? Math.min(cw / w, ch / hh) : Math.max(cw / w, ch / hh);
  return { x: (cw - w * s) / 2, y: (ch - hh * s) / 2, w: w * s, h: hh * s };
}

const pickImage = async (): Promise<File | null> => {
  const { pickFile } = await import('../storage/file-io');
  return pickFile('image/*,.png,.jpg,.jpeg,.webp,.gif,.bmp,.svg,.avif');
};

/** DRAW-015: the background chosen: a colour, transparent, or a picture and how it fits. */
function chooseBackground(host: HTMLElement, current: string): Promise<{ mode: 'color' | 'transparent' | 'image'; color: string; fit: Fit } | null> {
  return new Promise((resolve) => {
    const mode = h(
      'select',
      { 'aria-label': t('paint.backgroundKind') },
      h('option', { value: 'color' }, t('paint.backgroundColor')),
      h('option', { value: 'transparent' }, t('paint.backgroundTransparent')),
      h('option', { value: 'image' }, t('paint.backgroundImage')),
    );
    const colorInput = h('input', { type: 'color', value: current, 'aria-label': t('paint.color') });
    const fit = h('select', { 'aria-label': t('paint.fit') }, ...(['cover', 'contain', 'stretch', 'center'] as Fit[]).map((f) => h('option', { value: f }, t(`paint.fit.${f}` as 'paint.fit.cover'))));
    const fitRow = h('label', { class: 'field' }, t('paint.fit'), fit);
    const colorRow = h('label', { class: 'field' }, t('paint.color'), colorInput);
    const show = (): void => {
      fitRow.hidden = mode.value !== 'image';
      colorRow.hidden = mode.value === 'transparent';
    };
    mode.addEventListener('change', show);
    show();
    const dialog = h('dialog', { class: 'dialog paint-background-dialog', 'aria-label': t('paint.backgroundSet') });
    const finish = (v: { mode: 'color' | 'transparent' | 'image'; color: string; fit: Fit } | null): void => {
      dialog.close();
      dialog.remove();
      resolve(v);
    };
    dialog.append(
      h('h2', {}, t('paint.backgroundSet')),
      h('p', { class: 'hint' }, t('paint.backgroundHint')),
      h('label', { class: 'field' }, t('paint.backgroundKind'), mode),
      colorRow,
      fitRow,
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(null)),
        button(t('common.ok'), () => finish({ mode: mode.value as 'color', color: colorInput.value, fit: fit.value as Fit }), { className: 'primary' }),
      ),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}
