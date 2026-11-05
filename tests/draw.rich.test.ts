import { describe, expect, it } from 'vitest';
import { lineSizes, normalizeRuns, runLines, runsFromHtml, runsOf, runsToHtml, styleRuns } from '../src/draw/rich';
import { bbox } from '../src/draw/model';
import { fromSvg, shapeSvg, toSvg } from '../src/draw/svg';
import type { TextShape } from '../src/draw/model';

const shape = (): TextShape => ({
  id: 't',
  kind: 'text',
  x: 10,
  y: 30,
  size: 12,
  text: 'Big and bold\nsmall',
  runs: [{ text: 'Big', size: 24 }, { text: ' and ' }, { text: 'bold', bold: true }, { text: '\nsmall', size: 8 }],
});

describe('DRAW-020 rich text', () => {
  it('cuts runs into lines, each as tall as its largest part', () => {
    expect(runLines(shape().runs!).map((l) => l.map((r) => r.text))).toEqual([['Big', ' and ', 'bold'], ['small']]);
    expect(lineSizes(shape())).toEqual([24, 8]);
    const [, top, , bottom] = bbox(shape())!;
    expect(top).toBe(6);
    expect(bottom).toBeCloseTo(30 + 24 * 0.25 + 8 * 0.95 + 8 * 0.3);
  });

  it('ignores runs that no longer match the text', () => {
    expect(runsOf({ text: 'changed', runs: [{ text: 'old', bold: true }] })).toEqual([{ text: 'changed' }]);
  });

  it('merges neighbours of the same look, and forgets runs with no look', () => {
    expect(normalizeRuns([{ text: 'a', bold: true }, { text: 'b', bold: true }, { text: '' }, { text: 'c' }])).toEqual([{ text: 'ab', bold: true }, { text: 'c' }]);
    expect(normalizeRuns([{ text: 'a' }, { text: 'b', bold: false }])).toBeUndefined();
    expect(styleRuns([{ text: 'a', bold: true }, { text: 'b' }], { bold: false, italic: true })).toEqual([{ text: 'a', italic: true }, { text: 'b', italic: true }]);
  });

  it('writes one tspan a line, a tspan for each part with a look', () => {
    const svg = shapeSvg(shape());
    expect(svg).toContain('<tspan font-size="24">Big</tspan> and <tspan font-weight="bold">bold</tspan>');
    expect(svg).toContain('<tspan x="10" dy="13.6"><tspan font-size="8">small</tspan></tspan>');
    // Kept through the SVG file and back.
    const back = fromSvg(toSvg({ width: 100, height: 100, grid: 0, shapes: [shape()] }));
    expect((back.shapes[0] as TextShape).runs).toEqual(shape().runs);
  });

  it('reads back what was typed and formatted in the editor', () => {
    const el = document.createElement('div');
    el.innerHTML = runsToHtml(shape().runs!, 2);
    expect(el.innerHTML).toContain('font-size:48px');
    // What the browser makes of Ctrl+I, and a line made by Enter.
    el.insertAdjacentHTML('beforeend', '<br><i>more</i>');
    const runs = runsFromHtml(el, 2, { size: 12, fill: '#000000' });
    expect(normalizeRuns(runs)).toEqual([
      { text: 'Big', size: 24 },
      { text: ' and ' },
      { text: 'bold', bold: true },
      { text: '\n' },
      { text: 'small', size: 8 },
      { text: '\n' },
      { text: 'more', italic: true },
    ]);
  });
});
