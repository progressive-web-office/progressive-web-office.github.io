/**
 * The pseudonymisation window (PSEUDO-002, PSEUDO-004, PSEUDO-016,
 * PSEUDO-017, PSEUDO-027..PSEUDO-029): the list of people, the mapping table,
 * the options, the files (the open document, or a folder to an output
 * folder), the run with its progress, and the report. The list, the table and
 * the reports stay in memory, and are forgotten when the window is closed or
 * the application locks.
 */
import { button, h, setStatus } from '../../app/dom';
import { t, type MessageKey } from '../../i18n';
import { saveFile } from '../../storage/file-io';
import { detectFormat } from '../../core/format';
import type { Markers, Person } from '../engine';
import { excludedInput, folderFiles, folderProblem, MARKER, writeOutput, type FolderHandle } from '../folders';
import { writePackage } from '../package/zip';
import { pseudonymiseFiles, reportJson, type FileReport, type InputFile, type RunReport } from '../pipeline';
import { readRoster, RosterError, type Roster } from '../roster';
import { loadOptions, parseList, saveOptions } from '../settings';
import { assignPseudonyms, expired, forgetTable, newTable, openTable, rememberedTable, rememberTable, saveTable, type PseudonymTable } from '../table';
import { ensureNotice, showNotice } from './notice';
import { renderReport } from './report';

export interface PseudoHost {
  host: HTMLElement;
  /** (a): the file of the open document, when there is one. */
  file?: InputFile;
  notify(message: string): void;
  /** Open an output in the application, read-only. */
  openOutput(name: string, bytes: Uint8Array): Promise<void>;
}

export function markers(): Markers {
  return {
    name: t('pseudo.marker.name'),
    person: t('pseudo.marker.person'),
    email: t('pseudo.marker.email'),
    phone: t('pseudo.marker.phone'),
    ine: t('pseudo.marker.ine'),
    number: t('pseudo.marker.number'),
    user: t('pseudo.marker.user'),
  };
}

interface DirectoryPickerWindow {
  showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FolderHandle>;
}

const field = (label: string, el: HTMLElement, hint?: string): HTMLElement =>
  h('label', { class: 'vault-field' }, h('span', {}, label), el, hint ? h('span', { class: 'hint' }, hint) : null);

const check = (label: string, value: boolean): HTMLInputElement => {
  const box = h('input', { type: 'checkbox' });
  box.checked = value;
  box.dataset.label = label;
  return box;
};

async function pickFile(accept: string, multiple = false, directory = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple: multiple || undefined, webkitdirectory: directory || undefined });
    input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

/** Files offered to the pseudonymisation (others in a folder are left out). */
const HANDLED = /\.(pdf|docx|dotx|odt|ott|xlsx|xltx|ods|ots|pptx|potx|odp|otp|md|markdown|txt|csv|tsv|tex|mdz)$/i;

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

const refusalText = (e: RosterError): string => t(`pseudo.list.${e.problem}` as MessageKey, { detail: e.detail });

