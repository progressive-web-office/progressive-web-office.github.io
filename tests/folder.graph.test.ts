import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { notesGraphData } from '../src/folder/graph';

describe('FOLDER-034 graph of the notes', () => {
  it('gives one node per note, named by its file name, and each link once', () => {
    const data = notesGraphData(
      ['a.md', 'b.md', 'sub/c "x".md'],
      [
        { from: 'a.md', to: 'b.md' },
        { from: 'b.md', to: 'a.md' },
        { from: 'a.md', to: 'sub/c "x".md' },
      ],
      new Map(),
    );
    expect(data.nodes).toEqual([
      { id: 'a.md', label: 'a' },
      { id: 'b.md', label: 'b' },
      { id: 'sub/c "x".md', label: 'c "x"' },
    ]);
    expect(data.edges).toEqual([
      { from: 'a.md', to: 'b.md', kind: 'link', count: 1 },
      { from: 'b.md', to: 'a.md', kind: 'link', count: 1 },
      { from: 'a.md', to: 'sub/c "x".md', kind: 'link', count: 1 },
    ]);
  });

  it('keeps the links to notes that do not exist yet apart, from the notes shown only', () => {
    const data = notesGraphData(
      ['a.md', 'b.md'],
      [{ from: 'a.md', to: 'gone.md' }],
      new Map([
        ['Ideas', [{ from: 'a.md' }, { from: 'b.md' }, { from: 'a.md' }]],
        ['Later', [{ from: 'elsewhere.md' }]],
      ]),
    );
    // A link to a note left out of the graph is not drawn.
    expect(data.edges).toEqual([
      { from: 'a.md', to: 'Ideas', kind: 'unresolved', count: 2 },
      { from: 'b.md', to: 'Ideas', kind: 'unresolved', count: 1 },
    ]);
  });
});

describe('FOLDER-034 drawing engine', () => {
  it('ships the pinned build of the engine', () => {
    const wasm = readFileSync('node_modules/@semanticatlas/engine/engine.wasm');
    expect(createHash('sha256').update(wasm).digest('hex')).toBe('6f7ec3cca93ada0a60070341a06fbe735603eaacd52d679b28ecbe58c81b630e');
  });
});
