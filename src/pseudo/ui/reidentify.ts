/**
 * PSEUDO-030: re-identification of what comes back — a pasted text, or a
 * file (DOCX, ODT, Markdown, text) — with the mapping table opened here.
 */
import { button, h, setStatus } from '../../app/dom';
import { detectFormat } from '../../core/format';
import { t } from '../../i18n';
import { saveFile } from '../../storage/file-io';
import { reidentifyFile } from '../pipeline';
import { createReidentifier } from '../reidentify';
import { openTable, rememberedTable, type PseudonymTable } from '../table';

export async function openReidentification(host: HTMLElement): Promise<void> {
  let table: PseudonymTable | null = null;
  const dialog = h('dialog', { class: 'dialog pseudo-dialog', 'aria-labelledby': 'pseudo-reid-title' });
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const password = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': t('pseudo.table.password') });
  let tableBytes: Uint8Array | null = null;
  const tableLabel = h('span', { class: 'hint' });
  const source = h('textarea', { rows: '8', 'aria-label': t('pseudo.reid.paste') });
  const result = h('textarea', { rows: '8', readonly: true, 'aria-label': t('pseudo.reid.result') });
  const unknown = h('p', { class: 'hint' });

  const ready = async (): Promise<boolean> => {
    if (table) return true;
    if (!tableBytes) return setStatus(status, t('pseudo.reid.noTable'), true), false;
    try {
      table = await openTable(tableBytes, password.value);
      setStatus(status, t('pseudo.table.opened', { name: tableLabel.textContent?.trim() ?? '', n: table.people.length, date: table.deleteAfter }));
      return true;
    } catch {
      setStatus(status, t('pseudo.table.wrong'), true);
      return false;
    }
  };
  const showUnknown = (list: string[]): void => void (unknown.textContent = list.length ? t('pseudo.reid.unknown', { list: [...new Set(list)].join(', ') }) : '');

  const chooseTable = button(t('pseudo.table.open'), () => {
    const input = h('input', { type: 'file', accept: '.kdbx' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f) return;
      tableBytes = new Uint8Array(await f.arrayBuffer());
      table = null;
      tableLabel.textContent = ` ${f.name}`;
    });
    input.click();
  });
  const kept = await rememberedTable().catch(() => null);
  const useKept = kept
    ? button(t('pseudo.table.useKept'), () => {
        tableBytes = kept;
        table = null;
        tableLabel.textContent = ` ${t('pseudo.table.keptName')}`;
      })
    : null;

  const textButton = button(t('pseudo.reid.text'), async () => {
    if (!(await ready())) return;
    const r = createReidentifier(table!.people, table!.prefix).text(source.value);
    result.value = r.text;
    showUnknown(r.unknown);
    setStatus(status, t('pseudo.reid.done', { n: [...r.replaced.values()].reduce((a, b) => a + b, 0) }));
  }, { className: 'primary' });
  const copyButton = button(t('pseudo.reid.copy'), () => void navigator.clipboard?.writeText(result.value));
  const fileButton = button(t('pseudo.reid.file'), () => {
    const input = h('input', { type: 'file', accept: '.docx,.odt,.ods,.odp,.xlsx,.pptx,.md,.txt,.csv,.tex,.mdz' });
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      if (!f || !(await ready())) return;
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const r = await reidentifyFile(f.name, bytes, table!.people, table!.prefix);
        showUnknown(r.unknown);
        const format = detectFormat(f.name, r.bytes) ?? 'text';
        const name = f.name.replace(/(\.[^.]+)?$/, (ext) => `-${t('pseudo.reid.suffix')}${ext}`);
        await saveFile(r.bytes, name, format, { mimeType: 'application/octet-stream', extension: name.split('.').pop() ?? '' });
        setStatus(status, t('pseudo.reid.done', { n: r.replaced }));
      } catch (e) {
        setStatus(status, (e as Error).message, true);
      }
    });
    input.click();
  });
  const close = (): void => {
    table = null;
    tableBytes = null;
    dialog.close();
    dialog.remove();
  };
  dialog.append(
    h('h2', { id: 'pseudo-reid-title' }, t('pseudo.reid.title')),
    h('p', { class: 'hint' }, t('pseudo.reid.hint')),
    h('div', { class: 'dialog-actions start' }, chooseTable, useKept, tableLabel),
    h('label', { class: 'vault-field' }, h('span', {}, t('pseudo.table.password')), password),
    h('label', { class: 'vault-field' }, h('span', {}, t('pseudo.reid.paste')), source),
    h('div', { class: 'dialog-actions start' }, textButton, fileButton),
    h('label', { class: 'vault-field' }, h('span', {}, t('pseudo.reid.result')), result),
    h('div', { class: 'dialog-actions start' }, copyButton),
    unknown,
    status,
    h('div', { class: 'dialog-actions' }, button(t('common.close'), close)),
  );
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  host.append(dialog);
  dialog.showModal();
}