export async function openPseudonymisation(ctx: PseudoHost): Promise<void> {
  if (!(await ensureNotice(ctx.host))) return;
  const options = loadOptions();
  const picker = (window as unknown as DirectoryPickerWindow).showDirectoryPicker;
  let roster: Roster | null = null;
  let listName = '';
  let listBytes = new Uint8Array();
  let table: PseudonymTable | null = null;
  let tableName = '';
  let tablePassword = '';
  let tableDirty = false;
  let input: FolderHandle | null = null;
  let output: FolderHandle | null = null;
  let pickedFiles: File[] = [];
  let report: RunReport | null = null;
  let people: Person[] = [];
  let disposeReport = (): void => {};
  let controller: AbortController | null = null;

  const dialog = h('dialog', { class: 'dialog pseudo-dialog', 'aria-labelledby': 'pseudo-title' });
  const body = h('div', { class: 'pseudo-body' });
  const actions = h('div', { class: 'dialog-actions' });
  const status = h('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });

  // 1. The list of people.
  const listStatus = h('p', { class: 'hint' });
  const listButton = button(t('pseudo.list.choose'), () => void chooseList());
  async function chooseList(): Promise<void> {
    const [file] = await pickFile('.csv,.tsv,.txt,text/csv');
    if (!file) return;
    try {
      listBytes = new Uint8Array(await file.arrayBuffer());
      roster = readRoster(listBytes);
      listName = file.name;
      const r = roster;
      const sep = r.separator === '\t' ? t('pseudo.list.tab') : `« ${r.separator} »`;
      listStatus.replaceChildren(
        t('pseudo.list.read', { n: r.people.length, name: file.name, sep, encoding: r.encoding, columns: Object.values(r.columns).join(', ') }),
        r.rejected.length ? h('br') : '',
        r.rejected.length ? t('pseudo.list.rejected', { lines: r.rejected.map((x) => x.line).join(', ') }) : '',
      );
      listStatus.classList.remove('error');
    } catch (e) {
      roster = null;
      setStatus(listStatus, e instanceof RosterError ? refusalText(e) : (e as Error).message, true);
    }
  }

  // 2. The mapping table.
  const tableStatus = h('p', { class: 'hint' });
  const password = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': t('pseudo.table.password') });
  const again = h('input', { type: 'password', autocomplete: 'new-password', 'aria-label': t('pseudo.table.passwordAgain') });
  const prefix = h('input', { type: 'text', value: 'ETU-', maxlength: '8', 'aria-label': t('pseudo.table.prefix') });
  const deleteAfter = h('input', { type: 'date', 'aria-label': t('pseudo.table.deleteAfter') });
  deleteAfter.value = newTable().deleteAfter;
  const keepReason = h('input', { type: 'text', 'aria-label': t('pseudo.table.keepReason') });
  const expiredBox = h('div', { class: 'pseudo-expired', hidden: true }, h('p', { class: 'hint error' }, t('pseudo.table.expired')), field(t('pseudo.table.keepReason'), keepReason));
  const newFields = h('div', { class: 'pseudo-new-table' }, field(t('pseudo.table.prefix'), prefix), field(t('pseudo.table.deleteAfter'), deleteAfter), field(t('pseudo.table.password'), password, t('pseudo.table.passwordHint')), field(t('pseudo.table.passwordAgain'), again));
  async function openTableFile(bytes: Uint8Array, name: string): Promise<void> {
    const pw = h('input', { type: 'password', autocomplete: 'current-password', 'aria-label': t('pseudo.table.password') });
    const ask = h('dialog', { class: 'dialog', 'aria-labelledby': 'pseudo-pw-title' });
    const err = h('p', { class: 'hint error', role: 'alert' });
    const done = new Promise<void>((resolve) => {
      const close = (): void => {
        ask.close();
        ask.remove();
        resolve();
      };
      const ok = async (): Promise<void> => {
        setStatus(err, t('pseudo.table.opening'));
        try {
          table = await openTable(bytes, pw.value);
          tableName = name;
          tablePassword = pw.value;
          close();
        } catch {
          setStatus(err, t('pseudo.table.wrong'), true);
        }
      };
      pw.addEventListener('keydown', (e) => e.key === 'Enter' && void ok());
      ask.append(h('h2', { id: 'pseudo-pw-title' }, t('pseudo.table.passwordTitle', { name })), field(t('pseudo.table.password'), pw), err, h('div', { class: 'dialog-actions' }, button(t('common.cancel'), close), button(t('common.open'), () => void ok(), { className: 'primary' })));
      ask.addEventListener('cancel', (e) => (e.preventDefault(), close()));
    });
    dialog.append(ask);
    ask.showModal();
    pw.focus();
    await done;
    showTable();
  }
  function showTable(): void {
    if (!table) return;
    newFields.hidden = true;
    tableStatus.textContent = t('pseudo.table.opened', { name: tableName, n: table.people.length, date: table.deleteAfter });
    expiredBox.hidden = !expired(table);
  }
  const tableButtons = h(
    'div',
    { class: 'dialog-actions start' },
    button(t('pseudo.table.open'), async () => {
      const [file] = await pickFile('.kdbx');
      if (file) await openTableFile(new Uint8Array(await file.arrayBuffer()), file.name);
    }),
  );
  const kept = await rememberedTable().catch(() => null);
  if (kept) {
    tableButtons.append(
      button(t('pseudo.table.useKept'), () => void openTableFile(kept, t('pseudo.table.keptName'))),
      button(t('pseudo.table.forgetKept'), (e) => {
        forgetTable();
        (e.currentTarget as HTMLElement).remove();
        ctx.notify(t('pseudo.table.forgotten'));
      }),
    );
  }

  // 3. Options.
  const lastAlone = check(t('pseudo.opt.lastAlone'), options.lastNameAlone);
  const firstAlone = check(t('pseudo.opt.firstAlone'), options.firstNameAlone);
  const pictures = check(t('pseudo.opt.pictures'), options.removePictures);
  const linkable = check(t('pseudo.opt.linkable'), options.removeLinkable);
  const exclusions = h('textarea', { rows: '2', 'aria-label': t('pseudo.opt.exclusions') });
  exclusions.value = options.exclusions.join(', ');
  const labels = h('textarea', { rows: '2', 'aria-label': t('pseudo.opt.labels') });
  labels.value = options.labels.join(', ');
  const commons = h('textarea', { rows: '2', 'aria-label': t('pseudo.opt.common') });
  commons.value = options.commonWords.join(', ');
  const box = (b: HTMLInputElement): HTMLElement => h('label', { class: 'pseudo-check' }, b, ` ${b.dataset.label ?? ''}`);

  // 4. Files.
  const filesBox = h('div', { class: 'pseudo-files' });
  if (ctx.file) filesBox.append(h('p', {}, t('pseudo.files.document', { name: ctx.file.name })));
  else if (picker) {
    const inLabel = h('span', { class: 'hint' });
    const outLabel = h('span', { class: 'hint' });
    filesBox.append(
      h('div', {}, button(t('pseudo.files.input'), async () => {
        try {
          input = await picker({ mode: 'read', id: 'pwo-pseudo-in' });
          inLabel.textContent = ` ${input.name}`;
        } catch {
          /* cancelled */
        }
      }), inLabel),
      h('div', {}, button(t('pseudo.files.output'), async () => {
        try {
          output = await picker({ mode: 'readwrite', id: 'pwo-pseudo-out' });
          outLabel.textContent = ` ${output.name}`;
        } catch {
          /* cancelled */
        }
      }), outLabel),
      h('p', { class: 'hint' }, t('pseudo.files.separate')),
    );
  } else {
    const label = h('span', { class: 'hint' });
    filesBox.append(
      h('div', {}, button(t('pseudo.files.input'), async () => {
        pickedFiles = await pickFile('', true, true);
        label.textContent = pickedFiles.length ? ` ${t('pseudo.files.count', { n: pickedFiles.length })}` : '';
      }), label),
      h('p', { class: 'hint' }, t('pseudo.files.zip')),
    );
  }

  const section = (title: string, ...kids: (Node | null)[]): HTMLElement => h('section', { class: 'pseudo-step' }, h('h3', {}, title), ...kids);
  const form = h(
    'div',
    {},
    h('p', { class: 'hint' }, t('pseudo.intro'), ' ', button(t('pseudo.notice.read'), () => void showNotice(dialog, false), { className: 'link' })),
    section(t('pseudo.step.list'), h('p', { class: 'hint' }, t('pseudo.list.hint')), listButton, listStatus),
    section(t('pseudo.step.table'), h('p', { class: 'hint' }, t('pseudo.table.hint')), tableButtons, tableStatus, expiredBox, newFields),
    section(
      t('pseudo.step.options'),
      box(lastAlone),
      box(firstAlone),
      box(pictures),
      box(linkable),
      h('details', {}, h('summary', {}, t('pseudo.opt.lists')), field(t('pseudo.opt.exclusions'), exclusions), field(t('pseudo.opt.labels'), labels), field(t('pseudo.opt.common'), commons)),
    ),
    section(t('pseudo.step.files'), filesBox),
  );
  body.append(form);

  const close = async (): Promise<void> => {
    if (tableDirty && !confirm(t('pseudo.table.unsaved'))) return;
    controller?.abort();
    disposeReport();
    dialog.close();
    dialog.remove();
    roster = null;
    table = null;
    report = null;
    people = [];
    tablePassword = '';
  };
  const run = button(t('pseudo.run'), () => void start(), { className: 'primary' });
  actions.append(button(t('common.close'), () => void close()), run);
  dialog.append(h('h2', { id: 'pseudo-title' }, t('pseudo.title')), body, status, actions);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    void close();
  });
  // The list and the table are forgotten when the application locks.
  const lockOff = (await import('../../lock/session')).onLockChange((open) => {
    if (!open) {
      tableDirty = false;
      void close();
    }
  });
  dialog.addEventListener('close', () => lockOff());

  async function start(): Promise<void> {
    if (!roster) return setStatus(status, t('pseudo.err.noList'), true);
    if (!table) {
      if (password.value.length < 10) return setStatus(status, t('pseudo.err.shortPassword'), true);
      if (password.value !== again.value) return setStatus(status, t('pseudo.err.mismatch'), true);
      const p = prefix.value.trim() || 'ETU-';
      if (!/^[\p{L}]{1,6}[-_]?$/u.test(p)) return setStatus(status, t('pseudo.err.prefix'), true);
      table = newTable(p);
      if (deleteAfter.value) table.deleteAfter = deleteAfter.value;
      tablePassword = password.value;
      tableName = `${t('pseudo.table.fileName')}-${new Date().toISOString().slice(0, 10)}.kdbx`;
    } else if (expired(table)) {
      if (!keepReason.value.trim()) return setStatus(status, t('pseudo.err.expired'), true);
      table.keepReason = keepReason.value.trim();
    }
    let files: InputFile[];
    let outputDir: FolderHandle | null = null;
    if (ctx.file) files = [ctx.file];
    else if (picker) {
      if (!input || !output) return setStatus(status, t('pseudo.err.folders'), true);
      const problem = await folderProblem(input, output);
      if (problem) return setStatus(status, t(`pseudo.folder.${problem}` as MessageKey), true);
      const tablePrefix = table.prefix;
      const found = await folderFiles(input, (path) => excludedInput(path, listName, tablePrefix));
      files = [];
      for (const f of found) {
        // The list itself, under another name, is not an input either.
        const blob = await f.file.getFile();
        if (blob.size === listBytes.length && sameBytes(new Uint8Array(await blob.arrayBuffer()), listBytes)) continue;
        files.push({ name: f.path, read: async () => new Uint8Array(await (await f.file.getFile()).arrayBuffer()) });
      }
      outputDir = output;
    } else {
      files = pickedFiles
        .map((f) => ({ name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, read: async () => new Uint8Array(await f.arrayBuffer()) }))
        .filter((f) => !excludedInput(f.name, listName, table!.prefix));
    }
    files = files.filter((f) => HANDLED.test(f.name));
    if (!files.length) return setStatus(status, t('pseudo.err.noFiles'), true);
    const opts = { ...options, lastNameAlone: lastAlone.checked, firstNameAlone: firstAlone.checked, removePictures: pictures.checked, removeLinkable: linkable.checked, exclusions: parseList(exclusions.value), labels: parseList(labels.value), commonWords: parseList(commons.value) };
    saveOptions(opts);
    people = assignPseudonyms(table, roster.people);
    tableDirty = true;
    run.disabled = true;
    controller = new AbortController();
    const cancel = button(t('common.cancel'), () => controller?.abort());
    actions.prepend(cancel);
    try {
      report = await pseudonymiseFiles(files, {
        people,
        options: opts,
        markers: markers(),
        signal: controller.signal,
        progress: (done, total, name) => setStatus(status, t('pseudo.progress', { n: Math.min(total, done + 1), total, name: name.split('/').pop() ?? name })),
      });
    } catch (e) {
      cancel.remove();
      run.disabled = false;
      return setStatus(status, (e as Error).name === 'AbortError' ? t('pseudo.cancelled') : (e as Error).message, (e as Error).name !== 'AbortError');
    }
    cancel.remove();
    // The outputs.
    const outputs = report.files.filter((f): f is FileReport & { output: string; outputBytes: Uint8Array } => !!f.output && !!f.outputBytes);
    if (outputDir) {
      await writeOutput(outputDir, MARKER, new TextEncoder().encode('Progressive Web Office: pseudonymised copies. The mapping table is kept elsewhere, encrypted.\n'));
      for (const f of outputs) await writeOutput(outputDir, f.output, f.outputBytes);
    }
    for (const f of outputs) table.files.push({ source: f.source, output: f.output, date: report.date.slice(0, 10), people: f.attribution.people.map((p) => p.key) });
    table.reports.push({ date: report.date, json: reportJson(report) });
    showReport(outputs.length, !!outputDir);
  }

  function showReport(n: number, written: boolean): void {
    if (!report || !table) return;
    const view = renderReport(report, people, dialog, (f) => void ctx.openOutput(f.output!, f.outputBytes!));
    disposeReport = view.dispose;
    body.replaceChildren(view.element);
    setStatus(status, written ? t('pseudo.done.written', { n }) : t('pseudo.done', { n }));
    const lockSet = h('input', { type: 'checkbox' });
    const saveTableButton = button(t('pseudo.table.save'), async () => {
      setStatus(status, t('pseudo.table.saving'));
      const bytes = await saveTable(table!, tablePassword);
      if (lockSet.checked) await rememberTable(bytes);
      if (await saveFile(bytes, tableName.endsWith('.kdbx') ? tableName : `${tableName}.kdbx`, 'kdbx')) {
        tableDirty = false;
        setStatus(status, t('pseudo.table.saved'));
      } else setStatus(status, t('pseudo.table.notSaved'), true);
    }, { className: 'primary' });
    const outputsButton = button(t('pseudo.done.download'), async () => {
      const outs = report!.files.filter((f) => f.output && f.outputBytes);
      if (outs.length === 1) {
        const f = outs[0]!;
        const format = detectFormat(f.output!, f.outputBytes!) ?? 'text';
        await saveFile(f.outputBytes!, f.output!, format, { mimeType: 'application/octet-stream', extension: f.output!.split('.').pop() ?? '' });
      } else {
        const zip = writePackage(outs.map((f) => ({ name: f.output!, data: f.outputBytes!, stored: false })));
        await saveFile(zip, `${t('pseudo.done.zipName')}.zip`, 'texzip', { mimeType: 'application/zip', extension: 'zip' });
      }
    });
    actions.replaceChildren(button(t('common.close'), () => void close()), ...(written ? [] : [outputsButton]), saveTableButton);
    void import('../../lock/session').then((lock) => {
      if (lock.lockSet()) actions.prepend(h('label', { class: 'pseudo-check' }, lockSet, ` ${t('pseudo.table.keep')}`));
    });
  }

  ctx.host.append(dialog);
  dialog.showModal();
}
