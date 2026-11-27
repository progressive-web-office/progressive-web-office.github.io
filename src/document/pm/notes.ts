/**
 * Notes in the editor: task check boxes (MD-020), code coloured by its
 * language (MD-021), HTML blocks shown sanitised (MD-023), callouts folded
 * and unfolded (MD-026). The text of the document is never changed by the
 * drawing; a click on a check box changes the task's state only.
 */
import { Plugin, PluginKey, type EditorState, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView, type NodeView } from 'prosemirror-view';
import { DOMSerializer, type Node as PmNode } from 'prosemirror-model';
import { highlightCode, type Highlighter } from '@lezer/highlight';
import type { Language } from '@codemirror/language';
import { sanitizeHtml } from '../sanitize-html';
import { CELL_LANGS } from '../code-langs';
import type { CodeLang } from '../model';
import { renderEmbed, type EmbedContext } from '../embeds';

const MARKER = /^\[!([A-Za-z][\w-]*)\]([+-])/;
const CALLOUT = /^\[!([A-Za-z][\w-]*)\]/;
/** Languages coloured in notes: those with a grammar of their own. */
const COLOURED = new Set(['python', 'sql', 'cpp', 'julia', 'lua', 'r', 'typescript', 'javascript', 'java', 'go', 'rust', 'diff']);

interface NotesState {
  deco: DecorationSet;
  /** Callout titles whose folding the user changed (positions, mapped through changes). */
  toggled: Set<number>;
  /** MD-025: the block a link opened the note at, marked for a while. */
  target: number;
}

const key = new PluginKey<NotesState>('notes');
const languages = new Map<string, Language>();
const loading = new Set<string>();

/** The text of a block, one character per inline node (a line break is `\n`), so that offsets are positions. */
export const blockText = (node: PmNode): string => node.textBetween(0, node.content.size, undefined, (leaf) => (leaf.type.name === 'hard_break' ? '\n' : '￼'));

/** MD-021: the language of a code block, from its info string (`js`, `python title="a.py"`). */
export function codeLanguage(info: string | null | undefined): CodeLang | undefined {
  const word = (info ?? '').trim().split(/[\s{]/)[0]?.toLowerCase() ?? '';
  const lang = CELL_LANGS[word];
  return lang && COLOURED.has(lang) ? lang : undefined;
}

function checkbox(view: EditorView, getPos: () => number | undefined, state: string): HTMLElement {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.className = 'task-box';
  box.checked = state === 'x' || state === 'X';
  box.indeterminate = state !== ' ' && !box.checked;
  box.dataset.state = state;
  box.contentEditable = 'false';
  box.addEventListener('mousedown', (e) => e.preventDefault());
  box.addEventListener('click', (e) => {
    e.preventDefault();
    const pos = getPos();
    if (pos === undefined) return;
    const at = view.state.doc.resolve(pos).before();
    const current = view.state.doc.nodeAt(at)?.attrs.task as string | null | undefined;
    if (current === null || current === undefined) return;
    view.dispatch(view.state.tr.setNodeAttribute(at, 'task', current === 'x' || current === 'X' ? ' ' : 'x'));
  });
  return box;
}

function decorate(state: EditorState, toggled: Set<number>, embeds?: () => EmbedContext | undefined, target = -1): DecorationSet {
  const out: Decoration[] = [];
  const marked = target >= 0 ? state.doc.nodeAt(target) : null;
  if (marked) out.push(Decoration.node(target, target + marked.nodeSize, { class: 'block-target' }));
  const doc = state.doc;
  // Callouts are quotes of the top level, as MD-019 draws them.
  let folded = false;
  let inCallout = false;
  doc.forEach((node, pos) => {
    if (!node.isTextblock || node.attrs.style !== 'quote') {
      inCallout = false;
      folded = false;
    } else {
      const text = node.textContent.slice(0, 40);
      const head = CALLOUT.exec(text);
      if (head) {
        inCallout = true;
        const fold = MARKER.exec(text)?.[2];
        folded = fold ? (fold === '-') !== toggled.has(pos) : false;
        if (fold) {
          out.push(
            Decoration.widget(
              pos + 1,
              (view) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'callout-fold';
                b.textContent = folded ? '▸' : '▾';
                b.setAttribute('aria-expanded', String(!folded));
                b.setAttribute('aria-label', folded ? 'Unfold' : 'Fold');
                b.contentEditable = 'false';
                b.addEventListener('mousedown', (e) => e.preventDefault());
                b.addEventListener('click', () => view.dispatch(view.state.tr.setMeta(key, { toggle: pos })));
                return b;
              },
              { side: -1, key: `fold-${pos}-${folded}`, ignoreSelection: true },
            ),
          );
        }
      } else if (inCallout && folded) out.push(Decoration.node(pos, pos + node.nodeSize, { class: 'callout-folded' }));
    }
  });
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // MD-020: a task's check box, before its text.
    const task = node.attrs.task as string | null;
    if (task !== null && task !== undefined) {
      out.push(Decoration.widget(pos + 1, (view, getPos) => checkbox(view, getPos, task), { side: -1, key: `task-${task}`, ignoreSelection: true }));
    }
    // MD-027, MD-028: embeds (`![[note]]`, `![[file.pdf]]`) shown after their link.
    if (embeds) {
      let last: string | undefined;
      node.forEach((child, offset, index) => {
        const href = child.marks.find((m) => m.type.name === 'link')?.attrs.href as string | undefined;
        const ref = href?.startsWith('wiki:!') ? href.slice('wiki:!'.length) : undefined;
        const next = index + 1 < node.childCount ? node.child(index + 1).marks.find((m) => m.type.name === 'link')?.attrs.href : undefined;
        if (ref && (next !== href || index + 1 === node.childCount) && last !== `${pos}:${offset}`) {
          const end = pos + 1 + offset + child.nodeSize;
          last = `${pos}:${offset}`;
          out.push(
            Decoration.widget(
              end,
              () => {
                const ctx = embeds();
                if (ctx) return renderEmbed(ref, ctx);
                const span = document.createElement('span');
                span.hidden = true;
                return span;
              },
              { side: 1, key: `embed-${ref}`, ignoreSelection: true, stopEvent: () => true },
            ),
          );
        }
      });
    }
    // MD-021: code coloured by its language.
    if (node.attrs.style === 'code') {
      const lang = codeLanguage(node.attrs.codeInfo as string | null);
      const language = lang ? languages.get(lang) : undefined;
      if (lang && !language) void load(lang);
      if (language && colours) {
        const code = blockText(node);
        let at = 0;
        highlightCode(
          code,
          language.parser.parse(code),
          colours,
          (text, classes) => {
            if (classes) out.push(Decoration.inline(pos + 1 + at, pos + 1 + at + text.length, { class: classes }));
            at += text.length;
          },
          () => (at += 1),
        );
      }
    }
    return false;
  });
  return DecorationSet.create(doc, out);
}

