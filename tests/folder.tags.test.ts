import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { inlineTags, loadTagColours, noteTags, renameTag, setTagColour } from '../src/folder/tags';
import { NoteVault } from '../src/folder/vault';

describe('FOLDER-017 tags of notes', () => {
  it('reads tags from the front matter (tags, keywords) and #tags in the text', () => {
    const text = [
      '---',
      'title: Plan',
      'tags: [physics, Lab]',
      'keywords:',
      '  - optics',
      '---',
      '# Heading, not a tag',
      'A #todo and #course/semester-1, not#this, not a colour #fff3 nor `#code`.',
      '```',
      '#not-in-code',
      '```',
      'See https://example.org/#anchor.',
    ].join('\n');
    expect(noteTags(text)).toEqual(['physics', 'Lab', 'optics', 'todo', 'course/semester-1']);
    expect(noteTags('tags: not front matter #one')).toEqual(['one']);
    expect(noteTags('---\ntags: a, b\n---\nx')).toEqual(['a', 'b']);
  });

  it('renames a tag everywhere in a note, ignoring case', () => {
    const text = '---\ntags: [physics, lab]\n---\nA #Physics note, #physics/optics stays, #physicsX too.';
    const { text: out, count } = renameTag(text, 'physics', 'science');
    expect(count).toBe(2);
    expect(out).toBe('---\ntags: [science, lab]\n---\nA #science note, #physics/optics stays, #physicsX too.');
  });
});

describe('FOLDER-017/FOLDER-018 tags and links across the folder', () => {
  const vault = () =>
    new NoteVault(
      new MemoryProvider('m', 'M', {
        'a.md': '---\ntags: [physics]\n---\nSee [[b]] and [c](sub/c.md). #todo',
        'b.md': 'Back to [[a]]. #todo',
        'sub/c.md': 'Nothing.',
      }),
    );

  it('counts the notes of each tag', async () => {
    const tags = await vault().tags();
    expect([...tags].map(([t, n]) => [t, n])).toEqual([
      ['todo', ['a.md', 'b.md']],
      ['physics', ['a.md']],
    ]);
  });

  it('gives the links between the notes', async () => {
    expect(await vault().links()).toEqual([
      { from: 'a.md', to: 'b.md' },
      { from: 'a.md', to: 'sub/c.md' },
      { from: 'b.md', to: 'a.md' },
    ]);
  });

  it('renames a tag in every note of the folder', async () => {
    const v = vault();
    expect(await v.renameTag('todo', 'next')).toEqual(['a.md', 'b.md']);
    expect([...(await v.tags()).keys()]).toEqual(['next', 'physics']);
  });
});

describe('FOLDER-019 related notes', () => {
  it('ranks the notes sharing tags or links with a note', async () => {
    const v = new NoteVault(
      new MemoryProvider('m', 'M', {
        'a.md': '---\ntags: [physics, optics]\n---\nSee [[b]].',
        'b.md': 'Nothing here.',
        'c.md': '#physics #optics',
        'd.md': '#physics',
        'e.md': 'Unrelated #cooking',
      }),
    );
    const related = await v.related('a.md');
    expect(related).toEqual([
      { path: 'c.md', tags: ['physics', 'optics'], linked: false },
      { path: 'b.md', tags: [], linked: true },
      { path: 'd.md', tags: ['physics'], linked: false },
    ]);
  });
});

describe('FOLDER-023 tags shown in the text, with colours', () => {
  it('finds the #tags of a line with their place', () => {
    expect(inlineTags('Done #todo, see #physics/optics and #fff (#2024a)')).toEqual([
      { tag: 'todo', index: 5, length: 5 },
      { tag: 'physics/optics', index: 16, length: 15 },
      { tag: '2024a', index: 42, length: 6 },
    ]);
    expect(inlineTags('issue#12 and C#')).toEqual([]);
  });

  it('keeps the colours of the tags of each folder', () => {
    localStorage.clear();
    setTagColour('fsa:1', 'Todo', 'red');
    setTagColour('fsa:1', 'physics', 'blue');
    setTagColour('fsa:2', 'todo', 'green');
    expect(loadTagColours('fsa:1')).toEqual({ todo: 'red', physics: 'blue' });
    setTagColour('fsa:1', 'todo', undefined);
    expect(loadTagColours('fsa:1')).toEqual({ physics: 'blue' });
    expect(loadTagColours('fsa:2')).toEqual({ todo: 'green' });
    expect(loadTagColours('other')).toEqual({});
  });
});
