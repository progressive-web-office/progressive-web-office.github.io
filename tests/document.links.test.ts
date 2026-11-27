import { describe, expect, it } from 'vitest';
import { linkLabel } from '../src/document/pm/link-bubble';
import { previewRef } from '../src/document/note-preview';
import { loadLinkClick, saveLinkClick } from '../src/document/link-click';

describe('DOC-055 a click on a link', () => {
  it('shows the link by default, follows it when the setting says so', () => {
    localStorage.clear();
    expect(loadLinkClick()).toBe('show');
    saveLinkClick('follow');
    expect(loadLinkClick()).toBe('follow');
    saveLinkClick('show');
    expect(loadLinkClick()).toBe('show');
  });

  it('shows the note a wiki link points to, else the address', () => {
    expect(linkLabel('wiki:Cours%23%5Eb1')).toEqual({ note: true, text: 'Cours#^b1' });
    expect(linkLabel('wiki:Plan')).toEqual({ note: true, text: 'Plan' });
    expect(linkLabel('wiki:Cours#^b1')).toEqual({ note: true, text: 'Cours#^b1' });
    expect(linkLabel('wiki:!Plan')).toEqual({ note: true, text: 'Plan' });
    expect(linkLabel('https://e.org/a')).toEqual({ note: false, text: 'https://e.org/a' });
  });
});

describe('DOC-057 the note a link points to, for its preview', () => {
  it('previews wiki links and relative links to Markdown files only', () => {
    expect(previewRef('wiki:Plan#Goals')).toBe('Plan#Goals');
    expect(previewRef('notes/Plan%20B.md')).toBe('notes/Plan B.md');
    expect(previewRef('../Plan.md#part')).toBe('../Plan.md#part');
    expect(previewRef('https://e.org/a.md')).toBeUndefined();
    expect(previewRef('mailto:a@b.c')).toBeUndefined();
    expect(previewRef('#heading')).toBeUndefined();
    expect(previewRef('picture.png')).toBeUndefined();
  });
});
