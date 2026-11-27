/**
 * The list step of the pseudonymisation window (PSEUDO-004, PSEUDO-005,
 * PSEUDO-036..PSEUDO-039): a CSV, Excel or OpenDocument file (or the open
 * spreadsheet), its sheet chosen (the first by default), its header row, the
 * columns of the names (two columns or one), of the e-mail and of the number,
 * and a preview of the people as they will be read.
 */
import { button, h, setStatus } from '../../app/dom';
import { t, type MessageKey } from '../../i18n';
import { applyMapping, colLetter, guessMapping, readListSource, RosterError, type ColumnMapping, type ListSheet, type ListSource, type NameOrder, type Roster } from '../roster';
import { rememberColumns, rememberedColumns } from '../settings';

export interface ListStep {
  element: HTMLElement;
  /** The people as read with the columns chosen, or null. */
  roster(): Roster | null;
  /** Name and bytes of the list file (never taken as an input). */
  file(): { name: string; bytes: Uint8Array } | null;
  /** PSEUDO-038: keep the columns chosen for these headers. */
  remember(): void;
}

const PREVIEW = 10;
const HEADER_ROWS = 10;

export function createListStep(pick: (accept: string) => Promise<File | undefined>, openSpreadsheet?: { name: string; read(): Promise<Uint8Array> }): ListStep {
  let source: ListSource | null = null;
  let sheet: ListSheet | null = null;
  let mapping: ColumnMapping | null = null;
  let roster: Roster | null = null;
  let file: { name: string; bytes: Uint8Array } | null = null;

  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const editor = h('div', { class: 'pseudo-list-editor', hidden: true });
  const preview = h('div', { class: 'pseudo-list-preview' });

  async function load(name: string, bytes: Uint8Array): Promise<void> {
    try {
      source = await readListSource(bytes, name);
      file = { name, bytes };
      // Q3: the first sheet by default; the user chooses another one.
      choose(0);
    } catch (e) {
      source = null;
      sheet = null;
      roster = null;
      editor.hidden = true;
      setStatus(status, e instanceof RosterError ? t(`pseudo.list.${e.problem}` as MessageKey, { detail: e.detail }) : (e as Error).message, true);
    }
  }

  function choose(index: number): void {
    if (!source) return;
    sheet = source.sheets[index] ?? null;
    if (!sheet) return;
    mapping = guessMapping(sheet);
    const headers = mapping.header >= 0 ? (sheet.rows[mapping.header] ?? []) : [];
    const kept = headers.length ? rememberedColumns(headers) : undefined;
    if (kept) mapping = { header: mapping.header, ...kept };
    renderEditor(index);
  }

  const columnCount = (): number => Math.max(0, ...(sheet?.rows.map((r) => r.length) ?? [0]));
  const columnLabel = (i: number): string => {
    const head = mapping && mapping.header >= 0 ? sheet?.rows[mapping.header]?.[i] : undefined;
    const sample = sheet?.rows.find((r, k) => k > (mapping?.header ?? -1) && r[i]?.trim())?.[i];
    return `${colLetter(i)} — ${head?.trim() || sample?.trim() || t('pseudo.list.emptyColumn')}`;
  };

  function columnSelect(role: 'lastName' | 'firstName' | 'fullName' | 'email' | 'number', label: string): HTMLElement {
    const select = h('select', { 'aria-label': label }, h('option', { value: '' }, t('pseudo.list.noColumn')));
    for (let i = 0; i < columnCount(); i++) select.append(h('option', { value: String(i), selected: mapping?.[role] === i }, columnLabel(i)));
    select.addEventListener('change', () => {
      if (!mapping) return;
      if (select.value === '') delete mapping[role];
      else mapping[role] = Number(select.value);
      update();
    });
    return h('label', { class: 'vault-field' }, h('span', {}, label), select);
  }

  function renderEditor(sheetIndex: number): void {
    if (!source || !sheet || !mapping) return;
    const m = mapping;
    const parts: HTMLElement[] = [];
    if (source.sheets.length > 1) {
      const select = h('select', { 'aria-label': t('pseudo.list.sheet') }, ...source.sheets.map((s, i) => h('option', { value: String(i), selected: i === sheetIndex }, s.name)));
      select.addEventListener('change', () => choose(Number(select.value)));
      parts.push(h('label', { class: 'vault-field' }, h('span', {}, t('pseudo.list.sheet')), select));
    }
    const header = h('select', { 'aria-label': t('pseudo.list.header') }, h('option', { value: '-1', selected: m.header < 0 }, t('pseudo.list.noHeader')));
    for (let r = 0; r < Math.min(HEADER_ROWS, sheet.rows.length); r++) {
      const text = (sheet.rows[r] ?? []).filter((c) => c.trim()).join(' · ').slice(0, 60);
      header.append(h('option', { value: String(r), selected: r === m.header }, t('pseudo.list.row', { n: r + 1, text })));
    }
    header.addEventListener('change', () => {
      if (!mapping) return;
      mapping.header = Number(header.value);
      renderEditor(sheetIndex);
    });
    parts.push(h('label', { class: 'vault-field' }, h('span', {}, t('pseudo.list.header')), header));
    // PSEUDO-037: two columns, or one column of full names — it depends on the file.
    const one = m.fullName !== undefined;
    const mode = (value: 'two' | 'one', label: string): HTMLElement => {
      const radio = h('input', { type: 'radio', name: 'pseudo-names', value, checked: (value === 'one') === one });
      radio.addEventListener('change', () => {
        if (!mapping) return;
        if (value === 'one') {
          mapping.fullName = mapping.lastName ?? mapping.firstName ?? 0;
          delete mapping.lastName;
          delete mapping.firstName;
        } else {
          mapping.lastName = mapping.fullName ?? 0;
          delete mapping.fullName;
        }
        renderEditor(sheetIndex);
      });
      return h('label', { class: 'pseudo-check' }, radio, ` ${label}`);
    };
    parts.push(h('div', { role: 'radiogroup', 'aria-label': t('pseudo.list.names') }, mode('two', t('pseudo.list.twoColumns')), mode('one', t('pseudo.list.oneColumn'))));
    if (one) {
      const order = h(
        'select',
        { 'aria-label': t('pseudo.list.order') },
        ...(['auto', 'last-first', 'first-last'] as NameOrder[]).map((o) => h('option', { value: o, selected: m.order === o }, t(`pseudo.list.order.${o}` as MessageKey))),
      );
      order.addEventListener('change', () => {
        if (!mapping) return;
        mapping.order = order.value as NameOrder;
        update();
      });
      parts.push(columnSelect('fullName', t('pseudo.list.col.fullName')), h('label', { class: 'vault-field' }, h('span', {}, t('pseudo.list.order')), order));
    } else parts.push(columnSelect('lastName', t('pseudo.list.col.lastName')), columnSelect('firstName', t('pseudo.list.col.firstName')));
    parts.push(columnSelect('email', t('pseudo.list.col.email')), columnSelect('number', t('pseudo.list.col.number')));
    editor.replaceChildren(h('div', { class: 'pseudo-list-columns' }, ...parts), preview);
    editor.hidden = false;
    update();
  }

  function update(): void {
    if (!sheet || !mapping || !source) return;
    try {
      roster = applyMapping(sheet, mapping);
      if (source.separator) roster.separator = source.separator;
      if (source.encoding) roster.encoding = source.encoding;
      const r = roster;
      const head = h('tr', {}, ...[t('pseudo.list.col.lastName'), t('pseudo.list.col.firstName'), t('pseudo.list.col.email'), t('pseudo.list.col.number')].map((x) => h('th', {}, x)));
      const rows = r.people.slice(0, PREVIEW).map((p) => h('tr', {}, h('td', {}, p.lastName), h('td', {}, p.firstName), h('td', {}, p.email ?? ''), h('td', {}, p.number ?? '')));
      preview.replaceChildren(h('table', { class: 'pseudo-list-table', 'aria-label': t('pseudo.list.preview') }, h('thead', {}, head), h('tbody', {}, ...rows)));
      const lines: (string | Node)[] = [t('pseudo.list.read', { n: r.people.length, name: file?.name ?? '' })];
      if (source.format === 'csv') lines.push(' ', t('pseudo.list.csvInfo', { sep: source.separator === '\t' ? t('pseudo.list.tab') : `« ${source.separator} »`, encoding: source.encoding ?? '' }));
      if (r.rejected.length) lines.push(h('br'), t('pseudo.list.rejected', { lines: r.rejected.map((x) => x.line).join(', ') }));
      if (r.leadingZeros) lines.push(h('br'), t('pseudo.list.leadingZeros'));
      status.replaceChildren(...lines);
      status.classList.remove('error');
    } catch (e) {
      roster = null;
      preview.replaceChildren();
      setStatus(status, e instanceof RosterError ? t(`pseudo.list.${e.problem}` as MessageKey, { detail: e.detail }) : (e as Error).message, true);
    }
  }

  const choose_ = button(t('pseudo.list.choose'), async () => {
    const f = await pick('.csv,.tsv,.txt,.xlsx,.xltx,.ods,.ots,text/csv');
    if (f) await load(f.name, new Uint8Array(await f.arrayBuffer()));
  });
  const fromOpen = openSpreadsheet ? button(t('pseudo.list.useOpen', { name: openSpreadsheet.name }), async () => load(openSpreadsheet.name, await openSpreadsheet.read())) : null;

  return {
    element: h('div', {}, h('p', { class: 'hint' }, t('pseudo.list.hint')), h('div', { class: 'dialog-actions start' }, choose_, fromOpen), status, editor),
    roster: () => roster,
    file: () => file,
    remember: () => {
      if (sheet && mapping && mapping.header >= 0) rememberColumns(sheet.rows[mapping.header] ?? [], mapping);
    },
  };
}
