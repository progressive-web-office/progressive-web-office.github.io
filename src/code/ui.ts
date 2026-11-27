/** Code cell controls and dialogs (CODE-001, CODE-004). */
import type { SmartComplete } from './completion';
import { t } from '../i18n';
import { button, h } from '../app/dom';
import type { CodeLang } from '../document/model';
import { isRunLang, LANG_LABEL, RUN_LANGS, SHOW_LANGS } from '../document/code-langs';

export { LANG_LABEL };

/** Add the Run / Edit bar to every cell under `root` that has none. */
export function decorateCells(root: HTMLElement): void {
  for (const cell of Array.from(root.querySelectorAll<HTMLElement>('.code-cell'))) {
    if (cell.querySelector(':scope > .code-cell-bar')) continue;
    const lang = (cell.dataset.lang ?? 'python') as CodeLang;
    const action = (name: string, text: string, label: string): HTMLButtonElement => {
      const b = button(label, () => undefined, { text, title: label, className: `code-cell-${name}` });
      b.dataset.action = name;
      b.contentEditable = 'false';
      return b;
    };
    cell.prepend(
      h(
        'span',
        { class: 'code-cell-bar', contenteditable: 'false' },
        h('span', { class: 'code-cell-lang', ...(isRunLang(lang) ? {} : { title: t('code.showOnly') }) }, lang === 'math' ? `${LANG_LABEL.math} · SymPy` : (LANG_LABEL[lang] ?? lang), cell.classList.contains('code-hidden') ? h('span', { class: 'code-cell-hidden-note' }, ` · ${t('code.hiddenNote')}`) : ''),
        action('toggle-code', cell.classList.contains('code-hidden') ? '👁' : '🙈', t(cell.classList.contains('code-hidden') ? 'code.showCode' : 'code.hideCode')),
        // DOC-038: a Julia cell of a KaimonSlate notebook shows its header (id, tags); it runs in KaimonSlate.
        ...(lang === 'julia' && cell.dataset.header !== undefined
          ? [h('span', { class: 'code-cell-header', title: t('kslate.runHint') }, `#%% ${cell.dataset.header}`)]
          : // CODE-020: code of a language not run here: shown and edited only.
            !isRunLang(lang)
            ? []
            : [
              action('run', '▶', t('code.run')),
              action('run-all', '⏩', t('code.runAll')),
              action('stop', '■', t('code.stop')),
              // CODE-015: where the cell is in the dependency graph.
              action('graph', '🔀', t('code.dagCell')),
            ]),
        action('edit', '✎', t('code.edit')),
      ),
    );
    // The code in colours, once its grammar is loaded.
    const source = cell.querySelector<HTMLElement>(':scope > .code-cell-source');
    // CAS-001: the equation of a math cell is drawn by MathLive, not coloured.
    if (source?.textContent && lang !== 'math') void import('./highlight').then(({ highlightInto }) => highlightInto(source, source.textContent ?? '', lang));
  }
}

/** Show progress or the result text in the cell's output area. */
export function setCellStatus(cell: HTMLElement, text: string): void {
  let output = cell.querySelector<HTMLElement>(':scope > .code-cell-output');
  if (!output) {
    output = h('span', { class: 'code-cell-output' });
    cell.append(output);
  }
  output.classList.remove('error');
  output.classList.add('pending');
  // UI-019: a spinner while the cell waits or runs.
  output.replaceChildren(h('span', { class: 'spinner', 'aria-hidden': 'true' }), text);
  cell.querySelector(':scope > .code-cell-figures')?.remove();
}

export interface CellValue {
  lang: CodeLang;
  code: string;
  /** The language cannot change (a cell of a KaimonSlate notebook). */
  fixedLang?: boolean;
}

function modal(host: HTMLElement, titleId: string): { dialog: HTMLDialogElement; show(): void; close(): void } {
  const dialog = h('dialog', { class: 'dialog code-dialog', 'aria-labelledby': titleId });
  return {
    dialog,
    show() {
      host.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    },
    close() {
      dialog.close();
      dialog.remove();
    },
  };
}

