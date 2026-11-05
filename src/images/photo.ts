/**
 * IMG-001: what is done to a picture — turned, mirrored, lighter or with more
 * contrast, regions blurred (a face, a name), cropped, resized — and the
 * pixels it gives. Rectangles are in the pixels of the turned picture, before
 * the crop.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** IMG-004: drawn on the picture: an arrow, a highlighted region, a text. */
export type PhotoMark =
  | { kind: 'arrow'; from: [number, number]; to: [number, number] }
  | { kind: 'highlight'; rect: Rect }
  | { kind: 'text'; at: [number, number]; text: string }
  /** MARK-001: a signature, upright, of the size chosen. */
  | { kind: 'signature'; rect: Rect; image: CanvasImageSource };

export interface PhotoEdit {
  /** Quarter turns, clockwise. */
  rotate: 0 | 90 | 180 | 270;
  flip: boolean;
  /** Percent, 100 = unchanged. */
  brightness: number;
  contrast: number;
  blurs: Rect[];
  marks: PhotoMark[];
  crop?: Rect;
  /** Share of the cropped size kept, 1 = unchanged. */
  scale: number;
}

export const NO_EDIT: PhotoEdit = { rotate: 0, flip: false, brightness: 100, contrast: 100, blurs: [], marks: [], scale: 1 };

export const isUnchanged = (e: PhotoEdit): boolean => e.rotate === 0 && !e.flip && e.brightness === 100 && e.contrast === 100 && !e.blurs.length && !e.marks.length && !e.crop && e.scale === 1;

/** The size of the turned picture. */
export function turnedSize(w: number, h: number, rotate: PhotoEdit['rotate']): { w: number; h: number } {
  return rotate === 90 || rotate === 270 ? { w: h, h: w } : { w, h };
}

/** The rectangle between two corners, kept inside `w` × `h`, in whole pixels. */
export function rectBetween(a: [number, number], b: [number, number], w: number, h: number): Rect {
  const x1 = Math.max(0, Math.min(a[0], b[0]));
  const y1 = Math.max(0, Math.min(a[1], b[1]));
  const x2 = Math.min(w, Math.max(a[0], b[0]));
  const y2 = Math.min(h, Math.max(a[1], b[1]));
  // Outwards: what was dragged over is kept.
  const [left, top, right, bottom] = [Math.floor(x1), Math.floor(y1), Math.ceil(x2), Math.ceil(y2)];
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
}

/** The size of the result. */
export function outputSize(w: number, h: number, e: PhotoEdit): { w: number; h: number } {
  const turned = turnedSize(w, h, e.rotate);
  const base = e.crop && e.crop.w > 0 && e.crop.h > 0 ? e.crop : turned;
  return { w: Math.max(1, Math.round(base.w * e.scale)), h: Math.max(1, Math.round(base.h * e.scale)) };
}

/** A rectangle of the turned picture after a new quarter turn (crops and blurs follow the picture). */
export function turnRect(r: Rect, w: number, h: number, by: 90 | 270): Rect {
  // (w, h): the size before this turn.
  return by === 90 ? { x: h - r.y - r.h, y: r.x, w: r.h, h: r.w } : { x: r.y, y: w - r.x - r.w, w: r.h, h: r.w };
}

export function flipRect(r: Rect, w: number): Rect {
  return { ...r, x: w - r.x - r.w };
}

/** A point of the turned picture after a new quarter turn; (w, h): the size before it. */
export function turnPoint([x, y]: [number, number], w: number, h: number, by: 90 | 270): [number, number] {
  return by === 90 ? [h - y, x] : [y, w - x];
}

export function turnMark(m: PhotoMark, w: number, h: number, by: 90 | 270): PhotoMark {
  if (m.kind === 'arrow') return { ...m, from: turnPoint(m.from, w, h, by), to: turnPoint(m.to, w, h, by) };
  if (m.kind === 'text') return { ...m, at: turnPoint(m.at, w, h, by) };
  if (m.kind === 'signature') {
    // Its centre follows the picture; it stays upright and of its size.
    const [cx, cy] = turnPoint([m.rect.x + m.rect.w / 2, m.rect.y + m.rect.h / 2], w, h, by);
    return { ...m, rect: { ...m.rect, x: cx - m.rect.w / 2, y: cy - m.rect.h / 2 } };
  }
  return { ...m, rect: turnRect(m.rect, w, h, by) };
}

