import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { readDocument, writeDocument } from '../src/document/io';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { addResource, emptyDocument, type Block, type RichDocument } from '../src/document/model';
import { writeLatex } from '../src/document/latex-writer';
import { readZip, readZipText } from '../src/core/zip';

/** A 1x1 PNG standing in for a matplotlib figure. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);

const cellDoc = (): RichDocument => {
  const doc = emptyDocument();
  const figure = addResource(doc, PNG, 'image/png');
  doc.blocks = [
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Results' }] },
    { type: 'paragraph', style: 'normal', runs: [{ cell: 'x = 6 * 7\nprint(x)', lang: 'python', output: { text: '42\n', images: [figure] } }] },
    { type: 'paragraph', style: 'normal', runs: [{ cell: 'console.log(1/0)', lang: 'javascript' }] },
    { type: 'paragraph', style: 'normal', runs: [{ cell: '1/0', lang: 'python', output: { text: 'ZeroDivisionError: division by zero\n', error: true } }] },
  ];
  return doc;
};

const MD = [
  'Results',
  '',
  '```python {run}',
  'x = 6 * 7',
  'print(x)',
  '```',
  '',
  '```text {output}',
  '42',
  '```',
  '',
  '![Output](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII= "output")',
  '',
  '```javascript {run}',
  'console.log(1/0)',
  '```',
  '',
  '```python {run}',
  '1/0',
  '```',
  '',
  '```text {output error}',
  'ZeroDivisionError: division by zero',
  '```',
  '',
].join('\n');

const runsOf = (blocks: Block[]) => blocks.map((b) => (b.type === 'paragraph' ? b.runs : b));

describe('CODE-006 Markdown code cells', () => {
  it('writes cells as {run} fences followed by their output', () => {
    expect(writeMarkdown(cellDoc(), { frontMatter: false })).toBe(MD);
  });

  it('reads them back, attaching outputs to their cell', () => {
    const doc = readMarkdown(MD);
    expect(runsOf(doc.blocks)).toEqual(runsOf(cellDoc().blocks));
    expect(doc.resources.size).toBe(1);
  });

  it('keeps ordinary fences and lone output-looking blocks as code', () => {
    const doc = readMarkdown('```python\nprint(1)\n```\n\n```text {output}\nstray\n```\n');
    expect(doc.blocks).toEqual([
      { type: 'paragraph', style: 'code', codeInfo: 'python', runs: [{ text: 'print(1)' }] },
      { type: 'paragraph', style: 'code', codeInfo: 'text {output}', runs: [{ text: 'stray' }] },
    ]);
  });

  it('accepts js / py aliases', () => {
    expect(runsOf(readMarkdown('```js {run}\na\n```\n\n```py {run}\nb\n```\n').blocks)).toEqual([[{ cell: 'a', lang: 'javascript' }], [{ cell: 'b', lang: 'python' }]]);
  });

  it('round-trips through MDZ with figures as assets', async () => {
    const bytes = writeDocument(cellDoc(), 'mdz');
    const zip = readZip(bytes);
    expect(Object.keys(zip).some((p) => p.endsWith('.png'))).toBe(true);
    expect(readZipText(zip, 'index.md')).toContain('```python {run}');
    const back = await readDocument('mdz', bytes);
    expect(runsOf(back.blocks)).toEqual(runsOf(cellDoc().blocks));
  });
});

describe('CODE-001 HTML bridge', () => {
  it('renders cells with their output and reads them back', () => {
    const doc = cellDoc();
    const div = document.createElement('div');
    div.append(blocksToDom(doc.blocks, document, (key) => (doc.resources.has(key) ? { url: `blob:${key}` } : undefined)));
    const cell = div.querySelector<HTMLElement>('.code-cell')!;
    expect(cell.contentEditable).toBe('false');
    expect(cell.dataset.lang).toBe('python');
    expect(cell.querySelector('.code-cell-source')!.textContent).toBe('x = 6 * 7\nprint(x)');
    expect(cell.querySelector('.code-cell-output')!.textContent).toBe('42\n');
    expect(div.querySelectorAll('.code-cell-output.error')).toHaveLength(1);
    const back = domToBlocks(div, (img) => img.dataset.resource);
    expect(runsOf(back)).toEqual(runsOf(doc.blocks));
  });
});

describe('CODE-007 export to office formats', () => {
  it('writes the source and the last output as code and pictures in DOCX', async () => {
    const back = await readDocument('docx', writeDocument(cellDoc(), 'docx'));
    const texts = back.blocks.map((b) => (b.type === 'paragraph' ? b.style + ':' + b.runs.map((r) => ('text' in r ? r.text : 'image' in r ? '[image]' : '')).join('') : b.type));
    expect(texts).toEqual([
      'normal:Results',
      'code:x = 6 * 7\nprint(x)',
      'code:42',
      'normal:[image]',
      'code:console.log(1/0)',
      'code:1/0',
      'code:ZeroDivisionError: division by zero',
    ]);
  });

  it('does the same in ODT and LaTeX', async () => {
    const odt = await readDocument('odt', writeDocument(cellDoc(), 'odt'));
    expect(odt.blocks.filter((b) => b.type === 'paragraph' && b.style === 'code')).toHaveLength(5);
    const { tex, images } = writeLatex(cellDoc());
    expect(tex).toContain('\\begin{verbatim}\nx = 6 * 7\nprint(x)\n\\end{verbatim}');
    expect(tex).toContain('\\begin{verbatim}\n42\n\\end{verbatim}');
    expect(images.size).toBe(1);
  });
});
