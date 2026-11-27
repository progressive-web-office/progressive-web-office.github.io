/**
 * DOC-056: the live preview of a Markdown document. The document is shown
 * formatted; the text block holding the cursor shows its Markdown instead
 * (`**bold**`, `## Title`, `[text](address)`, `[[note]]`, `$x$`), edited as
 * text, and is read again when the cursor leaves it. A block is shown as
 * Markdown only when that Markdown reads back to the very same block, so
 * nothing is lost; it is given back unchanged when its text did not change.
 * The document saved never holds the Markdown shown (`concealedDoc`).
 */
import type { Node as PmNode } from 'prosemirror-model';
import { Plugin, PluginKey, TextSelection, type EditorState, type Selection, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import { readMarkdown } from '../markdown-reader';
import { writeMarkdown } from '../markdown-writer';
import { emptyDocument } from '../model';
import { paragraphToPm, pmToParagraph } from './convert';

interface Revealed {
  /** Start of the block shown as Markdown, and its end (a block split while shown stays in the range). */
  pos: number;
  end: number;
  original: PmNode;
  source: string;
}

const key = new PluginKey<Revealed | null>('live');

/** The Markdown of a text block, or undefined when it does not read back to the same block. */
export function blockMarkdown(node: PmNode): string | undefined {
  if (!node.isTextblock || node.attrs.raw || node.attrs.style === 'code') return undefined;
  const p = pmToParagraph(node);
  const md = writeMarkdown({ ...emptyDocument(), blocks: [p] }).replace(/\n+$/, '');
  if (md.includes('\n\n')) return undefined;
  const back = blockFromMarkdown(md);
  if (!back || !back.content.eq(node.content) || back.attrs.style !== node.attrs.style) return undefined;
  return md;
}

/** A text block from its Markdown, or undefined when it is not one block of text. */
function blockFromMarkdown(md: string): PmNode | undefined {
  const blocks = readMarkdown(md).blocks;
  const [only] = blocks;
  if (blocks.length !== 1 || only?.type !== 'paragraph') return md.trim() ? undefined : paragraphToPm({ type: 'paragraph', style: 'normal', runs: [] });
  return paragraphToPm(only);
}

/** The block for the text typed in place of `original`: read as Markdown, its other attributes kept. */
function concealOne(node: PmNode, original: PmNode | undefined, source: string | undefined): PmNode {
  const text = node.textContent;
  if (original && text === source) return original;
  const back = blockFromMarkdown(text);
  // Not one block of text (a list typed, a table…): the text stays as written, literally.
  if (!back) return node.type.create(node.attrs, text ? node.type.schema.text(text) : null);
  const base = original ?? node;
  return base.type.create({ ...base.attrs, style: back.attrs.style }, back.content);
}

/** Replace the blocks of the range shown as Markdown by what they read as. */
function conceal(tr: Transaction, r: Revealed): void {
  const end = Math.min(r.end, tr.doc.content.size);
  const blocks: { pos: number; node: PmNode }[] = [];
  tr.doc.nodesBetween(r.pos, end, (node, pos) => {
    if (node.isTextblock) {
      blocks.push({ pos, node });
      return false;
    }
    return true;
  });
  // From the last, so that the positions before stay right.
  for (const [i, b] of [...blocks.entries()].reverse()) {
    const first = i === 0 && b.pos === r.pos;
    const next = concealOne(b.node, first && blocks.length === 1 ? r.original : undefined, first && blocks.length === 1 ? r.source : undefined);
    if (!next.eq(b.node)) tr.replaceWith(b.pos, b.pos + b.node.nodeSize, next);
  }
}

/** The text block holding the cursor, when it can be shown as Markdown. */
function target(selection: Selection): { pos: number; node: PmNode; md: string } | undefined {
  const { $from, $to } = selection;
  if (!$from.parent.isTextblock || !$from.sameParent($to)) return undefined;
  const node = $from.parent;
  const md = blockMarkdown(node);
  // A block without marks too: what is typed in it is read as Markdown.
  if (md === undefined) return undefined;
  return { pos: $from.before(), node, md };
}

/** Where the cursor goes in the Markdown: as far as the Markdown of what is before it matches. */
function sourceOffset(node: PmNode, offset: number, md: string): number {
  const before = blockMarkdown(node.cut(0, offset)) ?? writeMarkdown({ ...emptyDocument(), blocks: [pmToParagraph(node.cut(0, offset))] }).replace(/\n+$/, '');
  let i = 0;
  while (i < before.length && i < md.length && before[i] === md[i]) i++;
  return i;
}

export interface LiveHooks {
  /** Whether the live preview is on. */
  enabled(): boolean;
}

export function livePlugin(hooks: LiveHooks): Plugin<Revealed | null> {
  return new Plugin<Revealed | null>({
    key,
    state: {
      init: () => null,
      apply(tr, value) {
        const meta = tr.getMeta(key) as { value: Revealed | null } | undefined;
        if (meta) return meta.value;
        if (!value || !tr.docChanged) return value;
        const pos = tr.mapping.mapResult(value.pos, 1);
        if (pos.deleted) return null;
        return { ...value, pos: pos.pos, end: tr.mapping.map(value.end, -1) };
      },
    },
    appendTransaction(trs, _old, state) {
      if (trs.some((t) => t.getMeta(key))) return null;
      const current = key.getState(state) ?? null;
      const on = hooks.enabled();
      const { from, to } = state.selection;
      // Typing in the block shown, or in a part of it split off: it is read again once the cursor leaves.
      if (current && on && from >= current.pos && to <= current.end) return null;
      if (!current && !(on && target(state.selection))) return null;
      const tr = state.tr;
      if (current) conceal(tr, current);
      let value: Revealed | null = null;
      const next = on ? target(tr.selection) : undefined;
      if (next) {
        const offset = sourceOffset(next.node, tr.selection.$from.parentOffset, next.md);
        tr.replaceWith(next.pos + 1, next.pos + 1 + next.node.content.size, state.schema.text(next.md));
        tr.setSelection(TextSelection.create(tr.doc, next.pos + 1 + offset));
        value = { pos: next.pos, end: next.pos + next.md.length + 2, original: next.node, source: next.md };
      }
      return tr.setMeta(key, { value }).setMeta('addToHistory', false);
    },
    props: {
      decorations(state) {
        const r = key.getState(state);
        const node = r ? state.doc.nodeAt(r.pos) : null;
        return r && node ? DecorationSet.create(state.doc, [Decoration.node(r.pos, r.pos + node.nodeSize, { class: 'live-source' })]) : null;
      },
      // A new line or a join at an edge: the block is read again first, then the key does what it does.
      handleKeyDown(view, event) {
        const r = key.getState(view.state);
        if (!r || !['Enter', 'Backspace', 'Delete'].includes(event.key)) return false;
        const { $from, empty } = view.state.selection;
        if (!empty) return false;
        const atStart = $from.parentOffset === 0;
        const atEnd = $from.parentOffset === $from.parent.content.size;
        if ((event.key === 'Backspace' && !atStart) || (event.key === 'Delete' && !atEnd)) return false;
        const tr = view.state.tr;
        const raw = $from.parent.textContent.slice(0, $from.parentOffset);
        conceal(tr, r);
        // Where the cursor was, in the text read again.
        const plain = blockFromMarkdown(raw)?.textContent.length ?? raw.length;
        const block = tr.doc.nodeAt(r.pos);
        if (block) tr.setSelection(TextSelection.create(tr.doc, r.pos + 1 + Math.min(plain, block.content.size)));
        view.dispatch(tr.setMeta(key, { value: null }).setMeta('addToHistory', false));
        return false;
      },
    },
  });
}

/** The block shown as Markdown, with its text, if any. */
export function revealedBlock(state: EditorState): { pos: number; text: string } | undefined {
  const r = key.getState(state);
  const node = r ? state.doc.nodeAt(r.pos) : null;
  return r && node ? { pos: r.pos, text: node.textContent } : undefined;
}

/** The document as it is saved: the block shown as Markdown read again. */
export function concealedDoc(state: EditorState): PmNode {
  const r = key.getState(state);
  if (!r) return state.doc;
  const tr = state.tr;
  conceal(tr, r);
  return tr.doc;
}
