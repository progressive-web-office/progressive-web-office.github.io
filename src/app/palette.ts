/**
 * Command palette (UI-018): every button and menu entry of the screen — those
 * folded in the toolbars' menus too — found by typing part of its name or of
 * its category (Ctrl+Shift+P), or browsed by category (UI-022).
 */
import { h } from './dom';
import { t } from '../i18n';

export interface PaletteCommand {
  label: string;
  /** Other words finding it, such as its name in other languages (UI-018). */
  keywords?: string;
  /** Keyboard shortcuts doing the same (UI-018). */
  keys?: string[];
  /** Where it is (the toolbar or panel), shown beside the name. */
  where: string;
  /** UI-022: its menu or kind (Insert, Share, Table…), shown before the name: "Insert: Table". */
  category?: string;
  /** FILE-032: the folders of a file, shown under its name, cut in the middle when long. */
  path?: string[];
  run(): void;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Commands matching a query: every word of the query in the name, in any order; names starting with it first. */
export function filterCommands<T extends { label: string; keywords?: string; category?: string }>(commands: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return commands;
  const scored = commands
    .map((c) => {
      const name = fold(c.label);
      const all = [name, c.category ? fold(c.category) : '', c.keywords ? fold(c.keywords) : ''].join(' ');
      if (!words.every((w) => all.includes(w))) return undefined;
      return { c, score: (name.startsWith(words[0]!) ? 0 : name.includes(words[0]!) ? 1 : 2) + name.length / 1000 };
    })
    .filter((x): x is { c: T; score: number } => !!x);
  return scored.sort((a, b) => a.score - b.score).map((x) => x.c);
}

const KEY = /^(?:(?:Ctrl|Alt|Shift|Cmd|⌘|Option|⌥|Mod)\+)*(?:[A-Za-z0-9]|F\d{1,2}|Esc|Enter|Space|Tab|Delete|Backspace|Home|End|Page (?:Up|Down)|[←→↑↓]|[^\sA-Za-z0-9().]{1,2})$/;

/**
 * A tooltip such as "Comment (Ctrl+Alt+M)" or "Next page (k)": the name and
 * the shortcuts in its last parentheses (before a `;` that explains them).
 */
export function splitShortcut(title: string): { label: string; keys: string[] } {
  const m = /^(.*\S)\s*\(([^()]*)\)\s*$/.exec(title);
  if (!m) return { label: title, keys: [] };
  const keys = m[2]!.split(';')[0]!.split(/\s*,\s*/).map((k) => k.trim());
  if (!keys.length || !keys.every((k) => KEY.test(k))) return { label: title, keys: [] };
  return { label: m[1]!, keys };
}

/** The buttons and select options shown in `root`, as commands. */
export function collectCommands(root: HTMLElement): PaletteCommand[] {
  const out: PaletteCommand[] = [];
  const seen = new Set<string>();
  // Shown, or in a folded menu of a shown toolbar (UI-022).
  const visible = (el: HTMLElement): boolean => {
    // In a window, unless the commands are those of that window (an editor taking the whole window, DRAW-022).
    const shut = el.closest('dialog, .palette, .context-menu');
    if (shut && shut !== root) return false;
    // The tools folded out of sight (DRAW-022) stay at hand here.
    if (el.closest('.draw-chrome.folded')) return !el.closest('[hidden]');
    const menu = el.closest<HTMLElement>('.tool-group-panel');
    if (menu) return !menu.parentElement?.closest('[hidden]') && visible(menu.parentElement!.querySelector<HTMLElement>('.tool-group-toggle') ?? menu.parentElement!);
    return !el.closest('[hidden]') && (el.offsetParent !== null || el.getClientRects().length > 0);
  };
  // The toolbar, panel or menu around the control (not the control itself).
  const whereOf = (el: HTMLElement): string => el.parentElement?.closest<HTMLElement>('[role=toolbar], aside, header, [aria-label]')?.getAttribute('aria-label') ?? '';
  // Its menu (Insert, Share…), or else its toolbar.
  const categoryOf = (el: HTMLElement): string | undefined =>
    el.closest<HTMLElement>('.tool-group-panel, .tool-group-inline')?.getAttribute('aria-label') ?? el.parentElement?.closest<HTMLElement>('[role=toolbar], aside, header')?.getAttribute('aria-label') ?? undefined;
  for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('button'))) {
    if (b.disabled || b.classList.contains('tool-group-toggle') || !visible(b)) continue;
    const raw = (b.getAttribute('aria-label') || b.title || b.textContent || '').replace(/\s+/g, ' ').trim();
    // The shortcut is in the tooltip, the name in the label (or the tooltip).
    const fromTitle = splitShortcut(b.title.replace(/\s+/g, ' ').trim());
    const label = splitShortcut(raw).label;
    if (!label || label.length < 2) continue;
    const where = whereOf(b);
    const key = `${label}\u0000${where}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const category = categoryOf(b);
    out.push({ label, where, ...(category ? { category } : {}), ...(fromTitle.keys.length ? { keys: fromTitle.keys } : {}), ...(b.dataset.keywords ? { keywords: b.dataset.keywords } : {}), run: () => b.click() });
  }
  // Entries of menus such as "Save as…".
  for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>('select'))) {
    if (select.disabled || !visible(select)) continue;
    const name = select.getAttribute('aria-label') ?? '';
    for (const option of Array.from(select.options)) {
      if (!option.value || option.disabled) continue;
      const category = categoryOf(select);
      out.push({
        label: `${name}: ${option.textContent?.trim() ?? option.value}`,
        where: whereOf(select),
        ...(category ? { category } : {}),
        run: () => {
          select.value = option.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        },
      });
    }
  }
  return out;
}

/** Commands grouped by category (in the order categories first appear), sorted by name within each. */
export function groupByCategory<T extends PaletteCommand>(commands: T[]): T[] {
  const order: string[] = [];
  const groups = new Map<string, T[]>();
  for (const c of commands) {
    const cat = c.category ?? c.where;
    if (!groups.has(cat)) {
      groups.set(cat, []);
      order.push(cat);
    }
    groups.get(cat)!.push(c);
  }
  return order.flatMap((cat) => groups.get(cat)!.sort((a, b) => a.label.localeCompare(b.label)));
}

export interface PaletteOptions {
  /** Its name and the hint of its field (the commands', by default). */
  label?: string;
  placeholder?: string;
  none?: string;
  /** With nothing typed, the first ones in their order (the files, the latest first), not by category. */
  flat?: number;
}

/**
 * FILE-032: a file, its name and, under it, its folders — the first ones and
 * the last ones always shown, the middle ones cut when there is no room.
 */
function fileItem(c: PaletteCommand, i: number, active: boolean): HTMLElement {
  const path = c.path ?? [];
  const last = path.length > 1 ? path.slice(-1) : [];
  const first = path.slice(0, path.length - last.length);
  return h(
    'li',
    { role: 'option', id: `palette-${i}`, 'aria-selected': String(active), class: `palette-file${active ? ' active' : ''}`, title: [...path, c.label].join(' › ') },
    h('span', { class: 'palette-name' }, c.label),
    h(
      'span',
      { class: 'palette-path' },
      h('span', { class: 'palette-path-head' }, first.join(' › ')),
      last.length ? h('span', { class: 'palette-path-tail' }, `› ${last.join(' › ')}`) : '',
    ),
  );
}

/** Show the palette; resolves when it is closed. */
export function openPalette(host: HTMLElement, commands: PaletteCommand[], opts: PaletteOptions = {}): Promise<void> {
  const label = opts.label ?? t('palette.label');
  return new Promise((resolve) => {
    const before = document.activeElement as HTMLElement | null;
    const input = h('input', { type: 'search', class: 'palette-input', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-label': label, placeholder: opts.placeholder ?? t('palette.placeholder'), autocomplete: 'off' });
    const list = h('ul', { id: 'palette-list', role: 'listbox', class: 'palette-list', 'aria-label': label });
    const dialog = h('dialog', { class: 'dialog palette', 'aria-label': label }, input, list);
    let shown: PaletteCommand[] = [];
    let active = 0;
    const render = (): void => {
      const browsing = !input.value.trim() && !opts.flat;
      // UI-022: with nothing typed, every command, by category.
      shown = browsing ? groupByCategory(commands) : !input.value.trim() ? commands.slice(0, opts.flat) : filterCommands(commands, input.value).slice(0, 80);
      active = Math.min(active, Math.max(0, shown.length - 1));
      const items: HTMLElement[] = [];
      let category: string | undefined;
      shown.forEach((c, i) => {
        const cat = c.category ?? c.where;
        if (browsing && cat !== category) items.push(h('li', { class: 'palette-group', role: 'presentation' }, cat || t('palette.other')));
        category = cat;
        const li = c.path ? fileItem(c, i, i === active) : h(
          'li',
          { role: 'option', id: `palette-${i}`, 'aria-selected': String(i === active), class: i === active ? 'active' : '' },
          h('span', { class: 'palette-name' }, ...(c.category && !browsing && !fold(c.label).startsWith(fold(c.category)) ? [h('span', { class: 'palette-category' }, `${c.category}${t('palette.categorySep')}`)] : []), c.label),
          h('span', { class: 'palette-keys' }, ...(c.keys ?? []).map((k) => h('kbd', {}, k))),
          h('small', { class: 'palette-where' }, c.where),
        );
        li.addEventListener('mousedown', (e) => e.preventDefault());
        li.addEventListener('click', () => run(i));
        items.push(li);
      });
      list.replaceChildren(...(shown.length ? items : [h('li', { class: 'hint' }, opts.none ?? t('palette.none'))]));
      if (shown.length) input.setAttribute('aria-activedescendant', `palette-${active}`);
      else input.removeAttribute('aria-activedescendant');
      list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
    };
    const close = (): void => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    const run = (i: number): void => {
      const c = shown[i];
      close();
      before?.focus?.();
      c?.run();
    };
    input.addEventListener('input', () => {
      active = 0;
      render();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % Math.max(1, shown.length);
        render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(active);
      }
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
      before?.focus?.();
    });
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) close();
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    render();
    input.focus();
  });
}
