import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { paragraph, type Block, type RichDocument } from '../src/document/model';
import { PNG_1PX, richSample } from './fixtures';

const md = (text: string) => readMarkdown(text).blocks;

describe('MD-001 Markdown reader', () => {
  it('parses headings, emphasis, code, links and breaks', () => {
    expect(md('# T\n\nSome **bold** and *it* ~~s~~ `c` [l](https://x.y)  \nnext')).toEqual([
      paragraph('T', { style: 'h1' }),
      {
        type: 'paragraph',
        style: 'normal',
        runs: [
          { text: 'Some ' },
          { text: 'bold', bold: true },
          { text: ' and ' },
          { text: 'it', italic: true },
          { text: ' ' },
          { text: 's', strike: true },
          { text: ' ' },
          { text: 'c', code: true },
          { text: ' ' },
          { text: 'l', link: 'https://x.y' },
          { text: '\nnext' },
        ],
      },
    ]);
  });

  it('parses nested lists, quotes, fences, rules and GFM tables', () => {
    const blocks = md('- a\n  1. b\n- c\n\n> q\n\n```js\nx = 1\ny\n```\n\n---\n\n| h | i |\n|---|---|\n| 1 | **2** |\n');
    expect(blocks).toEqual([
      paragraph('a', { list: { ordered: false, level: 0 } }),
      paragraph('b', { list: { ordered: true, level: 1 } }),
      paragraph('c', { list: { ordered: false, level: 0 } }),
      paragraph('q', { style: 'quote' }),
      paragraph('x = 1\ny', { style: 'code', codeInfo: 'js' }),
      { type: 'rule' },
      {
        type: 'table',
        header: true,
        rows: [
          [{ blocks: [paragraph('h')] }, { blocks: [paragraph('i')] }],
          [{ blocks: [paragraph('1')] }, { blocks: [{ type: 'paragraph', style: 'normal', runs: [{ text: '2', bold: true }] }] }],
        ],
      },
    ] satisfies Block[]);
  });

  it('MD-003 MD-023 keeps raw HTML as written, never as markup of the page (except <u> and <br>)', () => {
    expect(md('<script>alert(1)</script>\n\nx <b onclick="y">z</b> <u>under</u>')).toEqual([
      { type: 'paragraph', style: 'normal', raw: 'html', runs: [{ text: '<script>alert(1)</script>' }] },
      { type: 'paragraph', style: 'normal', runs: [{ text: 'x ' }, { text: '<b onclick="y">', rawHtml: true }, { text: 'z' }, { text: '</b>', rawHtml: true }, { text: ' ' }, { text: 'under', underline: true }] },
    ]);
  });

  it('embeds data: URI images and keeps other image references as external', () => {
    const b64 = btoa(String.fromCharCode(...PNG_1PX));
    const doc = readMarkdown(`![px](data:image/png;base64,${b64}) ![far](https://e.org/a.png)`);
    const p = doc.blocks[0] as { runs: unknown[] };
    const key = [...doc.resources.keys()][0]!;
    expect(p.runs).toEqual([{ image: key, alt: 'px' }, { text: ' ' }, { image: '', alt: 'far', src: 'https://e.org/a.png' }]);
    expect(doc.resources.get(key)!.data).toEqual(PNG_1PX);
  });

  it('resolves relative images through a resolver', () => {
    const doc = readMarkdown('![x](./assets/images/p.png)', {
      resolveImage: (src) => (src === './assets/images/p.png' ? { data: PNG_1PX, mediaType: 'image/png', name: 'p.png' } : undefined),
    });
    expect(doc.resources.size).toBe(1);
  });
});

