import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { forExport } from '../src/document/note-export';
import { sanitizeHtml, safeHref } from '../src/document/sanitize-html';
import { codeLanguage } from '../src/document/pm/notes';
import type { Paragraph } from '../src/document/model';

/** Read, through the editor, written back. */
const roundTrip = (md: string): string => {
  const doc = readMarkdown(md);
  return writeMarkdown({ ...doc, blocks: pmToBlocks(blocksToPm(doc.blocks)) });
};
const paragraphs = (md: string): Paragraph[] => readMarkdown(md).blocks.filter((b): b is Paragraph => b.type === 'paragraph');

describe('MD-020 task lists', () => {
  it('reads every one-character state and keeps it apart from the text', () => {
    const ps = paragraphs('- [ ] todo\n- [x] done\n- [/] half\n- [-] gone\n- not a task\n1. [>] later\n');
    expect(ps.map((p) => p.task)).toEqual([' ', 'x', '/', '-', undefined, '>']);
    expect(ps[0]!.runs).toEqual([{ text: 'todo' }]);
  });
  it('writes the tasks back as written, also through the editor', () => {
    const md = '- [ ] todo\n- [x] done\n- [/] half\n  - [ ] nested\n';
    expect(writeMarkdown(readMarkdown(md))).toBe(md);
    expect(roundTrip(md)).toBe(md);
  });
  it('does not take brackets elsewhere for a task', () => {
    expect(paragraphs('[ ] not in a list\n')[0]!.task).toBeUndefined();
    expect(paragraphs('- a\n\n  [x] second paragraph\n')[1]?.task).toBeUndefined();
  });
  it('draws tasks as characters in other formats', () => {
    const doc = forExport(readMarkdown('- [ ] a\n- [x] b\n'));
    expect((doc.blocks as Paragraph[]).map((p) => (p.runs[0] as { text: string }).text)).toEqual(['☐ ', '☑ ']);
  });
});

describe('MD-021 code blocks keep their language', () => {
  it('keeps the info string, also through the editor', () => {
    const md = '```js\nconst a = 1;\n```\n\n```python title="a.py"\nx = 1\n```\n';
    expect(roundTrip(md)).toBe(md);
  });
  it('colours the languages it has a grammar for', () => {
    expect(codeLanguage('js')).toBe('javascript');
    expect(codeLanguage('python title="a.py"')).toBe('python');
    expect(codeLanguage('bash')).toBeUndefined();
    expect(codeLanguage('')).toBeUndefined();
  });
});

describe('MD-022 sizes of pictures', () => {
  it('applies and keeps sizes written in embeds and links', () => {
    const md = 'Voir ![[img.png|300]], ![[b.png|30x20]], ![[c.png|légende]] et ![chat|200](chat.png)\n';
    const runs = paragraphs(md)[0]!.runs.filter((r) => 'image' in r);
    expect(runs).toMatchObject([{ width: 300 }, { width: 30, height: 20 }, { alt: 'légende' }, { alt: 'chat', width: 200, linkSize: true }]);
    expect(roundTrip(md)).toBe(md);
  });
});

describe('MD-023 raw HTML kept as written, shown sanitised', () => {
  it('keeps HTML blocks and inline HTML on save, also through the editor', () => {
    const md = '<div class="x" onclick="evil()">html <b>bold</b></div>\n\nDu <span style="color:red">rouge</span> ici\n';
    expect(roundTrip(md)).toBe(md);
    expect(paragraphs(md)[0]!.raw).toBe('html');
  });
  it('builds a sanitised tree: no scripts, styles, handlers, frames or javascript: links', () => {
    const div = document.createElement('div');
    div.append(sanitizeHtml('<p onclick="x()" style="color:red">a <b>b</b> <a href="javascript:alert(1)">c</a> <a href="https://e.org/">d</a></p><script>alert(1)</script><style>p{}</style><iframe src="https://e.org"></iframe><img src="https://e.org/t.png" alt="track"><custom-el>kept</custom-el>'));
    expect(div.innerHTML).toBe('<p>a <b>b</b> <a>c</a> <a href="https://e.org/" target="_blank" rel="noopener noreferrer">d</a></p>tracktrack'.replace('tracktrack', 'track') + 'kept');
    expect(div.querySelector('script, style, iframe, [onclick], [style]')).toBeNull();
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeHref('#part')).toBe('#part');
    expect(safeHref('data:text/html,x')).toBeNull();
  });
});

describe('MD-024 comments of a note', () => {
  it('reads inline and block comments and writes them back as written', () => {
    const md = 'Texte %%caché%% ici\n\n%%\nbloc\ncaché\n%%\n\nSuite\n';
    expect(roundTrip(md)).toBe(md);
    const ps = paragraphs(md);
    expect(ps[0]!.runs).toEqual([{ text: 'Texte ' }, { text: 'caché', mdComment: true }, { text: ' ici' }]);
    expect(ps[1]!.raw).toBe('comment');
  });
  it('leaves comments out of other formats', () => {
    const doc = forExport(readMarkdown('Texte %%caché%% ici\n\n%%\nbloc\n%%\n'));
    expect(JSON.stringify(doc.blocks)).not.toContain('caché');
    expect(doc.blocks).toHaveLength(1);
  });
});

describe('MD-025 block identifiers', () => {
  it('keeps ^id out of the text and writes it back', () => {
    const md = 'Un paragraphe ^abc123\n\n- un élément ^item-1\n\n> une citation ^q1\n';
    const ps = paragraphs(md);
    expect(ps.map((p) => p.blockId)).toEqual(['abc123', 'item-1', 'q1']);
    expect(ps[0]!.runs).toEqual([{ text: 'Un paragraphe' }]);
    expect(roundTrip(md)).toBe(md);
  });
  it('gives an identifier alone on its line to the block before it', () => {
    const ps = paragraphs('Un paragraphe\n\n^seul\n\nSuite\n');
    expect(ps.map((p) => [p.blockId, (p.runs[0] as { text: string }).text])).toEqual([['seul', 'Un paragraphe'], [undefined, 'Suite']]);
  });
  it('keeps a link to a block', () => {
    expect(roundTrip('Lien [[Note#^abc123]]\n')).toBe('Lien [[Note#^abc123]]\n');
  });
});

describe('MD-026 folded callouts', () => {
  it('writes callouts back as written, without lines added or removed', () => {
    for (const md of ['> [!tip]- Plié\n> contenu\n', '> [!note]+ Ouvert\n> a\n>\n> b\n', '> [!warning]\n> Attention\n', '> [!WARNING] Hot\n>\n> Do not touch.\n']) expect(roundTrip(md)).toBe(md);
  });
});