let colours: Highlighter | undefined;
let pending: EditorView[] = [];

async function load(lang: CodeLang): Promise<void> {
  if (loading.has(lang)) return;
  loading.add(lang);
  const { cellLanguage, highlighter } = await import('../../code/highlight');
  colours = highlighter;
  languages.set(lang, await cellLanguage(lang));
  // Draw again the editors that wait for the grammar.
  for (const view of pending) if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(key, { refresh: true }));
}

/** The default paragraph, or MD-023's HTML block shown sanitised. */
function paragraphView(node: PmNode): NodeView {
  if (node.attrs.raw === 'html') {
    const dom = document.createElement('div');
    dom.className = 'raw-html-block';
    dom.dataset.raw = 'html';
    dom.contentEditable = 'false';
    dom.append(sanitizeHtml(blockText(node)));
    return { dom, update: () => false, ignoreMutation: () => true, stopEvent: (e) => e.type === 'click' && (e.target as HTMLElement).closest('a') !== null };
  }
  const { dom, contentDOM } = DOMSerializer.renderSpec(document, node.type.spec.toDOM!(node));
  let current = node;
  return {
    dom,
    ...(contentDOM ? { contentDOM } : {}),
    update: (next) => {
      if (next.type !== current.type || next.attrs.raw === 'html') return false;
      for (const k of Object.keys(next.attrs)) if (next.attrs[k] !== current.attrs[k]) return false;
      current = next;
      return true;
    },
  };
}

/** MD-020: `[ ] ` or `[x] ` typed at the start of a list item makes it a task. */
function taskInput(view: EditorView, from: number, to: number, text: string): boolean {
  if (text !== ' ' || from !== to) return false;
  const $from = view.state.doc.resolve(from);
  const para = $from.parent;
  if (para.attrs.listOrdered === null || para.attrs.task !== null) return false;
  const before = para.textBetween(0, $from.parentOffset, undefined, '￼');
  const m = /^\[([ xX])\]$/.exec(before);
  if (!m) return false;
  const start = $from.start();
  const tr: Transaction = view.state.tr.delete(start, start + before.length).setNodeAttribute($from.before(), 'task', m[1]!);
  view.dispatch(tr);
  return true;
}

/** MD-025: go to a block, marked for a few seconds. */
export function showBlock(view: EditorView, pos: number): void {
  view.dispatch(view.state.tr.setMeta(key, { target: pos }).scrollIntoView());
  setTimeout(() => {
    if (!view.isDestroyed && key.getState(view.state)?.target === pos) view.dispatch(view.state.tr.setMeta(key, { target: -1 }));
  }, 4000);
}

export function notesPlugin(embeds?: () => EmbedContext | undefined): Plugin<NotesState> {
  return new Plugin<NotesState>({
    key,
    state: {
      init: (_c, state) => ({ deco: decorate(state, new Set(), embeds), toggled: new Set(), target: -1 }),
      apply: (tr, prev, _o, state) => {
        const meta = tr.getMeta(key) as { toggle?: number; refresh?: boolean; target?: number } | undefined;
        let toggled = prev.toggled;
        let target = meta?.target !== undefined ? meta.target : prev.target >= 0 && tr.docChanged ? tr.mapping.map(prev.target) : prev.target;
        if (target >= state.doc.content.size) target = -1;
        if (tr.docChanged) toggled = new Set([...toggled].map((p) => tr.mapping.map(p)));
        if (meta?.toggle !== undefined) {
          toggled = new Set(toggled);
          if (toggled.has(meta.toggle)) toggled.delete(meta.toggle);
          else toggled.add(meta.toggle);
        }
        return tr.docChanged || meta ? { deco: decorate(state, toggled, embeds, target), toggled, target } : prev;
      },
    },
    view: (view) => {
      pending.push(view);
      return { destroy: () => void (pending = pending.filter((v) => v !== view)) };
    },
    props: {
      decorations: (state) => key.getState(state)?.deco,
      nodeViews: { paragraph: paragraphView },
      handleTextInput: taskInput,
    },
  });
}
