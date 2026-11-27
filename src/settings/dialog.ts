/**
 * Settings window (SET-001): the user's preferences, by category, kept in
 * this browser as soon as they change. Each setting is stored where the
 * feature reads it, so the window only gathers them.
 */
import { originsEnabled, placesEnabled, setOriginsEnabled, setPlacesEnabled } from '../storage/places';
import { button, h } from '../app/dom';
import { inExam } from '../exam/mode';
import { getLocale, LOCALES, setLocale, t, type Locale, type MessageKey } from '../i18n';
import { applyTheme, loadTheme, saveTheme, THEMES, type ThemePreference } from '../app/theme';
import { loadPaper, PAPERS, savePaper, type PaperPreference } from '../app/paper';
import { commentAuthor, saveAuthor } from '../app/author';
import { FORMAT_FAMILIES, loadFormatFamily, saveFormatFamily, type FormatFamily } from '../core/format-preference';
import { loadReading, saveReading, type ReadingSettings } from '../review/settings';
import { PAGES_PER_ROW } from '../pdf/fit';
import { loadTypography, saveTypography } from '../document/typography';
import { loadLinkClick, saveLinkClick, type LinkClick } from '../document/link-click';
import { loadPrintSettings, PAPER_SIZES, savePrintSettings, type Paper } from '../print/settings';
import { loadCollabNetwork, parseRelays, saveCollabNetwork } from '../collab/network';
import { loadReactivity, REACTIVITY, saveReactivity } from '../code/settings';
import { loadToolbarMode, saveToolbarMode } from '../app/tool-groups';
import { LENGTH_UNITS, loadLengthUnit, loadRulerSides, saveLengthUnit, saveRulerSides } from '../document/units';

export type SettingsCategory = 'general' | 'reading' | 'writing' | 'printing' | 'collab' | 'security';
export const CATEGORIES: SettingsCategory[] = ['general', 'reading', 'writing', 'printing', 'collab', 'security'];

export interface SettingsHooks {
  /** The interface language changed. */
  locale?(locale: Locale): void;
  /** The theme changed. */
  theme?(theme: ThemePreference): void;
}

let uid = 0;

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = `set-${++uid}`;
  control.id = id;
  const hintId = hint ? `${id}-hint` : undefined;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  const isCheck = control instanceof HTMLInputElement && control.type === 'checkbox';
  return h(
    'div',
    { class: `settings-field${isCheck ? ' check' : ''}` },
    ...(isCheck ? [control, h('label', { for: id }, label)] : [h('label', { for: id }, label), control]),
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null,
  );
}

function select<T extends string>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const el = h('select', {}, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  el.addEventListener('change', () => onChange(el.value as T));
  return el;
}

function check(value: boolean, onChange: (v: boolean) => void): HTMLInputElement {
  const el = h('input', { type: 'checkbox', checked: value });
  el.addEventListener('change', () => onChange(el.checked));
  return el;
}

/** NOTIF-001, NOTIF-004: the reminders of events, notified while the application is open. */
function remindersField(): HTMLElement {
  const box = h('div', { class: 'settings-field' }, h('p', { class: 'hint' }, t('lock.loading')));
  void Promise.all([import('../pim/reminders'), import('../pim/notify'), import('../pim/calendar-view')]).then(([r, n, c]) => {
    const settings = r.loadReminderSettings();
    const status = h('p', { class: 'hint', role: 'status' });
    const changed = (): void => {
      r.saveReminderSettings(settings);
      dispatchEvent(new Event('pwo-reminders-changed'));
    };
    const on = check(settings.enabled, (v) => {
      settings.enabled = v;
      changed();
      if (!v) return;
      void n.askNotifications().then((p) => {
        status.textContent = p === 'granted' ? t('remind.allowed') : p === 'unsupported' ? t('remind.unsupported') : t('remind.denied');
      });
    });
    const byDefault = select<string>([['', t('cal.reminderNone')], ...r.REMINDER_CHOICES.map((m) => [String(m), c.reminderLabel(m)] as [string, string])], settings.defaultMinutes === undefined ? '' : String(settings.defaultMinutes), (v) => {
      if (v === '') delete settings.defaultMinutes;
      else settings.defaultMinutes = Number(v);
      changed();
    });
    box.replaceChildren(field(t('remind.enable'), on, t('remind.hint')), field(t('remind.default'), byDefault), status);
  });
  return box;
}

/** TEACH-005: the exam mode, started from here (left from its banner). */
function examField(): HTMLElement {
  const start = button(t('exam.startButton'), async () => {
    const { chooseStartExam } = await import('../exam/ui');
    if (await chooseStartExam(document.body)) location.reload();
  }, { icon: '🔒' });
  return h('div', { class: 'settings-field' }, start, h('p', { class: 'hint' }, t('exam.startHint')));
}

