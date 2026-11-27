/**
 * NOTE-004..NOTE-006: a `.base` file shown as views of the notes of the
 * folder — its views as tabs, a table or cards, sections by the grouping
 * value, a click on a column to sort by it (written back into the file on
 * save), a cell changed writing the property into the note. What the file
 * holds that is not supported is listed above the view, never ignored.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import type { EditorView, ViewContext } from '../app/views';
import { withValues } from '../pim/notes';
import { show, type Value } from './base-expr';
import { baseNotes, columnLabel, editableColumn, plainKey, readBase, runView, withSort, type BaseNote, type BaseRow, type BaseSort, type BaseSpec, type Cell } from './bases';
import type { NoteStore } from './notes-view';

const LINK = /^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]$/;

export class BasesView implements EditorView {
  readonly element: HTMLElement;
  private text: string;
  private spec: BaseSpec;
  private notes: BaseNote[] = [];
  private current = 0;
  private count = 0;
  private readOnly = false;
  private readonly bar = h('div', { class: 'notes-view-bar', role: 'toolbar', 'aria-label': t('bases.toolbar') });
  private readonly tabs = h('div', { class: 'notes-view-layouts', role: 'tablist', 'aria-label': t('bases.views') });
  private readonly info = h('div', { class: 'hint notes-view-info', role: 'status' });
  private readonly body = h('div', { class: 'notes-view-body' });

  constructor(
    bytes: Uint8Array,
    private readonly ctx: ViewContext,
    private readonly fileName: string,
  ) {
    this.text = new TextDecoder().decode(bytes);
    this.spec = readBase(this.text);
    this.element = h('section', { class: 'notes-view bases-view', 'aria-label': this.title() }, this.bar, this.info, this.body);
  }

  private get store(): NoteStore | undefined {
    return this.ctx.noteStore?.();
  }

  private title(): string {
    return this.fileName.replace(/^.*\//, '').replace(/\.base$/i, '');
  }

  mounted(): void {
    void this.reload();
  }

  status(): string {
    return t('bases.count', { n: this.count });
  }

  formatLabel(): string {
    return t('bases.format');
  }

  save(): Uint8Array {
    return new TextEncoder().encode(this.text);
  }

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.render();
  }

  destroy(): void {
    this.element.remove();
  }

  async reload(attempt = 0): Promise<void> {
    const store = this.store;
    if (!store) {
      this.notes = [];
      this.render();
      // Opened from the folder: the shell tells where the file is just after showing it.
      if (attempt < 20 && this.element.isConnected) setTimeout(() => void this.reload(attempt + 1), 100);
      return;
    }
    try {
      this.notes = baseNotes(await store.tables());
    } catch (err) {
      this.ctx.notify?.((err as Error).message);
    }
    this.render();
  }

  private render(): void {
    this.renderBar();
    const store = this.store;
    if (!store) {
      this.info.textContent = t('views.noFolder');
      this.body.replaceChildren();
      this.count = 0;
      this.ctx.statusChanged();
      return;
    }
    const result = runView(this.spec, this.current, this.notes, Date.now(), store.path);
    this.count = result.rows.length;
    // NOTE-005: what is not supported is said, with what it does instead.
    this.info.replaceChildren(
      ...(result.unsupported.length
        ? [h('p', {}, t('bases.unsupported')), h('ul', { class: 'bases-unsupported' }, ...result.unsupported.map((u) => h('li', {}, u)))]
        : []),
      ...(result.view.limit && result.total > result.rows.length ? [h('p', {}, t('bases.limited', { n: result.rows.length, total: result.total }))] : []),
    );
    this.info.classList.toggle('error', result.unsupported.length > 0);
    const show = (rows: BaseRow[]): HTMLElement => (result.view.type === 'cards' ? this.cards(rows, result.columns) : this.table(rows, result.columns, result.view.sort));
    if (!result.rows.length) this.body.replaceChildren(h('p', { class: 'hint' }, t('views.empty')));
    else if (result.groups) {
      const prop = result.view.groupBy!.property;
      this.body.replaceChildren(
        ...result.groups.map((g) =>
          h(
            'section',
            { class: 'bases-group', 'aria-label': `${columnLabel(this.spec, prop)}: ${g.value || t('views.noValue')}` },
            h('h3', {}, `${columnLabel(this.spec, prop)}: ${g.value || t('views.noValue')} `, h('span', { class: 'notes-board-count' }, String(g.rows.length))),
            show(g.rows),
          ),
        ),
      );
    } else this.body.replaceChildren(show(result.rows));
    this.ctx.statusChanged();
  }

  private renderBar(): void {
    this.tabs.replaceChildren(
      ...this.spec.views.map((v, i) => {
        const tab = button(v.name, () => {
          this.current = i;
          this.render();
        }, { icon: v.type === 'cards' ? '▤' : '▦' });
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(i === this.current));
        return tab;
      }),
    );
    this.bar.replaceChildren(h('h2', {}, this.title()), this.tabs, button(t('views.refresh'), () => void this.reload(), { text: '⟳' }));
  }

  // --- values -------------------------------------------------------------------

  private value(v: Value, column: string): Node[] {
    if (Array.isArray(v)) return v.flatMap((x, i) => (i ? [document.createTextNode(', '), ...this.value(x, column)] : this.value(x, column)));
    if (typeof v === 'boolean') return [document.createTextNode(v ? '✓' : '✗')];
    const s = show(v);
    const link = LINK.exec(s);
    if (link) {
      const name = link[1]!.trim().toLowerCase();
      const target = this.notes.find((n) => n.name.toLowerCase() === name || n.path.replace(/\.md$/i, '').toLowerCase() === name);
      return [target ? button(link[2] ?? link[1]!, () => this.store?.open(target.path), { className: 'link' }) : h('span', { class: 'notes-view-unresolved' }, link[2] ?? link[1]!)];
    }
    if (column === 'file.tags' || plainKey(column) === 'tags') return [h('span', { class: 'note-chip tag' }, `#${s.replace(/^#/, '')}`)];
    return [document.createTextNode(s)];
  }

  private cell(c: Cell | undefined, r: BaseRow, column: string): Node[] {
    if (!c) return [];
    if ('unsupported' in c) return [h('span', { class: 'bases-unsupported-cell', title: c.unsupported }, `⚠ ${t('bases.notSupported')}`)];
    if (column === 'file.name' || column === 'file.basename') return [button(show(c.value), () => this.store?.open(r.note.path), { className: 'link notes-view-name' })];
    return this.value(c.value, column);
  }

  /** NOTE-006: a property written into the note, then shown. */
  private async setValue(r: BaseRow, column: string, value: string | string[] | undefined): Promise<void> {
    const store = this.store;
    if (!store) return;
    const k = plainKey(column).toLowerCase();
    try {
      const text = await store.read(r.note.path);
      const key = r.note.keys.get(k) ?? plainKey(column);
      const updated = withValues(text, [[key, value]]);
      if (updated !== text) await store.write(r.note.path, updated);
      const list = value === undefined ? [] : Array.isArray(value) ? value : [value];
      if (list.length) r.note.props.set(k, list);
      else r.note.props.delete(k);
      if (k === 'tags') r.note.tags = [];
      r.note.keys.set(k, key);
    } catch (err) {
      this.ctx.notify?.((err as Error).message);
    }
    this.render();
  }

  private editCell(cell: HTMLElement, r: BaseRow, column: string): void {
    if (this.readOnly || !editableColumn(column) || cell.querySelector('input')) return;
    const vs = (r.note.props.get(plainKey(column).toLowerCase()) ?? []).map(String);
    const isList = vs.length > 1 || plainKey(column).toLowerCase() === 'tags';
    const label = columnLabel(this.spec, column);
    const input = h('input', { type: 'text', value: vs.join(', '), 'aria-label': t('views.cellEdit', { column: label, name: r.note.name }) });
    cell.replaceChildren(h('div', { class: 'notes-view-cell-edit' }, input));
    input.focus();
    input.select();
    let done = false;
    const finish = (save: boolean): void => {
      if (done) return;
      done = true;
      if (!save) return this.render();
      const raw = input.value.trim();
      void this.setValue(r, column, !raw ? undefined : isList ? raw.split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean) : raw);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finish(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /** Sort by a column: ascending, then descending at the second click (saved with the file). */
  private sortBy(column: string, current: BaseSort[]): void {
    const desc = current[0]?.property === column && current[0].direction === 'ASC';
    const sort: BaseSort[] = [{ property: column, direction: desc ? 'DESC' : 'ASC' }];
    this.text = withSort(this.text, this.current, sort);
    this.spec = readBase(this.text);
    this.ctx.changed();
    this.render();
  }

  // --- table and cards -------------------------------------------------------------

  private table(rows: BaseRow[], columns: string[], sort: BaseSort[]): HTMLElement {
    const head = h(
      'tr',
      {},
      ...columns.map((c) => {
        const label = columnLabel(this.spec, c);
        const on = sort[0]?.property === c ? sort[0].direction : undefined;
        return h(
          'th',
          { scope: 'col', 'aria-sort': on === 'ASC' ? 'ascending' : on === 'DESC' ? 'descending' : 'none' },
          button(t('views.sortBy', { column: label }), () => this.sortBy(c, sort), { text: `${label}${on === 'ASC' ? ' ▲' : on === 'DESC' ? ' ▼' : ''}` }),
        );
      }),
    );
    const body = rows.map((r) =>
      h(
        'tr',
        {},
        ...columns.map((c, i) => {
          const cell = h(i === 0 ? 'th' : 'td', { ...(i === 0 ? { scope: 'row' } : {}), 'data-column': c }, ...this.cell(r.cells.get(c), r, c));
          if (!this.readOnly && editableColumn(c)) {
            cell.tabIndex = 0;
            cell.classList.add('editable');
            cell.title = t('views.cellEdit', { column: columnLabel(this.spec, c), name: r.note.name });
            cell.addEventListener('dblclick', () => this.editCell(cell, r, c));
            cell.addEventListener('keydown', (e) => {
              if ((e.key === 'Enter' || e.key === 'F2') && e.target === cell) {
                e.preventDefault();
                this.editCell(cell, r, c);
              }
            });
          }
          return cell;
        }),
      ),
    );
    return h('div', { class: 'notes-view-scroll' }, h('table', { class: 'notes-table', 'aria-label': this.spec.views[this.current]?.name ?? this.title() }, h('thead', {}, head), h('tbody', {}, ...body)));
  }

  private cards(rows: BaseRow[], columns: string[]): HTMLElement {
    const fields = columns.filter((c) => c !== 'file.name' && c !== 'file.basename');
    return h(
      'div',
      { class: 'notes-cards' },
      ...rows.map((r) => {
        const shown = fields.filter((c) => {
          const v = r.cells.get(c);
          return v && ('unsupported' in v || (v.value !== null && !(Array.isArray(v.value) && !v.value.length)));
        });
        return h(
          'article',
          { class: 'notes-card', 'aria-label': r.note.name },
          h('h3', {}, button(r.note.name, () => this.store?.open(r.note.path), { className: 'link notes-view-name' })),
          shown.length ? h('dl', {}, ...shown.flatMap((c) => [h('dt', {}, columnLabel(this.spec, c)), h('dd', {}, ...this.cell(r.cells.get(c), r, c))])) : '',
        );
      }),
    );
  }
}
