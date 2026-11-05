/** DRAW-003, DRAW-007: a drawing turned into a PNG picture. */
import type { Drawing } from './model';
import { toSvg } from './svg';

/** A transparent picture with `background` null (PDF-021: over a page). */
export async function svgToPng(svg: string, width: number, height: number, scale = 2, background: string | null = '#ffffff'): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('The picture could not be drawn'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext('2d')!;
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
    if (!blob) throw new Error('The picture could not be drawn');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function exportPng(d: Drawing, scale = 2, background: string | null = '#ffffff'): Promise<Blob> {
  return svgToPng(toSvg(d), d.width, d.height, scale, background);
}
