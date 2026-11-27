/**
 * Completion while typing in a note of a folder (FOLDER-021): `[[` lists the
 * notes to link to, `#` the tags already used. A list under the cursor;
 * ↑/↓ choose, Enter or Tab accept, Escape closes.
 */
import { Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { WIKI, defaultLabel } from '../wiki-links';
import { schema } from './schema';

export type CompletionKind = 'link' | 'tag' | 'snippet' | 'heading' | 'block';

export interface CompletionQuery {
  kind: CompletionKind;
  query: string;
  /** Characters typed, trigger included, replaced on accepting. */
  length: number;
  /** FOLDER-028: the note whose headings or blocks are listed (empty: this note). */
  note?: string;
}

/** What the text before the cursor asks to complete, if anything. */
export function completionQuery(before: string): CompletionQuery | null {
  // DOC-037: `;;` and a snippet's name.
  const snippet = /(?:^|\s);;([\p{L}\p{N}_-]{0,40})$/u.exec(before);
  if (snippet) return { kind: 'snippet', query: snippet[1]!, length: snippet[1]!.length + 2 };
  // FOLDER-028: `[[note#` lists its headings, `[[note#^` its blocks.
  const sub = /\[\[([^[\]|#\n]{0,60})#(\^?)([^[\]|#\n]{0,60})$/.exec(before);
  if (sub) return { kind: sub[2] ? 'block' : 'heading', note: sub[1]!, query: sub[3]!, length: sub[0].length };
  const link = /\[\[([^[\]|#\n]{0,60})$/.exec(before);
  if (link) return { kind: 'link', query: link[1]!, length: link[0].length };
  const tag = /(?:^|[\s(])#([\p{L}\p{N}_/-]{1,40})$/u.exec(before);
  if (tag) return { kind: 'tag', query: tag[1]!, length: tag[1]!.length + 1 };
  return null;
}

/** The items matching `query`: those starting with it first, then those containing it; at most `max`. */
export function rankCompletions(items: string[], query: string, max = 8, keepExact = false): string[] {
  const q = query.toLowerCase();
  const starts: string[] = [];
  const contains: string[] = [];
  for (const item of new Set(items)) {
    const i = item.toLowerCase();
    if (i === q && !keepExact) continue;
    if (i.startsWith(q) || i.split(/[/\s_-]/).some((w) => w.startsWith(q))) starts.push(item);
    else if (i.includes(q)) contains.push(item);
  }
  const byName = (a: string, b: string): number => a.length - b.length || a.localeCompare(b);
  return [...starts.sort(byName), ...contains.sort(byName)].slice(0, max);
}

/** Where completions come from (the open folder). */
export type CompletionSource = (kind: CompletionKind, note?: string) => Promise<string[]> | string[] | undefined;

/** FOLDER-028: a block is offered as `its text… ^id`. */
export const blockItem = (text: string, id: string): string => `${text.length > 60 ? `${text.slice(0, 59)}…` : text} ^${id}`;
export const blockOfItem = (item: string): string => /\^([A-Za-z0-9-]+)$/.exec(item)?.[1] ?? '';

interface State {
  q: CompletionQuery | null;
  /** Position of the cursor when it was computed. */
  pos: number;
  /** Closed with Escape at this position: do not reopen until the text moves on. */
  dismissed: number;
}

const key = new PluginKey<State>('completion');

function queryAt(state: EditorState): CompletionQuery | null {
  const { $from, empty } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.attrs.style === 'code' || schema.marks.code!.isInSet($from.marks())) return null;
  return completionQuery($from.parent.textBetween(Math.max(0, $from.parentOffset - 80), $from.parentOffset, undefined, '￼'));
}

/** Replace the typed trigger and query with the chosen item. */
export function acceptCompletion(view: EditorView, q: CompletionQuery, item: string, onSnippet?: (name: string) => void): void {
  const { state } = view;
  const to = state.selection.from;
  const from = to - q.length;
  const tr = state.tr;
  if (q.kind === 'snippet') {
    // The typed `;;name` goes; the snippet takes its place.
    view.dispatch(tr.delete(from, to));
    onSnippet?.(item);
    return;
  }
  if (q.kind === 'link') {
    // A wiki link, as `[[item]]` in the note once saved.
    tr.replaceWith(from, to, schema.text(item, [schema.marks.link!.create({ href: WIKI + item })]));
  } else if (q.kind === 'heading' || q.kind === 'block') {
    // FOLDER-028: `[[note#heading]]`, `[[note#^id]]` (a block item ends with its identifier).
    const sub = q.kind === 'block' ? `^${blockOfItem(item)}` : item;
    const note = q.note ?? '';
    tr.replaceWith(from, to, schema.text(defaultLabel(note, sub), [schema.marks.link!.create({ href: `${WIKI}${note}#${sub}` })]));
  } else {
    tr.insertText(`#${item}`, from, to);
  }
  tr.removeStoredMark(schema.marks.link!);
  view.dispatch(tr.insertText(' ').scrollIntoView());
  view.focus();
}

export function completionPlugin(source: CompletionSource, label: (kind: CompletionKind) => string, onSnippet?: (name: string) => void, onAccepted?: (q: CompletionQuery, item: string) => void): Plugin<State> {
  let list: HTMLUListElement | null = null;
  let items: string[] = [];
  let active = 0;
  let request = 0;
  let current: CompletionQuery | null = null;

  const close = (): void => {
    list?.remove();
    list = null;
    items = [];
    current = null;
  };

  const render = (view: EditorView): void => {
    if (!list || !current) return;
    list.replaceChildren(
      ...items.map((item, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.id = `pwo-completion-${i}`;
        li.setAttribute('aria-selected', String(i === active));
        li.textContent = current!.kind === 'tag' ? `#${item}` : current!.kind === 'snippet' ? `;;${item}` : item;
        li.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const q = current!;
          close();
          acceptCompletion(view, q, item, onSnippet);
          onAccepted?.(q, item);
        });
        return li;
      }),
    );
    view.dom.setAttribute('aria-activedescendant', `pwo-completion-${active}`);
  };

  const open = async (view: EditorView, q: CompletionQuery): Promise<void> => {
    const mine = ++request;
    const all = (await source(q.kind, q.note)) ?? [];
    if (mine !== request) return;
    const found = rankCompletions(all, q.query, q.kind === 'snippet' ? 12 : 8, q.kind === 'snippet' || q.kind === 'heading' || q.kind === 'block');
    if (!found.length) return close();
    current = q;
    items = found;
    active = 0;
    if (!list) {
      list = document.createElement('ul');
      list.className = 'completion-list';
      list.setAttribute('role', 'listbox');
      document.body.append(list);
    }
    list.setAttribute('aria-label', label(q.kind));
    const at = view.coordsAtPos(view.state.selection.from);
    list.style.left = `${Math.round(at.left + scrollX)}px`;
    list.style.top = `${Math.round(at.bottom + scrollY + 4)}px`;
    render(view);
  };

  return new Plugin<State>({
    key,
    state: {
      init: () => ({ q: null, pos: -1, dismissed: -1 }),
      apply(tr, prev, _old, state) {
        const meta = tr.getMeta(key) as { dismiss?: boolean } | undefined;
        const pos = state.selection.from;
        if (meta?.dismiss) return { q: null, pos, dismissed: pos };
        if (!tr.docChanged && !tr.selectionSet) return prev;
        const q = tr.docChanged ? queryAt(state) : null;
        return { q: q && pos !== prev.dismissed ? q : null, pos, dismissed: tr.docChanged ? -1 : prev.dismissed };
      },
    },
    props: {
      handleKeyDown(view, event) {
        if (!list || !items.length || !current) return false;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          active = (active + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
          render(view);
          return true;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          const q = current;
          const item = items[active]!;
          close();
          acceptCompletion(view, q, item, onSnippet);
          onAccepted?.(q, item);
          return true;
        }
        if (event.key === 'Escape') {
          close();
          view.dispatch(view.state.tr.setMeta(key, { dismiss: true }));
          return true;
        }
        return false;
      },
    },
    view: () => ({
      update(view) {
        const s = key.getState(view.state);
        if (!s?.q) {
          request++;
          close();
          view.dom.removeAttribute('aria-activedescendant');
          return;
        }
        void open(view, s.q);
      },
      destroy: close,
    }),
  });
}
