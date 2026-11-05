import { describe, expect, it } from 'vitest';
import { fitSize, HIGHLIGHT, highlightButton, pngDataUrl, signButton } from '../src/app/mark';
import { highlightShape } from '../src/draw/model';
import { shapeSvg } from '../src/draw/svg';
import { flipMark, turnMark, type PhotoMark } from '../src/images/photo';

// MARK-001..MARK-003: signing, highlighting and adding text wherever something is marked up.

describe('MARK-001 a signature placed as a picture', () => {
  it('keeps its proportions, no larger than the room given', () => {
    expect(fitSize(600, 200, 300, 300)).toEqual({ w: 300, h: 100 });
    expect(fitSize(600, 200, 1000, 50)).toEqual({ w: 150, h: 50 });
    // Never made larger than it was drawn.
    expect(fitSize(120, 40, 1000, 1000)).toEqual({ w: 120, h: 40 });
  });

  it('is written as a PNG data URL', () => {
    expect(pngDataUrl(new Uint8Array([137, 80, 78, 71]))).toBe('data:image/png;base64,iVBORw==');
  });

  it('follows the turns and mirroring of a photo, upright and of the same size', () => {
    const image = {} as CanvasImageSource;
    const sig: PhotoMark = { kind: 'signature', rect: { x: 10, y: 20, w: 60, h: 20 }, image };
    // A 200 × 100 picture turned clockwise: the centre (40, 30) goes to (100 - 30, 40).
    expect(turnMark(sig, 200, 100, 90)).toEqual({ kind: 'signature', rect: { x: 40, y: 30, w: 60, h: 20 }, image });
    expect(flipMark(sig, 200)).toEqual({ kind: 'signature', rect: { x: 130, y: 20, w: 60, h: 20 }, image });
  });
});

describe('MARK-002 the highlighter of the drawing', () => {
  it('draws a wide translucent stroke, yellow by default', () => {
    const s = highlightShape('h1', [[0, 0], [50, 0]]);
    expect(s).toMatchObject({ kind: 'free', stroke: HIGHLIGHT.color, opacity: HIGHLIGHT.opacity });
    expect(s.width).toBeGreaterThanOrEqual(12);
    expect(shapeSvg(s)).toContain(`opacity="${HIGHLIGHT.opacity}"`);
    expect(highlightShape('h2', [[0, 0], [5, 5]], '#00ff00', 20)).toMatchObject({ stroke: '#00ff00', width: 20 });
  });
});

describe('MARK-003 the same names everywhere', () => {
  it('names the signing and highlighting tools as the PDF viewer does', () => {
    const sign = signButton(() => undefined);
    expect(sign.getAttribute('aria-label')).toBe('Add signature');
    expect(sign.textContent).toBe('✍ Sign');
    const mark = highlightButton(() => undefined);
    expect(mark.getAttribute('aria-label')).toBe('Highlight');
    expect(mark.textContent).toBe('🖍');
  });
});