export function flipMark(m: PhotoMark, w: number): PhotoMark {
  if (m.kind === 'arrow') return { ...m, from: [w - m.from[0], m.from[1]], to: [w - m.to[0], m.to[1]] };
  if (m.kind === 'text') return { ...m, at: [w - m.at[0], m.at[1]] };
  return { ...m, rect: flipRect(m.rect, w) };
}

/** Marks are drawn red (arrows, text) and yellow (highlights), thick enough for the picture's size. */
export function drawMarks(ctx: CanvasRenderingContext2D, marks: PhotoMark[], w: number, h: number): void {
  const line = Math.max(3, Math.round(Math.min(w, h) / 120));
  for (const m of marks) {
    ctx.save();
    if (m.kind === 'highlight') {
      ctx.fillStyle = 'rgba(255, 221, 0, 0.4)';
      ctx.fillRect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
      ctx.strokeStyle = 'rgba(230, 180, 0, 0.9)';
      ctx.lineWidth = Math.max(1, line / 2);
      ctx.strokeRect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
    } else if (m.kind === 'signature') {
      ctx.drawImage(m.image, m.rect.x, m.rect.y, m.rect.w, m.rect.h);
    } else if (m.kind === 'arrow') {
      const [x1, y1] = m.from;
      const [x2, y2] = m.to;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const head = line * 4;
      ctx.strokeStyle = ctx.fillStyle = '#e11d48';
      ctx.lineWidth = line;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2 - Math.cos(angle) * head * 0.6, y2 - Math.sin(angle) * head * 0.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - head * Math.cos(angle - 0.45), y2 - head * Math.sin(angle - 0.45));
      ctx.lineTo(x2 - head * Math.cos(angle + 0.45), y2 - head * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
    } else {
      const size = Math.max(16, Math.round(Math.min(w, h) / 18));
      ctx.font = `bold ${size}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      // White outline: readable on any background.
      ctx.lineWidth = Math.max(3, size / 6);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.lineJoin = 'round';
      ctx.strokeText(m.text, m.at[0], m.at[1]);
      ctx.fillStyle = '#e11d48';
      ctx.fillText(m.text, m.at[0], m.at[1]);
    }
    ctx.restore();
  }
}

/** Draw the turned, mirrored, filtered and blurred picture, whole (before the crop). */
export function drawTurned(source: CanvasImageSource, sw: number, sh: number, e: PhotoEdit, doc: Document = document): HTMLCanvasElement {
  const { w, h } = turnedSize(sw, sh, e.rotate);
  const canvas = doc.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.filter = e.brightness !== 100 || e.contrast !== 100 ? `brightness(${e.brightness}%) contrast(${e.contrast}%)` : 'none';
  ctx.translate(w / 2, h / 2);
  ctx.rotate((e.rotate * Math.PI) / 180);
  if (e.flip) ctx.scale(e.rotate === 90 || e.rotate === 270 ? 1 : -1, e.rotate === 90 || e.rotate === 270 ? -1 : 1);
  ctx.drawImage(source, -sw / 2, -sh / 2, sw, sh);
  ctx.restore();
  // Blurred regions: drawn again from the picture itself, blurred, clipped to the region.
  for (const r of e.blurs) {
    if (r.w < 1 || r.h < 1) continue;
    const radius = Math.max(6, Math.round(Math.min(r.w, r.h) / 6));
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.filter = `blur(${radius}px)`;
    // Twice, so that a small text cannot be read through.
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(canvas, 0, 0);
    ctx.restore();
  }
  drawMarks(ctx, e.marks, w, h);
  return canvas;
}

/** The finished picture: turned, cropped, resized. */
export function renderPhoto(source: CanvasImageSource, sw: number, sh: number, e: PhotoEdit, doc: Document = document): HTMLCanvasElement {
  const turned = drawTurned(source, sw, sh, e, doc);
  const crop = e.crop && e.crop.w > 0 && e.crop.h > 0 ? e.crop : { x: 0, y: 0, w: turned.width, h: turned.height };
  const { w, h } = outputSize(sw, sh, e);
  const out = doc.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(turned, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  return out;
}
