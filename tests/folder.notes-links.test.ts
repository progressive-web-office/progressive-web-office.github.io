import { describe, expect, it } from 'vitest';
import { embeddedBlocks, parseEmbed } from '../src/document/embeds';
import { readMarkdown, markdownBlocks } from '../src/document/markdown-reader';
import { completionQuery, blockItem, blockOfItem } from '../src/document/pm/complete';
import { renameMarkdownLinks } from '../src/folder/vault';
import { fillFolderTemplate } from '../src/folder/templates';
import { noteEntry } from '../src/folder/note-index';

describe('MD-020 the note index reads every task state', () => {
  it('reads `[ ]`, `[x]`, `[/]`, `[-]` in bullet and numbered lists, only `x` done', () => {
    const e = noteEntry('a.md', '- [ ] todo\n- [x] done\n- [/] half\n1. [-] gone\n- plain\n');
    expect(e.tasks.map((t) => [t[1], t[2]])).toEqual([['todo', false], ['done', true], ['half', false], ['gone', false]]);
  });
});

describe('MD-027 MD-028 embeds', () => {
  it('reads what an embed points to', () => {
    expect(parseEmbed('Note')).toEqual({ target: 'Note' });
    expect(parseEmbed('Note#Partie 2')).toEqual({ target: 'Note', heading: 'Partie 2' });
    expect(parseEmbed('Note#^abc')).toEqual({ target: 'Note', block: 'abc' });
    expect(parseEmbed('doc.pdf#page=3')).toEqual({ target: 'doc.pdf', page: 3 });
  });
  it('takes the whole note, the section under a heading, or one block', () => {
    const doc = readMarkdown('# A\n\nun\n\n## B\n\ndeux ^b2\n\n### C\n\ntrois\n\n## D\n\nquatre\n');
    const texts = (bs: ReturnType<typeof embeddedBlocks>): string[] => (bs ?? []).map((b) => (b.type === 'paragraph' ? b.runs.map((r) => ('text' in r ? r.text : '')).join('') : b.type));
    expect(texts(embeddedBlocks(doc.blocks, {}))).toHaveLength(8);
    expect(texts(embeddedBlocks(doc.blocks, { heading: 'b' }))).toEqual(['B', 'deux', 'C', 'trois']);
    expect(texts(embeddedBlocks(doc.blocks, { block: 'b2' }))).toEqual(['deux']);
    expect(embeddedBlocks(doc.blocks, { heading: 'Z' })).toBeUndefined();
  });
});

describe('FOLDER-028 completing headings and blocks', () => {
  it('asks for headings after `[[note#` and for blocks after `[[note#^`', () => {
    expect(completionQuery('Voir [[Cours#Intr')).toEqual({ kind: 'heading', note: 'Cours', query: 'Intr', length: 12 });
    expect(completionQuery('Voir [[Cours#^ab')).toEqual({ kind: 'block', note: 'Cours', query: 'ab', length: 11 });
    expect(completionQuery('Voir [[#Intr')).toEqual({ kind: 'heading', note: '', query: 'Intr', length: 7 });
    expect(completionQuery('Voir [[Cou')).toMatchObject({ kind: 'link', query: 'Cou' });
  });
  it('offers blocks with their identifier, and lists the headings and blocks of a note with their lines', () => {
    expect(blockOfItem(blockItem('Un paragraphe', 'x1y2'))).toBe('x1y2');
    expect(blockItem('a'.repeat(80), 'id').length).toBeLessThan(70);
    expect(markdownBlocks('# Titre\n\nUn paragraphe ^p1\nsur deux lignes\n\n- [ ] une tâche\n')).toEqual([
      { kind: 'heading', text: 'Titre', line: 0 },
      { kind: 'block', text: 'Un paragraphe ^p1 sur deux lignes', line: 3 },
      { kind: 'block', text: 'une tâche', line: 5 },
    ]);
    expect(markdownBlocks('Paragraphe ^p1\n')[0]).toEqual({ kind: 'block', text: 'Paragraphe', id: 'p1', line: 0 });
  });
});

describe('FOLDER-030 templates of the folder', () => {
  it('fills title, date, date with a format and time', () => {
    const date = new Date(2026, 10, 27, 9, 5);
    const out = fillFolderTemplate('---\ntitle: {{title}}\ncreated: {{date}}\n---\n# {{title}} — {{date:DD/MM/YYYY}} {{time}}\n', 'Compte rendu', date, 'fr');
    expect(out).toMatch(/^---\ntitle: Compte rendu\ncreated: 2026-11-27\n---\n# Compte rendu — 27\/11\/2026 \d\d:\d\d\n$/);
  });
});

describe('FOLDER-031 relative Markdown links follow a renamed note', () => {
  it('rewrites links to the note, encoded or not, keeping their heading', () => {
    const text = 'Voir [le cours](Cours/Intro.md), [encodé](Cours/Mon%20cours.md#Partie), <x> [autre](Autre.md) [web](https://e.org/Intro.md) et [ancre](<Cours/Intro.md>).';
    expect(renameMarkdownLinks(text, 'Index.md', 'Cours/Intro.md', 'Archives/Introduction.md')).toEqual({
      text: 'Voir [le cours](Archives/Introduction.md), [encodé](Cours/Mon%20cours.md#Partie), <x> [autre](Autre.md) [web](https://e.org/Intro.md) et [ancre](<Archives/Introduction.md>).',
      count: 2,
    });
    expect(renameMarkdownLinks('[x](Mon%20cours.md#P)', 'Cours/Index.md', 'Cours/Mon cours.md', 'Cours/Notes/Mon cours 2.md')).toEqual({ text: '[x](Notes/Mon%20cours%202.md#P)', count: 1 });
    expect(renameMarkdownLinks('[x](../Intro.md)', 'Sous/Note.md', 'Intro.md', 'Sous/Intro.md')).toEqual({ text: '[x](Intro.md)', count: 1 });
  });
});