function generalPanel(hooks: SettingsHooks): HTMLElement[] {
  const name = h('input', { type: 'text', autocomplete: 'name', value: commentAuthor() });
  name.addEventListener('change', () => saveAuthor(name.value));
  const themes: Record<ThemePreference, MessageKey> = { system: 'theme.system', light: 'theme.light', dark: 'theme.dark' };
  const papers: Record<PaperPreference, MessageKey> = { auto: 'paper.auto', light: 'paper.light', dark: 'paper.dark' };
  const families: Record<FormatFamily, MessageKey> = { open: 'formats.open', microsoft: 'formats.microsoft' };
  return [
    field(t('app.language'), select(LOCALES.map((l) => [l.code, l.label]), getLocale(), (l) => {
      setLocale(l);
      hooks.locale?.(l);
    })),
    field(t('settings.theme'), select(THEMES.map((th) => [th, t(themes[th])]), loadTheme(), (th) => {
      saveTheme(th);
      applyTheme(th);
      hooks.theme?.(th);
    })),
    // UI-023: the paper of documents on screen.
    field(t('paper.label'), select(PAPERS.map((p) => [p, t(papers[p])]), loadPaper(), savePaper), t('paper.hint')),
    field(t('settings.name'), name, t('settings.nameHint')),
    // UI-020: tools in menus, or all in sight.
    field(t('settings.toolbars'), select([['compact', t('settings.toolbarCompact')], ['full', t('settings.toolbarFull')]], loadToolbarMode(), saveToolbarMode), t('settings.toolbarsHint')),
    field(t('formats.label'), select(FORMAT_FAMILIES.map((f) => [f, t(families[f])]), loadFormatFamily(), saveFormatFamily), t('formats.title')),
    // FILE-028, FILE-029.
    field(t('settings.rememberPlaces'), check(placesEnabled(), setPlacesEnabled), t('settings.rememberPlacesHint')),
    field(t('settings.trackOrigin'), check(originsEnabled(), setOriginsEnabled), t('settings.trackOriginHint')),
    remindersField(),
    ...(inExam() ? [] : [examField()]),
  ];
}

function readingPanel(): HTMLElement[] {
  const r = loadReading();
  const set = (changes: Partial<ReadingSettings>): void => void saveReading(changes);
  return [
    h('p', { class: 'hint' }, t('settings.readingHint')),
    field(t('pdf.pagesPerRow'), select(PAGES_PER_ROW.map((n) => [String(n), t(n === 1 ? 'pdf.onePage' : 'pdf.nPages', { n })]), String(r.perRow), (v) => set({ perRow: Number(v) }))),
    field(
      t('settings.zoom'),
      select(
        [['1', t('settings.zoomActual')], ['width', t('review.action.fitWidth')], ['page', t('review.action.fitPage')], ...(typeof r.zoom === 'number' && r.zoom !== 1 ? [[String(r.zoom), `${Math.round(r.zoom * 100)} %`] as [string, string]] : [])],
        String(r.zoom),
        (zoom) => set({ zoom: zoom === 'width' || zoom === 'page' ? zoom : Number(zoom) }),
      ),
    ),
    field(t('review.flow'), select([['scroll', t('review.flowScroll')], ['pages', t('review.flowPages')]], r.flow, (flow) => set({ flow }))),
    field(t('settings.rememberLast'), check(r.rememberLast, (rememberLast) => set({ rememberLast })), t('settings.rememberLastHint')),
    field(t('settings.review'), check(r.review, (review) => set({ review })), t('settings.reviewHint')),
  ];
}

function writingPanel(): HTMLElement[] {
  const modes: Record<(typeof REACTIVITY)[number], MessageKey> = { lazy: 'settings.reactLazy', auto: 'settings.reactAuto', off: 'settings.reactOff' };
  return [
    field(t('text.typography'), check(loadTypography(), saveTypography), t('settings.typographyHint')),
    // DOC-055: what a click on a link does while editing.
    field(t('link.click'), select([['show', t('link.clickShow')], ['follow', t('link.clickFollow')]], loadLinkClick(), (v) => saveLinkClick(v as LinkClick)), t('link.clickHint')),
    // CODE-014: how code cells react to each other.
    field(t('settings.reactivity'), select(REACTIVITY.map((m) => [m, t(modes[m])]), loadReactivity(), saveReactivity), t('settings.reactivityHint')),
    // DOC-054: each ruler on its own, and the unit of the page.
    field(t('ruler.horizontal'), check(loadRulerSides().horizontal, (horizontal) => saveRulerSides({ ...loadRulerSides(), horizontal }))),
    field(t('ruler.vertical'), check(loadRulerSides().vertical, (vertical) => saveRulerSides({ ...loadRulerSides(), vertical }))),
    field(t('unit.label'), select(LENGTH_UNITS.map((u) => [u, t(`unit.${u}`)]), loadLengthUnit(), saveLengthUnit), t('unit.hint')),
  ];
}

