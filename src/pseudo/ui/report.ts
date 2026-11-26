/**
 * PSEUDO-027: the report of a run, shown on this device only (it holds real
 * names): per file its output, the people attributed, the replacements, the
 * warnings, the items to check visually (pictures as thumbnails taken from
 * the output, each with a box to mark it checked), the parts removed and the
 * status — never a bare OK (PSEUDO-026).
 */
import { button, h } from '../../app/dom';
import { t, type MessageKey } from '../../i18n';
import type { Person } from '../engine';
import type { FileReport, RunReport } from '../pipeline';
import { displayName } from '../reidentify';
import { showNotice } from './notice';

const STATUS: Record<FileReport['status'], MessageKey> = {
  residues: 'pseudo.status.residues',
  check: 'pseudo.status.check',
  clean: 'pseudo.status.clean',
  refused: 'pseudo.status.refused',
};

const NOTE: Record<string, MessageKey> = {
  excluded: 'pseudo.note.excluded',
  'common-word': 'pseudo.note.common',
  short: 'pseudo.note.short',
  'shared-last': 'pseudo.note.sharedLast',
  'shared-first': 'pseudo.note.sharedFirst',
};

const CHECK: Record<string, MessageKey> = {
  picture: 'pseudo.check.picture',
  object: 'pseudo.check.object',
  macro: 'pseudo.check.macro',
  binary: 'pseudo.check.binary',
  'scanned-page': 'pseudo.check.scanned',
  attachment: 'pseudo.check.attachment',
};

export interface ReportView {
  element: HTMLElement;
  /** Items to check that are not marked checked yet. */
  unchecked(): number;
  dispose(): void;
}

export function renderReport(report: RunReport, people: readonly Person[], host: HTMLElement, open?: (f: FileReport) => void): ReportView {
  const urls: string[] = [];
  const byKey = new Map(people.map((p) => [p.key, p]));
  const who = (key: string): string => {
    const p = byKey.get(key);
    return p ? `${p.pseudonym} (${displayName(p)})` : key;
  };
  let total = 0;
  let checked = 0;
  const counter = h('p', { class: 'hint', 'aria-live': 'polite' });
  const updateCounter = (): void => void (counter.textContent = total ? t('pseudo.report.toCheckLeft', { n: total - checked }) : '');

  const notes = report.notes.length
    ? h('ul', { class: 'pseudo-notes' }, ...report.notes.map((n) => h('li', {}, t(NOTE[n.kind] ?? 'pseudo.note.common', { names: n.people.map(who).join(', ') }))))
    : null;

  const rows = report.files.map((f) => {
    const status = h('span', { class: `pseudo-status pseudo-${f.status}` }, t(STATUS[f.status]));
    const people = f.attribution.people.map((p) => who(p.key)).join(', ') || t('pseudo.report.nobody');
    const details: (HTMLElement | null)[] = [];
    if (f.refusal) details.push(h('p', { class: 'hint error' }, t(`pseudo.refusal.${f.refusal.code}` as MessageKey) || f.refusal.code, f.refusal.detail ? ` (${f.refusal.detail})` : ''));
    if (f.status !== 'refused') {
      if (f.status === 'clean') details.push(h('p', { class: 'hint' }, t('pseudo.report.notGuarantee')));
      const residues = f.findings.filter((x) => x.kind === 'residue');
      if (residues.length) details.push(h('h4', {}, t('pseudo.report.residues', { n: residues.length })), h('ul', {}, ...residues.slice(0, 50).map((x) => h('li', {}, `${x.where}: …${x.excerpt}…`))));
      if (f.toCheck.length) {
        details.push(h('h4', {}, t('pseudo.report.toCheck', { n: f.toCheck.length })));
        const list = h('ul', { class: 'pseudo-tocheck' });
        for (const c of f.toCheck) {
          total++;
          const box = h('input', { type: 'checkbox', 'aria-label': t('pseudo.report.checked') });
          box.addEventListener('change', () => {
            checked += box.checked ? 1 : -1;
            updateCounter();
          });
          let thumb: HTMLElement | null = null;
          if (c.bytes && c.mime) {
            const url = URL.createObjectURL(new Blob([c.bytes as BlobPart], { type: c.mime }));
            urls.push(url);
            thumb = h('img', { src: url, alt: c.label ?? c.where, class: 'pseudo-thumb' });
          }
          list.append(h('li', {}, h('label', {}, box, ` ${t(CHECK[c.kind] ?? 'pseudo.check.binary')}: ${c.where}`), thumb));
        }
        details.push(list);
      }
      if (f.checks.length) details.push(h('h4', {}, t('pseudo.report.labelled', { n: f.checks.length })), h('ul', {}, ...f.checks.map((c) => h('li', {}, `${c.where}: ${c.excerpt}`))));
      if (f.attribution.status === 'none' || f.attribution.status === 'ambiguous') details.push(h('p', { class: 'hint' }, t('pseudo.report.unattributed')));
      if (f.pseudonymLike) details.push(h('p', { class: 'hint' }, t('pseudo.report.pseudonymLike', { n: f.pseudonymLike })));
      if (f.replacements.length) {
        const byKind = new Map<string, number>();
        for (const r of f.replacements) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
        details.push(
          h('h4', {}, t('pseudo.report.replacements', { n: f.replacements.length })),
          h('p', { class: 'hint' }, [...byKind].map(([k, n]) => `${k}: ${n}`).join(' · ')),
          h('details', {}, h('summary', {}, t('pseudo.report.showReplacements')), h('ul', {}, ...f.replacements.slice(0, 500).map((r) => h('li', {}, `${r.where}: «${r.before}» → «${r.after}»`)))),
        );
      }
      if (f.removed.length) details.push(h('h4', {}, t('pseudo.report.removed')), h('p', { class: 'hint' }, f.removed.join(', ')));
    }
    return h(
      'details',
      { class: 'pseudo-file', open: f.status === 'residues' || f.status === 'refused' ? true : undefined },
      h('summary', {}, status, ` ${f.source}`, f.output ? ` → ${f.output}` : '', h('span', { class: 'hint' }, ` — ${people}`)),
      ...details,
      f.outputBytes && open ? h('div', { class: 'dialog-actions start' }, button(t('pseudo.report.open'), () => open(f))) : null,
    );
  });
  updateCounter();
  const element = h(
    'section',
    { class: 'pseudo-report', 'aria-label': t('pseudo.report.title') },
    h('p', { class: 'hint' }, t('pseudo.report.reminder'), ' ', button(t('pseudo.notice.read'), () => void showNotice(host, false), { className: 'link' })),
    notes,
    counter,
    ...rows,
  );
  return {
    element,
    unchecked: () => total - checked,
    dispose: () => urls.forEach((u) => URL.revokeObjectURL(u)),
  };
}
