/**
 * RSVP-001..RSVP-007: the speed reader — one word at a time in the middle of
 * the whole window, aligned on its recognition point, paused and moved with
 * the keyboard. Resolves with the last word read, to put the cursor there.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';
import { delay, frame, nextSentence, orp, sentenceOf, timeLeft, toWords, type Block, type Word } from './words';

const KEY = 'pwo.rsvp';
const MIN = 100;
const MAX = 1000;

interface Settings {
  wpm: number;
  n: 1 | 2 | 3;
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Settings> | null;
    const wpm = typeof raw?.wpm === 'number' ? Math.min(MAX, Math.max(MIN, raw.wpm)) : 300;
    const n = raw?.n === 2 || raw?.n === 3 ? raw.n : 1;
    return { wpm, n };
  } catch {
    return { wpm: 300, n: 1 };
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: not remembered */
  }
}

const clock = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Opens the reader on the blocks, from the word `start`; resolves with the last word read (undefined when there is none). */
export function speedRead(host: HTMLElement, blocks: Block[], start = 0): Promise<Word | undefined> {
  const words = toWords(blocks);
  return new Promise((resolve) => {
    const settings = loadSettings();
    let i = Math.min(Math.max(0, start), Math.max(0, words.length - 1));
    let playing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // RSVP-006: the word is not announced; the sentence is, while paused.
    const before = h('span', { class: 'rsvp-before' });
    const pivot = h('span', { class: 'rsvp-pivot' });
    const after = h('span', { class: 'rsvp-after' });
    const word = h('div', { class: 'rsvp-word', 'aria-hidden': 'true' }, before, pivot, after);
    const context = h('p', { class: 'rsvp-context', role: 'status', 'aria-live': 'polite' });
    const progress = h('progress', { class: 'rsvp-progress', max: String(Math.max(1, words.length)), value: '0', 'aria-label': t('rsvp.progress') });
    const left = h('span', { class: 'rsvp-left' });
    const speed = h('input', { type: 'number', min: String(MIN), max: String(MAX), step: '25', value: String(settings.wpm), class: 'rsvp-speed', 'aria-label': t('rsvp.speed') });
    const chunk = h(
      'select',
      { 'aria-label': t('rsvp.chunk') },
      ...[1, 2, 3].map((n) => h('option', { value: String(n), selected: n === settings.n }, t('rsvp.words', { n: String(n) }))),
    );
    const play = button(t('rsvp.play'), () => toggle(), { text: '▶', title: `${t('rsvp.play')} (Space)`, className: 'rsvp-play' });

    const show = (): void => {
      const shown = frame(words, i, settings.n);
      const text = shown.map((w) => w.text).join(' ');
      word.classList.toggle('heading', !!shown[0]?.heading);
      if (shown[0]?.heading || !text) {
        before.textContent = '';
        pivot.textContent = text || t('rsvp.empty');
        after.textContent = '';
      } else {
        const p = orp(text);
        before.textContent = text.slice(0, p);
        pivot.textContent = text.slice(p, p + 1);
        after.textContent = text.slice(p + 1);
      }
      progress.value = i + shown.length;
      left.textContent = t('rsvp.left', { time: clock(timeLeft(words, i, settings.wpm)) });
      context.textContent = playing ? '' : sentenceOf(words, i);
      play.textContent = playing ? '⏸' : '▶';
      const label = t(playing ? 'rsvp.pause' : 'rsvp.play');
      play.setAttribute('aria-label', label);
      play.title = `${label} (Space)`;
      dialog.classList.toggle('playing', playing);
    };
    const tick = (): void => {
      clearTimeout(timer);
      if (!playing) return;
      const shown = frame(words, i, settings.n);
      const ms = shown.reduce((sum, w) => sum + delay(w, settings.wpm), 0);
      timer = setTimeout(() => {
        if (i + shown.length >= words.length) {
          playing = false;
          show();
          return;
        }
        i += shown.length;
        show();
        tick();
      }, ms);
    };
    const toggle = (on = !playing): void => {
      if (on && i >= words.length - 1 && !playing && words.length > 1 && progress.value >= words.length) i = 0;
      playing = on && words.length > 0;
      show();
      tick();
    };
    const go = (to: number): void => {
      i = Math.min(Math.max(0, to), Math.max(0, words.length - 1));
      show();
      tick();
    };
    const setSpeed = (wpm: number): void => {
      settings.wpm = Math.min(MAX, Math.max(MIN, Math.round(wpm / 25) * 25));
      speed.value = String(settings.wpm);
      saveSettings(settings);
      show();
    };
    speed.addEventListener('change', () => setSpeed(Number(speed.value) || 300));
    chunk.addEventListener('change', () => {
      settings.n = Number(chunk.value) as Settings['n'];
      saveSettings(settings);
      show();
      stage.focus();
    });

    const dialog = h('dialog', { class: 'dialog rsvp-dialog', 'aria-labelledby': 'rsvp-title' });
    // Where the keys go: the word, not announced (RSVP-006).
    const stage = h('div', { class: 'rsvp-stage', tabindex: '-1' }, h('div', { class: 'rsvp-mark', 'aria-hidden': 'true' }), word);
    const finish = (): void => {
      clearTimeout(timer);
      dialog.close();
      dialog.remove();
      resolve(words[i]);
    };
    dialog.addEventListener('keydown', (e) => {
      // A button reached with Tab is pressed by Space, as any button.
      if (e.key === ' ' && (e.target as HTMLElement).closest('button')) return;
      if ((e.target as HTMLElement).closest('input, select')) {
        // Enter: back to the words, the keys reading again.
        if (e.key === 'Enter') stage.focus();
        return;
      }
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === ' ') toggle();
      else if (e.key === 'ArrowRight') go(ctrl ? nextSentence(words, i, 1) : i + 1);
      else if (e.key === 'ArrowLeft') go(ctrl ? nextSentence(words, i, -1) : i - 1);
      else if (e.key === 'ArrowUp') setSpeed(settings.wpm + 25);
      else if (e.key === 'ArrowDown') setSpeed(settings.wpm - 25);
      else return;
      e.preventDefault();
    });
    // After a click, the keys read again.
    dialog.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.rsvp-controls button')) stage.focus();
    });
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish();
    });
    dialog.append(
      h(
        'div',
        { class: 'rsvp-head' },
        h('h2', { id: 'rsvp-title' }, t('rsvp.title')),
        h('label', { class: 'rsvp-field' }, speed, ` ${t('rsvp.wpm')}`),
        chunk,
        button(t('rsvp.done'), finish, { className: 'primary' }),
      ),
      stage,
      context,
      h(
        'div',
        { class: 'rsvp-controls' },
        button(t('rsvp.previous'), () => go(nextSentence(words, i, -1)), { text: '⏮', title: `${t('rsvp.previous')} (Ctrl+←)` }),
        play,
        button(t('rsvp.next'), () => go(nextSentence(words, i, 1)), { text: '⏭', title: `${t('rsvp.next')} (Ctrl+→)` }),
        progress,
        left,
      ),
      h('p', { class: 'hint rsvp-hint' }, t('rsvp.hint')),
    );
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    stage.focus();
    show();
  });
}
