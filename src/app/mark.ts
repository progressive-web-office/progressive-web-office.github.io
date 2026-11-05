/**
 * MARK-001..MARK-003: signing, highlighting and adding text, offered wherever
 * something is marked up, named as in the PDF viewer (PDF-011, PDF-018).
 */
import { button } from './dom';
import { t } from '../i18n';

/** MARK-002: the highlighter — yellow, translucent, what is under it readable. */
export const HIGHLIGHT = { color: '#ffeb3b', opacity: 0.4, width: 16 } as const;

/** MARK-003: ✍ Sign, as in the PDF viewer. */
export function signButton(onClick: () => void): HTMLButtonElement {
  return button(t('pdf.sign'), onClick, { text: t('pdf.signText'), title: t('mark.signTitle'), className: 'mark-sign' });
}

/** MARK-003: 🖍 Highlight, as in the PDF viewer. */
export function highlightButton(onClick: () => void, pressed?: boolean): HTMLButtonElement {
  return button(t('pdf.highlight'), onClick, { text: '🖍', title: t('mark.highlightTitle'), ...(pressed === undefined ? {} : { pressed }) });
}

/** The size of a picture fitted in a room, its proportions kept, never larger than it is. */
export function fitSize(w: number, h: number, maxW: number, maxH: number): { w: number; h: number } {
  const k = Math.min(1, maxW / w, maxH / h);
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

export function pngDataUrl(png: Uint8Array): string {
  let s = '';
  for (let i = 0; i < png.length; i += 0x8000) s += String.fromCharCode(...png.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
}

/** MARK-001: the signature drawn or imported on the pad of the PDF viewer, or null when cancelled. */
export async function askSignature(host: HTMLElement): Promise<{ png: Uint8Array; width: number; height: number } | null> {
  const { captureSignature } = await import('../pdf/signature-pad');
  return captureSignature(host);
}

/** The signature as a picture to draw on a canvas. */
export function signatureImage(png: Uint8Array): Promise<ImageBitmap> {
  return createImageBitmap(new Blob([png as BlobPart], { type: 'image/png' }));
}
