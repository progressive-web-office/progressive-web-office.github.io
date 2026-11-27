import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToPm, pmToBlocks } from '../src/document/pm/convert';
import { schema } from '../src/document/pm/schema';
import { concealedDoc, livePlugin, revealedBlock } from '../src/document/pm/live';
import { emptyDocument } from '../src/document/model';

const md = (state: EditorState): string => writeMarkdown({ ...emptyDocument(), blocks: pmToBlocks(concealedDoc(state)) });

function editor(source: string, live = true) {
  let on = live;
  let state = EditorState.create({ schema, doc: blocksToPm(readMarkdown(source).blocks), plugins: [livePlugin({ enabled: () => on })] });
  const apply = (tr: ReturnType<EditorState['tr']['insertText']>): void => {
    state = state.apply(tr);
  };
  /** Put the cursor in the n-th text block, `at` characters of its text in. */
  const cursor = (n: number, at = 0): void => {
    let pos = -1;
    let i = 0;
    state.doc.descendants((node, p) => {
      if (pos >= 0) return false;
      if (node.isTextblock) {
        if (i === n) pos = p + 1 + at;
        i++;
      }
      return true;
    });
    apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
  };
  return { get state() { return state; }, apply, cursor, off: () => (on = false) };
}

describe('DOC-056 live preview: the Markdown of the block holding the cursor', () => {
  it('shows the marks of the block under the cursor, and only of it', () => {
    const e = editor('Some **bold** and [a link](https://e.org) and [[Note]].\n\n## A *title*\n');
    e.cursor(0, 6);
    expect(revealedBlock(e.state)?.text).toBe('Some **bold** and [a link](https://e.org) and [[Note]].');
    expect(e.state.doc.child(0).textContent).toBe('Some **bold** and [a link](https://e.org) and [[Note]].');
    // The cursor stays in the same word: after "Some b" is "Some **b".
    expect(e.state.selection.$from.parentOffset).toBe('Some **b'.length);
    expect(e.state.doc.child(1).textContent).toBe('A title');
    e.cursor(1, 2);
    expect(e.state.doc.child(0).textContent).toBe('Some bold and a link and Note.');
    expect(e.state.doc.child(1).textContent).toBe('## A *title*');
  });

  it('reads the block again when the cursor leaves it, with what was typed', () => {
    const e = editor('Plain text here.\n\nSecond.\n');
    e.cursor(0, 6);
    e.apply(e.state.tr.insertText('**', e.state.selection.from));
    e.apply(e.state.tr.insertText('**', e.state.selection.from + 4));
    e.cursor(1, 0);
    expect(md(e.state)).toBe('Plain **text** here.\n\nSecond.\n');
    const strong = e.state.doc.child(0).child(1);
    expect(strong.marks.map((m) => m.type.name)).toEqual(['bold']);
    // A heading's level changes with its #.
    e.cursor(1, 0);
    e.apply(e.state.tr.insertText('# ', e.state.selection.from));
    e.cursor(0, 0);
    expect(e.state.doc.child(1).type.name === 'heading' || e.state.doc.child(1).attrs.style === 'h1').toBe(true);
  });

  it('gives back the block exactly as it was when nothing changed', () => {
    const source = 'Text with `code`, ~~gone~~ and $x^2$.\n';
    const e = editor(source);
    const before = e.state.doc;
    e.cursor(0, 3);
    expect(revealedBlock(e.state)).toBeDefined();
    e.off();
    e.apply(e.state.tr);
    expect(e.state.doc.eq(before)).toBe(true);
  });

  it('writes the document without the source shown, even with the cursor in a block', () => {
    const e = editor('A **b** c\n\nD\n');
    e.cursor(0, 1);
    expect(e.state.doc.child(0).textContent).toBe('A **b** c');
    expect(md(e.state)).toBe('A **b** c\n\nD\n');
  });

  it('leaves alone the blocks it cannot give back exactly (pictures, cells…)', () => {
    const e = editor('Before ![alt](data:image/png;base64,iVBORw0KGgo=) after\n\n```python {run}\nx = 1\n```\n');
    e.cursor(0, 2);
    expect(revealedBlock(e.state)).toBeUndefined();
  });
});
