/**
 * The graph of the links between the notes of a folder (FOLDER-034,
 * FOLDER-035): an interactive map drawn by the relations view of
 * semantic-atlas (MIT), its layout computed by its engine (WebAssembly),
 * on the device. The same links are listed in a table, for the keyboard and
 * screen readers; a note opens on a double click, on Enter or from the table.
 * Links to notes not written yet lead to notes of their own, drawn hollow;
 * opening one offers to create it (FOLDER-005).
 */
import type { Atlas, EdgeInput, RelationsData, RelationsView } from '@semanticatlas/core';
import { busyText, button, h } from '../app/dom';
import { t } from '../i18n';
import { noteName } from './vault';

/** The notes as nodes named by their file name; links between them, and links to notes that do not exist yet, from them. */
export function notesGraphData(notes: string[], links: { from: string; to: string }[], unresolved: Map<string, { from: string }[]>): RelationsData {
  const shown = new Set(notes);
  const edges: EdgeInput[] = links.filter((l) => shown.has(l.from) && shown.has(l.to)).map((l) => ({ from: l.from, to: l.to, kind: 'link', count: 1 }));
  for (const [target, froms] of unresolved) {
    const counts = new Map<string, number>();
    for (const { from } of froms) if (shown.has(from)) counts.set(from, (counts.get(from) ?? 0) + 1);
    for (const [from, count] of counts) edges.push({ from, to: target, kind: 'unresolved', count });
  }
  return { nodes: notes.map((id) => ({ id, label: noteName(id) })), edges };
}

let atlas: Promise<Atlas> | undefined;

/** The engine, loaded once from the application's own files (kept for offline use). */
function loadAtlas(): Promise<Atlas> {
  atlas ??= (async () => {
    const [{ createAtlas }, { default: url }] = await Promise.all([import('@semanticatlas/core'), import('@semanticatlas/engine/engine.wasm?url')]);
    const response = await fetch(url);
    if (!response.ok) throw new Error(response.statusText);
    return createAtlas(await response.arrayBuffer());
  })().catch((err: unknown) => {
    atlas = undefined;
    throw err;
  });
  return atlas;
}

export interface NotesGraphOptions {
  /** FOLDER-035: the open note, around which the graph can be shown. */
  current?: string;
}

/** What the user picked in the graph: a note to open, or a note to create (a link to a note not written yet). */
export type GraphPick = { open: string } | { create: string };

/** The graph in a window; resolves to what the user picked, or null. */
export function notesGraphDialog(host: HTMLElement, data: RelationsData, opts: NotesGraphOptions = {}): Promise<GraphPick | null> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog notes-graph-dialog', 'aria-labelledby': 'notes-graph-title' });
    let view: RelationsView | undefined;
    const finish = (pick: GraphPick | null): void => {
      view?.dispose();
      dialog.close();
      dialog.remove();
      resolve(pick);
    };
    const graph = h('div', { class: 'notes-graph' }, h('p', { class: 'hint' }, ...busyText(t('folder.graphDrawing'))));
    // FOLDER-035: the notes around the open one, up to a depth, or the whole folder.
    const current = opts.current && data.nodes.some((n) => n.id === opts.current) ? opts.current : undefined;
    const around = h('input', { type: 'checkbox' });
    const depth = h('input', { type: 'number', min: '1', max: '9', value: '1', disabled: '', 'aria-label': t('folder.graphDepth') });
    const focus = (): void => {
      depth.disabled = !around.checked;
      view?.setFocus(around.checked && current ? current : null, Math.max(1, Math.min(9, Number(depth.value) || 1)));
    };
    around.addEventListener('change', focus);
    depth.addEventListener('input', focus);
    dialog.append(
      h('h2', { id: 'notes-graph-title' }, t('folder.graph')),
      h('p', { class: 'hint' }, t('folder.graphHint')),
      ...(current ? [h('p', { class: 'notes-graph-focus' }, h('label', {}, around, ` ${t('folder.graphAround', { name: noteName(current) })}`), ' ', h('label', {}, `${t('folder.graphDepth')} `, depth))] : []),
      graph,
      h('div', { class: 'dialog-actions' }, button(t('common.close'), () => finish(null))),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(null);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    if (!data.nodes.length) {
      graph.replaceChildren(h('p', { class: 'hint' }, t('folder.noNotes')));
      return;
    }
    void (async () => {
      try {
        const [engine, { RelationsView: View, RELATIONS_CSS }] = await Promise.all([loadAtlas(), import('@semanticatlas/core')]);
        if (!dialog.isConnected) return;
        graph.replaceChildren(h('style', {}, RELATIONS_CSS));
        view = new View(graph, engine, {
          labels: {
            list: t('folder.graphList'),
            note: t('folder.graphNote'),
            outgoing: t('folder.graphOutgoing'),
            incoming: t('folder.graphIncoming'),
            canvas: t('folder.graphCanvas'),
            summary: (notes, links, unresolved) => t('folder.graphSummary', { notes, links, unresolved }),
            selected: (label) => t('folder.graphSelected', { name: label }),
            unresolvedNote: t('folder.graphNotWritten'),
          },
          // Links to notes not written yet are drawn apart, as notes of their own.
          showUnresolved: true,
          onOpen: (id, info) => finish(info?.unresolved ? { create: id } : { open: id }),
        });
        view.setData(data);
        focus();
      } catch {
        graph.replaceChildren(h('p', { class: 'hint' }, t('code.dagFailed')));
      }
    })();
  });
}