function printingPanel(): HTMLElement[] {
  const p = loadPrintSettings();
  const save = (changes: Partial<typeof p>): void => savePrintSettings({ ...loadPrintSettings(), ...changes });
  const margin = h('input', { type: 'number', min: '0', max: '50', step: '1', value: String(p.margin) });
  margin.addEventListener('change', () => {
    const v = Number(margin.value);
    if (Number.isFinite(v) && v >= 0 && v <= 50) save({ margin: v });
  });
  return [
    h('p', { class: 'hint' }, t('settings.printingHint')),
    field(t('print.paper'), select((Object.keys(PAPER_SIZES) as Paper[]).map((k) => [k, k]), p.paper, (paper) => save({ paper }))),
    field(t('print.orientation'), select([['portrait', t('print.portrait')], ['landscape', t('print.landscape')]], p.orientation, (orientation) => save({ orientation }))),
    field(t('print.margins'), margin),
  ];
}

/** COLLAB-009: relays and TURN server of the real-time collaboration. */
function collabPanel(): HTMLElement[] {
  const n = loadCollabNetwork();
  const relays = h('textarea', { rows: '3', spellcheck: 'false', placeholder: 'wss://relay.example.org' });
  relays.value = n.relays.join('\n');
  const turn = h('input', { type: 'text', spellcheck: 'false', placeholder: 'turn:turn.example.org:3478', value: n.turn?.urls ?? '' });
  const user = h('input', { type: 'text', autocomplete: 'off', value: n.turn?.username ?? '' });
  const password = h('input', { type: 'password', autocomplete: 'off', value: n.turn?.credential ?? '' });
  const save = (): void => {
    const urls = turn.value.trim();
    saveCollabNetwork({
      relays: parseRelays(relays.value),
      ...(urls ? { turn: { urls, ...(user.value.trim() ? { username: user.value.trim() } : {}), ...(password.value ? { credential: password.value } : {}) } } : {}),
    });
  };
  for (const el of [relays, turn, user, password]) el.addEventListener('change', save);
  return [
    h('p', { class: 'hint' }, t('settings.collabHint')),
    field(t('settings.relays'), relays, t('settings.relaysHint')),
    field(t('settings.turn'), turn, t('settings.turnHint')),
    field(t('settings.turnUser'), user),
    field(t('settings.turnPassword'), password),
    h('p', { class: 'hint' }, t('settings.collabNext')),
  ];
}

/** LOCK-001..LOCK-005: the lock of the application (loaded when shown). */
function securityPanel(): HTMLElement[] {
  const box = h('div', {}, h('p', { class: 'hint' }, t('lock.loading')));
  void import('../lock/ui').then(({ lockSettings }) => box.replaceChildren(...lockSettings()));
  return [box];
}

const PANELS: Record<SettingsCategory, (hooks: SettingsHooks) => HTMLElement[]> = {
  general: generalPanel,
  reading: readingPanel,
  writing: writingPanel,
  printing: printingPanel,
  collab: collabPanel,
  security: securityPanel,
};

/** Open the settings window on a category. */
export function openSettings(host: HTMLElement, hooks: SettingsHooks = {}, first: SettingsCategory = 'general'): HTMLDialogElement {
  const dialog = h('dialog', { class: 'dialog settings-dialog', 'aria-labelledby': 'settings-title' });
  const tabs = h('div', { role: 'tablist', 'aria-orientation': 'vertical', 'aria-label': t('settings.categories'), class: 'settings-tabs' });
  const panel = h('div', { role: 'tabpanel', class: 'settings-panel', tabindex: '0' });
  const buttons = new Map<SettingsCategory, HTMLButtonElement>();
  const show = (category: SettingsCategory, focus = false): void => {
    for (const [c, b] of buttons) {
      b.setAttribute('aria-selected', String(c === category));
      b.tabIndex = c === category ? 0 : -1;
    }
    const tab = buttons.get(category)!;
    panel.setAttribute('aria-labelledby', tab.id);
    panel.replaceChildren(h('h3', {}, tab.textContent ?? ''), ...PANELS[category](hooks));
    if (focus) tab.focus();
  };
  for (const c of CATEGORIES) {
    const b = h('button', { type: 'button', role: 'tab', id: `settings-tab-${c}`, 'aria-controls': 'settings-panel' }, t(`settings.cat.${c}` as MessageKey));
    b.addEventListener('click', () => show(c));
    buttons.set(c, b);
    tabs.append(b);
  }
  panel.id = 'settings-panel';
  tabs.addEventListener('keydown', (e) => {
    const i = CATEGORIES.findIndex((c) => buttons.get(c) === document.activeElement);
    if (i < 0) return;
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    show(CATEGORIES[(i + step + CATEGORIES.length) % CATEGORIES.length]!, true);
  });
  const close = (): void => {
    dialog.close();
    dialog.remove();
  };
  dialog.append(
    h('h2', { id: 'settings-title' }, `⚙ ${t('settings.title')}`),
    h('div', { class: 'settings-body' }, tabs, panel),
    h('div', { class: 'dialog-actions' }, h('span', { class: 'hint' }, t('settings.saved')), button(t('common.close'), close, { className: 'primary' })),
  );
  dialog.addEventListener('close', () => dialog.remove());
  show(first);
  host.append(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return dialog;
}
