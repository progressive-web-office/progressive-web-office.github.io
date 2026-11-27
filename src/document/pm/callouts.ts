/**
 * Callouts (MD-019): a quote whose first line is `[!NOTE] Title` (note apps,
 * GitHub alerts) is drawn as a coloured box, by type; the text stays as it is.
 */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Node as PmNode } from 'prosemirror-model';

const MARKER = /^\[!([A-Za-z][\w-]*)\][+-]?/;

/** Usual types and their aliases, by colour family. */
const FAMILIES: Record<string, string[]> = {
  note: ['note', 'info', 'todo'],
  abstract: ['abstract', 'summary', 'tldr'],
  tip: ['tip', 'hint', 'important', 'success', 'check', 'done'],
  question: ['question', 'help', 'faq'],
  warning: ['warning', 'caution', 'attention'],
  danger: ['danger', 'error', 'failure', 'fail', 'missing', 'bug'],
  example: ['example', 'quote', 'cite'],
};

/** MD-019: the icon of a callout type, before its title. */
const ICONS: Record<string, string> = {
  note: '✏️', abstract: '📋', summary: '📋', tldr: '📋', info: 'ℹ️', todo: '☑️', tip: '🔥', hint: '🔥', important: '🔥',
  success: '✅', check: '✅', done: '✅', question: '❓', help: '❓', faq: '❓', warning: '⚠️', caution: '⚠️', attention: '⚠️',
  failure: '❌', fail: '❌', missing: '❌', danger: '⚡', error: '⚡', bug: '🐞', example: '📝', quote: '❝', cite: '❝',
};

export function calloutIcon(type: string): string {
  return ICONS[type.toLowerCase()] ?? ICONS[calloutFamily(type)] ?? '✏️';
}

/** The colour family of a callout type (unknown types look like notes). */
export function calloutFamily(type: string): string {
  const t = type.toLowerCase();
  return Object.keys(FAMILIES).find((f) => FAMILIES[f]!.includes(t)) ?? 'note';
}

/** For each paragraph: the callout it belongs to, if any, and whether it is the marker line. */
export function calloutSpans(paragraphs: { quote: boolean; text: string }[]): ({ family: string; head: boolean } | null)[] {
  let current: string | null = null;
  return paragraphs.map((p) => {
    if (!p.quote) return (current = null);
    const m = MARKER.exec(p.text);
    if (m) {
      current = calloutFamily(m[1]!);
      return { family: current, head: true };
    }
    return current ? { family: current, head: false } : null;
  });
}

const key = new PluginKey<DecorationSet>('callouts');

function decorate(state: EditorState): DecorationSet {
  const doc = state.doc;
  const { from, to } = state.selection;
  const blocks: { pos: number; node: PmNode }[] = [];
  doc.forEach((node, pos) => {
    if (node.isTextblock) blocks.push({ pos, node });
    else blocks.push({ pos: -1, node });
  });
  const spans = calloutSpans(blocks.map(({ node }) => ({ quote: node.isTextblock && node.attrs.style === 'quote', text: node.isTextblock ? node.textContent.slice(0, 40) : '' })));
  const out: Decoration[] = [];
  spans.forEach((s, i) => {
    if (!s) return;
    const { pos, node } = blocks[i]!;
    out.push(Decoration.node(pos, pos + node.nodeSize, { class: `callout callout-${s.family}${s.head ? ' callout-head' : ''}` }));
    if (!s.head) return;
    // MD-019: the icon of the type before the title; the `[!TYPE]` marker shown only while the title line is edited.
    const text = node.textContent;
    const m = MARKER.exec(text);
    if (!m) return;
    const type = /^\[!([A-Za-z][\w-]*)\]/.exec(text)![1]!;
    const end = m[0].length + (/^\s/.test(text.slice(m[0].length)) ? 1 : 0);
    const editing = from <= pos + node.nodeSize && to >= pos;
    const title = text.slice(end).trim();
    out.push(
      Decoration.widget(
        pos + 1,
        () => {
          const span = document.createElement('span');
          span.className = 'callout-icon';
          span.setAttribute('aria-hidden', 'true');
          span.textContent = calloutIcon(type);
          return span;
        },
        { side: -1, key: `icon-${type}`, ignoreSelection: true },
      ),
    );
    if (!editing) {
      out.push(Decoration.inline(pos + 1, pos + 1 + end, { class: 'callout-marker' }));
      if (!title) {
        out.push(
          Decoration.widget(
            pos + 1 + end,
            () => {
              const span = document.createElement('span');
              span.className = 'callout-default-title';
              span.textContent = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
              return span;
            },
            { side: 1, key: `title-${type}`, ignoreSelection: true },
          ),
        );
      }
    }
  });
  return DecorationSet.create(doc, out);
}

export function calloutPlugin(): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key,
    state: {
      init: (_c, state) => decorate(state),
      apply: (tr, prev, _o, state) => (tr.docChanged || tr.selectionSet ? decorate(state) : prev),
    },
    props: { decorations: (state) => key.getState(state) },
  });
}