/**
 * Insert or edit a cell. Resolves to null when cancelled. `complete` gives
 * the completions of the running interpreter (CODE-011).
 */
/** Edit a cell, or insert one (`isNew`, by default when there is no `initial` value: a language may be given). */
export async function editCell(host: HTMLElement, initial?: CellValue, complete?: SmartComplete, isNew = !initial): Promise<CellValue | null> {
  const { createCellEditor } = await import('./cell-editor');
  return new Promise((resolve) => {
    const m = modal(host, 'code-title');
    // CODE-020: the languages run here, then those shown and edited only, by name.
    const option = (l: CodeLang) => h('option', { value: l }, LANG_LABEL[l]);
    const byName = (a: CodeLang, b: CodeLang) => LANG_LABEL[a].localeCompare(LANG_LABEL[b]);
    const lang = h(
      'select',
      { 'aria-label': t('code.language') },
      ...(initial?.fixedLang
        ? [option(initial.lang)]
        : [h('optgroup', { label: t('code.groupRun') }, ...RUN_LANGS.filter((l) => l !== 'math').map(option)), h('optgroup', { label: t('code.groupShow') }, ...[...SHOW_LANGS].sort(byName).map(option))]),
    );
    lang.value = initial?.lang ?? 'python';
    const hint = h('p', { class: 'hint' });
    const showHint = (): void => void (hint.textContent = isRunLang(lang.value) ? t('code.hint') : t('code.hintShowOnly', { lang: LANG_LABEL[lang.value as CodeLang] }));
    showHint();
    const source = h('div', { class: 'code-source' });
    const editor = createCellEditor(source, { doc: initial?.code ?? '', lang: lang.value as CodeLang, label: t('code.source'), ...(complete ? { complete } : {}) });
    lang.addEventListener('change', () => {
      editor.setLanguage(lang.value as CodeLang);
      showHint();
    });
    const finish = (ok: boolean): void => {
      const code = editor.value().replace(/\s+$/, '');
      editor.destroy();
      m.close();
      resolve(ok ? { lang: lang.value as CodeLang, code } : null);
    };
    m.dialog.append(
      h('h2', { id: 'code-title' }, isNew ? t('code.insertTitle') : t('code.editTitle')),
      h('label', { class: 'code-lang-label' }, `${t('code.language')} `, lang),
      source,
      hint,
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(false)),
        button(isNew ? t('code.insert') : t('code.update'), () => finish(true), { className: 'primary' }),
      ),
    );
    m.dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    m.show();
    setTimeout(() => editor.focus(), 0);
  });
}

/** CODE-004: explain what running the document's code means before the first run. */
export function confirmRun(host: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal(host, 'code-trust-title');
    const finish = (ok: boolean): void => {
      m.close();
      resolve(ok);
    };
    m.dialog.append(
      h('h2', { id: 'code-trust-title' }, t('code.trustTitle')),
      h('p', {}, t('code.trustSandbox')),
      h('p', {}, t('code.trustPackages')),
      h('p', {}, t('code.trustAdvice')),
      h(
        'div',
        { class: 'dialog-actions' },
        button(t('common.cancel'), () => finish(false)),
        button(t('code.trustRun'), () => finish(true), { className: 'primary' }),
      ),
    );
    m.dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    m.show();
  });
}

/** CODE-016: may the code of this document download code (packages, widget modules) from `origin`? */
export function confirmDownload(host: HTMLElement, origin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal(host, 'code-download-title');
    const finish = (ok: boolean): void => {
      m.close();
      resolve(ok);
    };
    m.dialog.append(
      h('h2', { id: 'code-download-title' }, t('widgets.downloadTitle')),
      h('p', {}, t('widgets.downloadFrom', { origin })),
      h('p', {}, t('widgets.downloadSandbox')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('widgets.downloadAllow'), () => finish(true), { className: 'primary' })),
    );
    m.dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    m.show();
  });
}
