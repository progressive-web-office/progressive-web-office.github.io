import { beforeEach, describe, expect, it } from 'vitest';
import { loadReading, rememberReading, saveReading } from '../src/review/settings';

describe('SET-002 reading and review settings', () => {
  beforeEach(() => localStorage.clear());

  it('has defaults', () => {
    expect(loadReading()).toEqual({ perRow: 1, zoom: 1, flow: 'scroll', rememberLast: true, review: false });
  });

  it('keeps the chosen defaults', () => {
    saveReading({ perRow: 2, zoom: 'page', flow: 'pages' });
    expect(loadReading()).toMatchObject({ perRow: 2, zoom: 'page', flow: 'pages', rememberLast: true });
  });

  it('remembers the last choice of the toolbar only when asked to', () => {
    rememberReading({ perRow: 3 });
    expect(loadReading().perRow).toBe(3);
    saveReading({ rememberLast: false, perRow: 2 });
    rememberReading({ perRow: 4, flow: 'pages' });
    expect(loadReading()).toMatchObject({ perRow: 2, flow: 'scroll' });
  });

  it('opens every file at the zoom of the settings, 100 % by default: the toolbar zooms the file open only', () => {
    rememberReading({ perRow: 2 });
    expect(loadReading()).toMatchObject({ perRow: 2, zoom: 1 });
    // @ts-expect-error the zoom of the toolbar is not remembered
    rememberReading({ zoom: 1.5 });
    expect(loadReading().zoom).toBe(1);
    saveReading({ zoom: 'width' });
    expect(loadReading().zoom).toBe('width');
    rememberReading({ flow: 'pages' });
    expect(loadReading()).toMatchObject({ zoom: 'width', flow: 'pages' });
    // Kept by the toolbar before (with or without the version of the settings): not a choice made in the settings.
    for (const zoomVersion of [undefined, 2]) {
      localStorage.setItem('pwo.reading', JSON.stringify({ perRow: 1, zoom: 'width', flow: 'scroll', zoomVersion }));
      expect(loadReading().zoom).toBe(1);
    }
  });

  it('ignores invalid values and reads the former PDF view', () => {
    localStorage.setItem('pwo.reading', JSON.stringify({ perRow: 5, zoom: 'huge', flow: 'x', review: 'yes' }));
    expect(loadReading()).toMatchObject({ perRow: 1, zoom: 1, flow: 'scroll', review: false });
    // The former separate settings turn the review mode on.
    localStorage.setItem('pwo.reading', JSON.stringify({ docReview: true }));
    expect(loadReading().review).toBe(true);
    localStorage.clear();
    localStorage.setItem('pwo.pdf.view', JSON.stringify({ zoom: 'page', columns: 2, flow: 'pages' }));
    expect(loadReading()).toMatchObject({ perRow: 2, zoom: 1, flow: 'pages' });
  });
});
