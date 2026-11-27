import { describe, expect, it } from 'vitest';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { readDocument, writeDocument } from '../src/document/io';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { collectDiagrams, emptyDocument, type RenderedDiagram, type RichDocument } from '../src/document/model';
import { writeLatex } from '../src/document/latex-writer';
import { readZip, readZipText } from '../src/core/zip';
import { DIAGRAM_TEMPLATES } from '../src/diagram/templates';

const SOURCE = 'flowchart LR\n  A["Start & go"] --> B{OK?}\n  B -- yes --> C';

const diagramDoc = (): RichDocument => {
  const doc = emptyDocument();
  doc.blocks = [
    { type: 'paragraph', style: 'normal', runs: [{ text: 'Before' }] },
    { type: 'paragraph', style: 'normal', runs: [{ diagram: SOURCE, lang: 'mermaid' }] },
    { type: 'paragraph', style: 'normal', runs: [{ text: 'After' }] },
  ];
  return doc;
};

/** A 1x1 transparent PNG standing in for the rasterised diagram. */
const PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='),
  (c) => c.charCodeAt(0),
);
const rendered = (): Map<string, RenderedDiagram> => new Map([[SOURCE, { png: PNG, width: 320, height: 120 }]]);

describe('DIAG-004 Markdown diagrams', () => {
  it('parses ```mermaid fences into diagrams and keeps other fences as code', () => {
    const md = 'Before\n\n```mermaid\n' + SOURCE + '\n```\n\n```js\nx = 1\n```\n';
    expect(readMarkdown(md).blocks).toEqual([
      { type: 'paragraph', style: 'normal', runs: [{ text: 'Before' }] },
      { type: 'paragraph', style: 'normal', runs: [{ diagram: SOURCE, lang: 'mermaid' }] },
      { type: 'paragraph', style: 'code', codeInfo: 'js', runs: [{ text: 'x = 1' }] },
    ]);
  });

  it('writes diagrams back as ```mermaid fences', () => {
    const md = writeMarkdown(diagramDoc(), { frontMatter: false });
    expect(md).toBe('Before\n\n```mermaid\n' + SOURCE + '\n```\n\nAfter\n');
    expect(readMarkdown(md).blocks).toEqual(diagramDoc().blocks);
  });

  it('uses a longer fence when the source contains backticks', () => {
    const doc = emptyDocument();
    doc.blocks = [{ type: 'paragraph', style: 'normal', runs: [{ diagram: 'graph TD\n```\nA', lang: 'mermaid' }] }];
    const md = writeMarkdown(doc, { frontMatter: false });
    expect(md.startsWith('````mermaid\n')).toBe(true);
    expect(readMarkdown(md).blocks).toEqual(doc.blocks);
  });

  it('round-trips through MDZ', async () => {
    const back = await readDocument('mdz', writeDocument(diagramDoc(), 'mdz'));
    expect(back.blocks).toEqual(diagramDoc().blocks);
  });

  it('collects every distinct diagram source', () => {
    const doc = diagramDoc();
    doc.blocks.push({ type: 'table', rows: [[{ blocks: [{ type: 'paragraph', style: 'normal', runs: [{ diagram: SOURCE, lang: 'mermaid' }] }] }]] });
    expect(collectDiagrams(doc.blocks)).toEqual([SOURCE]);
  });
});

describe('DIAG-001 HTML bridge', () => {
  it('renders a diagram placeholder that round-trips', () => {
    const div = document.createElement('div');
    div.append(blocksToDom(diagramDoc().blocks, document, () => undefined));
    const el = div.querySelector<HTMLElement>('span.diagram')!;
    expect(el.dataset.diagram).toBe('mermaid');
    expect(el.dataset.source).toBe(SOURCE);
    expect(el.contentEditable).toBe('false');
    expect(domToBlocks(div, () => undefined)).toEqual(diagramDoc().blocks);
  });

  it('ignores a rendered image inside the placeholder', () => {
    const div = document.createElement('div');
    div.innerHTML = `<p><span class="diagram" data-diagram="mermaid" data-source="graph TD"><img src="data:image/svg+xml,x" alt=""></span></p>`;
    expect(domToBlocks(div, () => 'should-not-be-used')).toEqual([
      { type: 'paragraph', style: 'normal', runs: [{ diagram: 'graph TD', lang: 'mermaid' }] },
    ]);
  });
});

describe('DIAG-005 DOCX and ODT diagrams', () => {
  it('embeds a PNG picture titled "mermaid" with the source in DOCX and reads it back', async () => {
    const bytes = writeDocument(diagramDoc(), 'docx', { diagrams: rendered() });
    const zip = readZip(bytes);
    const xml = readZipText(zip, 'word/document.xml')!;
    expect(xml).toContain('title="mermaid"');
    expect(xml).toContain('descr="flowchart LR&#10;  A[&quot;Start &amp; go&quot;]');
    expect(Object.keys(zip).some((p) => p.startsWith('word/media/') && p.endsWith('.png'))).toBe(true);
    const back = await readDocument('docx', bytes);
    expect(back.blocks).toEqual(diagramDoc().blocks);
    expect(back.resources.size).toBe(0);
  });

  it('embeds a PNG frame with svg:title and svg:desc in ODT and reads it back', async () => {
    const bytes = writeDocument(diagramDoc(), 'odt', { diagrams: rendered() });
    const zip = readZip(bytes);
    const xml = readZipText(zip, 'content.xml')!;
    expect(xml).toContain('<svg:title>mermaid</svg:title>');
    expect(xml).toContain('<svg:desc>flowchart LR\n  A[&quot;Start &amp; go&quot;]');
    expect(readZipText(zip, 'META-INF/manifest.xml')).toMatch(/Pictures\/[^"]+\.png/);
    const back = await readDocument('odt', bytes);
    expect(back.blocks).toEqual(diagramDoc().blocks);
    expect(back.resources.size).toBe(0);
  });

  it('DIAG-007 writes the source as text when the diagram was not rendered', async () => {
    for (const format of ['docx', 'odt'] as const) {
      const back = await readDocument(format, writeDocument(diagramDoc(), format));
      const texts = back.blocks.map((b) => (b.type === 'paragraph' ? b.runs.map((r) => ('text' in r ? r.text : '')).join('') : ''));
      expect(texts).toContain(SOURCE);
    }
  });
});

describe('DIAG-006 LaTeX diagrams', () => {
  it('includes the PNG and keeps the source in comments', () => {
    const { tex, images } = writeLatex(diagramDoc(), { diagrams: rendered() });
    expect(tex).toContain('% mermaid\n% flowchart LR\n%   A["Start & go"] --> B{OK?}\n');
    const path = /\\includegraphics\[width=[\d.]+\\linewidth\]\{(images\/[^}]+\.png)\}/.exec(tex)?.[1];
    expect(path).toBeDefined();
    expect(images.get(path!)).toEqual(PNG);
  });

  it('falls back to a verbatim block without rendering', () => {
    const { tex } = writeLatex(diagramDoc());
    expect(tex).toContain('\\begin{verbatim}\n' + SOURCE + '\n\\end{verbatim}');
  });
});

describe('DIAG-001 templates', () => {
  it('offers the starter templates', () => {
    const kinds = DIAGRAM_TEMPLATES.map((t) => t.id);
    expect(kinds).toEqual(['flowchart', 'sequence', 'class', 'state', 'er', 'gantt', 'pie', 'mindmap']);
    for (const t of DIAGRAM_TEMPLATES) expect(t.source.trim().length).toBeGreaterThan(10);
  });
});