describe('MD-002 Markdown writer', () => {
  const roundTrip = (doc: RichDocument) => readMarkdown(writeMarkdown(doc)).blocks;

  it('round-trips the rich sample (except alignment, which Markdown cannot express)', () => {
    const doc = richSample();
    const expected = doc.blocks.map((b) => (b.type === 'paragraph' ? (({ align: _a, ...rest }) => rest)(b) : b));
    const back = readMarkdown(writeMarkdown(doc, { imageUrl: (key) => `img/${key}.png` }), {
      resolveImage: (src) => {
        const key = /img\/(.+)\.png/.exec(src)?.[1];
        const res = key ? doc.resources.get(key) : undefined;
        return res && { data: res.data, mediaType: res.mediaType };
      },
    }).blocks;
    // image sizes are not representable in Markdown
    const strip = (bs: Block[]) => JSON.parse(JSON.stringify(bs).replace(/,"width":\d+,"height":\d+/g, ''));
    expect(strip(back)).toEqual(strip(expected));
  });

  it('escapes Markdown syntax in text', () => {
    const doc: RichDocument = { blocks: [paragraph('# not *a* heading [x] 1. `y` <b>')], resources: new Map(), meta: {} };
    expect(roundTrip(doc)).toEqual(doc.blocks);
  });

  it('keeps delimiters valid around spaces and nested formats', () => {
    const doc: RichDocument = {
      blocks: [
        {
          type: 'paragraph',
          style: 'normal',
          runs: [{ text: 'a ' }, { text: 'b ', bold: true }, { text: 'c', bold: true, italic: true }, { text: ' d', italic: true }, { text: ' e' }],
        },
      ],
      resources: new Map(),
      meta: {},
    };
    // Output: `a **b *c*** *d* e` — whitespace at a closing boundary moves outside the markers.
    expect(roundTrip(doc)).toEqual([
      {
        type: 'paragraph',
        style: 'normal',
        runs: [{ text: 'a ' }, { text: 'b ', bold: true }, { text: 'c', bold: true, italic: true }, { text: ' ' }, { text: 'd', italic: true }, { text: ' e' }],
      },
    ]);
  });

  it('writes data: URIs for images by default (self-contained .md)', () => {
    const text = writeMarkdown(richSample());
    expect(text).toMatch(/!\[pixel\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)/);
  });
});

describe('MD-019 Markdown extras: highlight and callouts', () => {
  it('reads ==highlight== and writes highlighted text back so', () => {
    const [p] = md('Some ==very **important**== text, a = b, x == y') as [import('../src/document/model').Paragraph];
    expect(p.runs).toEqual([
      { text: 'Some ' },
      { text: 'very ', highlight: '#fff176' },
      { text: 'important', highlight: '#fff176', bold: true },
      { text: ' text, a = b, x == y' },
    ]);
    const out = writeMarkdown(readMarkdown('Some ==very **important**== text, a = b, x \\== y\n'));
    expect(out).toContain('Some ==very **important**== text, a = b, x \\== y');
  });

  it('keeps callouts: the marker line, then the body', () => {
    const blocks = md('> [!NOTE] Remember\n> the *body*\n\n> [!warning]-\n> Hot\n');
    expect(blocks.map((b) => (b.type === 'paragraph' ? [b.style, b.runs.map((r) => ('text' in r ? r.text : '')).join('')] : b.type))).toEqual([
      ['quote', '[!NOTE] Remember'],
      ['quote', 'the body'],
      ['quote', '[!warning]-'],
      ['quote', 'Hot'],
    ]);
    const out = writeMarkdown(readMarkdown('> [!NOTE] Remember\n> the body\n'));
    // MD-026: the body follows its title line, as written.
    expect(out).toContain('> [!NOTE] Remember\n> the body');
    expect(writeMarkdown(readMarkdown(out))).toBe(out);
  });
});

describe('MD-019 callouts in the editor', () => {
  it('groups the quote paragraphs of each callout, by colour family', async () => {
    const { calloutSpans, calloutFamily } = await import('../src/document/pm/callouts');
    expect(calloutFamily('WARNING')).toBe('warning');
    expect(calloutFamily('bug')).toBe('danger');
    expect(calloutFamily('custom')).toBe('note');
    const q = (text: string) => ({ quote: true, text });
    expect(calloutSpans([q('[!TIP] Hint'), q('body'), q('[!danger]'), q('x'), { quote: false, text: 'p' }, q('plain quote')])).toEqual([
      { family: 'tip', head: true },
      { family: 'tip', head: false },
      { family: 'danger', head: true },
      { family: 'danger', head: false },
      null,
      null,
    ]);
  });
});
