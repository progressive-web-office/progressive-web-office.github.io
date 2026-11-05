/**
 * DRAW-022: an editor in a dialog (drawing, painting) that has the whole
 * window: what is edited fills it, the tools float over it and fold into a
 * small bar in a corner, so that nothing takes room from it. What is edited
 * scrolls out from under the tools; ⛶ hides the browser's own bars too.
 */
import { button, h } from './dom';
import { t } from '../i18n';

export interface ImmersiveParts {
  dialog: HTMLDialogElement;
  /** The title, an h2 with its id. */
  title: HTMLElement;
  /** Cancel and Done. */
  actions: HTMLElement;
  /** The rows of tools: toolbar, properties… */
  rows: HTMLElement[];
  /** What is edited, with its floating panels. */
  body: HTMLElement;
  /** The scrolled area, given `--draw-chrome`: the height of the tools over it. */
  scroller: HTMLElement;
}

export function immersive({ dialog, title, actions, rows, body, scroller }: ImmersiveParts): { setFolded(folded: boolean): void } {
  dialog.classList.add('draw-full');
  const chrome = h('div', { class: 'draw-chrome' });
  const fold = button(t('draw.hideTools'), () => setFolded(!chrome.classList.contains('folded')), { text: '▴', title: t('draw.hideTools'), className: 'draw-fold' });
  fold.setAttribute('aria-expanded', 'true');
  const setFolded = (folded: boolean): void => {
    chrome.classList.toggle('folded', folded);
    fold.textContent = folded ? '▾' : '▴';
    const label = t(folded ? 'draw.showTools' : 'draw.hideTools');
    fold.title = label;
    fold.setAttribute('aria-label', label);
    fold.setAttribute('aria-expanded', String(!folded));
    room();
  };
  const screen = button(
    t('draw.fullscreen'),
    () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void dialog.requestFullscreen?.().catch(() => undefined);
    },
    { text: '⛶', title: t('draw.fullscreen'), className: 'draw-screen' },
  );
  // UI-018: the command palette, as in every other part of the application (Ctrl+Shift+P).
  const palette = button(t('palette.label'), () => window.dispatchEvent(new Event('pwo:palette')), { text: `⌘ ${t('palette.label')}`, title: t('palette.button'), className: 'draw-palette' });
  chrome.append(h('div', { class: 'draw-head' }, title, palette, fold, ...(document.fullscreenEnabled ? [screen] : []), actions), ...rows);
  /*
   * The room kept above what is edited: the tools' height when the editor
   * opens, folds, unfolds or the window changes — not each time a row of
   * properties grows, which would make the drawing jump under the pointer.
   */
  function room(): void {
    const height = chrome.classList.contains('folded') ? 0 : chrome.offsetHeight;
    scroller.style.setProperty('--draw-chrome', `${height}px`);
    body.style.setProperty('--draw-chrome', `${height}px`);
  }
  window.addEventListener('resize', room);
  dialog.addEventListener('close', () => window.removeEventListener('resize', room));
  // The tools first, for the keyboard; they float over what is edited.
  dialog.append(chrome, body);
  queueMicrotask(room);
  return { setFolded };
}
