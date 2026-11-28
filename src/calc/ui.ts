/**
 * CALC-001, CALC-002, CALC-003, CALC-005, CALC-012: the calculator, in a
 * window of its own. The expression is typed, or built with the keys; Enter
 * (or =) computes it, the result is announced; the history and the memory
 * are kept on the device. Nothing reaches the network.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { CalcError, parseCalc } from './expr';
import { bitsOf, evaluateProgrammer, formatInteger, toggleBit, type Word } from './programmer';
import { evaluateScientific, formatNumber, CONSTANTS, type AngleUnit, type Notation } from './scientific';
import { evaluateStandard } from './standard';

export type CalcMode = 'standard' | 'scientific' | 'programmer';
const MODES: CalcMode[] = ['standard', 'scientific', 'programmer'];
type Base = 2 | 8 | 10 | 16;

interface Entry {
  mode: CalcMode;
  expr: string;
  result: string;
}

interface CalcState {
  mode: CalcMode;
  angle: AngleUnit;
  notation: Notation;
  digits: number;
  base: Base;
  bits: number;
  signed: boolean;
  memory: string;
  history: Entry[];
}

const KEY = 'pwo.calc';
const MAX_HISTORY = 100;
const DEFAULTS: CalcState = { mode: 'standard', angle: 'deg', notation: 'normal', digits: 12, base: 10, bits: 32, signed: true, memory: '', history: [] };

export function loadCalcState(): CalcState {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<CalcState>;
    const state = { ...DEFAULTS, ...saved };
    if (!MODES.includes(state.mode)) state.mode = 'standard';
    if (!Array.isArray(state.history)) state.history = [];
    return state;
  } catch {
    return { ...DEFAULTS };
  }
}

function saveCalcState(state: CalcState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, history: state.history.slice(0, MAX_HISTORY) }));
  } catch {
    /* not kept */
  }
}

/** The result of an expression in a mode, as written by the calculator. Throws a `CalcError`. */
export function computeIn(state: CalcState, expr: string, ans: string): string {
  if (state.mode === 'standard') return evaluateStandard(parseCalc(expr), ans).toString();
  if (state.mode === 'scientific') {
    const value = evaluateScientific(parseCalc(expr), { angle: state.angle, ans: ans ? Number(ans) : 0 });
    return formatNumber(value, { digits: state.digits, notation: state.notation });
  }
  const word = { bits: state.bits, signed: state.signed };
  let last = 0n;
  try {
    last = ans ? BigInt(ans) : 0n;
  } catch {
    last = 0n;
  }
  return evaluateProgrammer(parseCalc(expr, { integers: true, base: state.base }), word, last).toString();
}

const errorText = (e: unknown): string => (e instanceof CalcError ? t(`calc.err.${e.code}` as MessageKey) : t('calc.err.syntax'));

/** Open the calculator over `host`; resolves when it is closed. */
export function openCalculator(host: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const state = loadCalcState();
    const dialog = h('dialog', { class: 'dialog calc-dialog', 'aria-labelledby': 'calc-title' });
    const input = h('input', { type: 'text', class: 'calc-input', 'aria-label': t('calc.expression'), autocomplete: 'off', spellcheck: 'false', inputmode: 'text' });
    const output = h('output', { class: 'calc-output', role: 'status', 'aria-live': 'polite' });
    const tabs = h('div', { class: 'calc-tabs', role: 'tablist', 'aria-label': t('calc.modes') });
    const options = h('div', { class: 'calc-options' });
    const bases = h('div', { class: 'calc-bases' });
    const bitGrid = h('div', { class: 'calc-bits', role: 'group', 'aria-label': t('calc.bits') });
    const keys = h('div', { class: 'calc-keys' });
    const memKeys = h('div', { class: 'calc-memkeys', role: 'group', 'aria-label': t('calc.memory') });
    const memoryLine = h('p', { class: 'calc-memory hint' });
    const historyList = h('ol', { class: 'calc-history-list', reversed: true });
    // The last answer (`ans`), as written in its mode.
    let ans = state.history.find((e) => e.mode === state.mode)?.result ?? '';
    let lastValue: bigint | undefined;

    const close = (): void => {
      saveCalcState(state);
      dialog.close();
      dialog.remove();
      resolve();
    };

    const insert = (text: string): void => {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.setRangeText(text, start, end, 'end');
      input.focus();
      preview();
    };

    /** The result while typing, in the programmer's bases too; errors only on Enter. */
    const preview = (): void => {
      if (state.mode !== 'programmer') return;
      try {
        lastValue = input.value.trim() ? BigInt(computeIn(state, input.value, ans)) : undefined;
      } catch {
        return;
      }
      renderBases();
    };

    const compute = (): void => {
      const expr = input.value.trim();
      if (!expr) return;
      try {
        const result = computeIn(state, expr, ans);
        output.classList.remove('calc-error');
        output.textContent = `= ${result}`;
        ans = result;
        state.history.unshift({ mode: state.mode, expr, result });
        state.history.length = Math.min(state.history.length, MAX_HISTORY);
        saveCalcState(state);
        renderHistory();
        if (state.mode === 'programmer') {
          lastValue = BigInt(result);
          renderBases();
        }
        input.select();
      } catch (e) {
        output.classList.add('calc-error');
        output.textContent = errorText(e);
      }
    };

    const key = (text: string, label: MessageKey | null, act: () => void = () => insert(text), cls = ''): HTMLButtonElement => {
      const b = button(label ? t(label) : text, act, { text, className: `calc-key ${cls}`.trim() });
      return b;
    };
    const fn = (name: string, label: MessageKey): HTMLButtonElement => key(name, label, () => insert(`${name}(`), 'calc-fn');

    const memory = (): HTMLElement[] => [
      key('MC', 'calc.mc', () => {
        state.memory = '';
        renderMemory();
      }, 'calc-mem'),
      key('MR', 'calc.mr', () => state.memory && insert(state.memory), 'calc-mem'),
      key('M+', 'calc.mplus', () => memoryAdd(1), 'calc-mem'),
      key('M−', 'calc.mminus', () => memoryAdd(-1), 'calc-mem'),
      key('MS', 'calc.ms', () => {
        if (ans) state.memory = ans;
        renderMemory();
      }, 'calc-mem'),
    ];
    const memoryAdd = (sign: 1 | -1): void => {
      if (!ans) return;
      try {
        state.memory = computeIn(state, `(${state.memory || '0'}) ${sign > 0 ? '+' : '-'} (${ans})`, ans);
      } catch (e) {
        output.textContent = errorText(e);
      }
      renderMemory();
    };
    const renderMemory = (): void => {
      memoryLine.textContent = state.memory ? t('calc.memoryValue', { value: state.memory }) : '';
      saveCalcState(state);
    };

    const edit = (): HTMLElement[] => [
      key('C', 'calc.clear', () => {
        input.value = '';
        output.textContent = '';
        lastValue = undefined;
        renderBases();
        input.focus();
      }, 'calc-op'),
      key('⌫', 'calc.backspace', () => {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        if (start === end && start > 0) input.setRangeText('', start - 1, start, 'end');
        else input.setRangeText('', start, end, 'end');
        input.focus();
        preview();
      }, 'calc-op'),
      key('(', null),
      key(')', null),
    ];
    const digits = (allowed: (d: string) => boolean = () => true): HTMLButtonElement[] =>
      ['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => {
        const b = key(d, null, () => insert(d), 'calc-digit');
        b.disabled = !allowed(d);
        return b;
      });
    const equals = (): HTMLButtonElement => key('=', 'calc.equals', compute, 'calc-equals primary');

    const renderKeys = (): void => {
      const rows: HTMLElement[] = [];
      memKeys.replaceChildren(...(state.mode === 'programmer' ? [] : memory()));
      if (state.mode === 'standard') {
        rows.push(...edit());
        rows.push(key('%', 'calc.percent', undefined, 'calc-op'), key('±', 'calc.sign', () => {
          input.value = /^-\(.*\)$/.test(input.value) ? input.value.slice(2, -1) : `-(${input.value})`;
          input.focus();
        }, 'calc-op'), key('ans', 'calc.ans', undefined, 'calc-op'), key('÷', 'calc.divide', undefined, 'calc-op'));
        const d = digits();
        rows.push(d[0]!, d[1]!, d[2]!, key('×', 'calc.multiply', undefined, 'calc-op'), d[3]!, d[4]!, d[5]!, key('−', 'calc.minus', undefined, 'calc-op'), d[6]!, d[7]!, d[8]!, key('+', 'calc.plus', undefined, 'calc-op'));
        rows.push(key('0', null, undefined, 'calc-digit calc-wide'), key('.', 'calc.point'), equals());
      } else if (state.mode === 'scientific') {
        rows.push(fn('sin', 'calc.sin'), fn('cos', 'calc.cos'), fn('tan', 'calc.tan'), key('π', 'calc.pi'), key('e', 'calc.e'));
        rows.push(fn('asin', 'calc.asin'), fn('acos', 'calc.acos'), fn('atan', 'calc.atan'), key('^', 'calc.power', undefined, 'calc-op'), key('!', 'calc.factorial', undefined, 'calc-op'));
        rows.push(fn('sinh', 'calc.sinh'), fn('cosh', 'calc.cosh'), fn('tanh', 'calc.tanh'), fn('sqrt', 'calc.sqrt'), fn('root', 'calc.root'));
        rows.push(fn('ln', 'calc.ln'), fn('log', 'calc.log'), fn('exp', 'calc.exp'), fn('cbrt', 'calc.cbrt'), fn('abs', 'calc.abs'));
        rows.push(fn('floor', 'calc.floor'), fn('ceil', 'calc.ceil'), fn('round', 'calc.round'), key('mod', 'calc.mod', () => insert(' mod '), 'calc-op'), fn('nCr', 'calc.ncr'));
        rows.push(fn('nPr', 'calc.npr'), key('rand()', 'calc.rand', () => insert('rand()')), key(',', 'calc.comma'), key('E', 'calc.exponent', () => insert('e')), key('ans', 'calc.ans', undefined, 'calc-op'));
        rows.push(...edit(), key('÷', 'calc.divide', undefined, 'calc-op'));
        const d = digits();
        rows.push(d[0]!, d[1]!, d[2]!, key('×', 'calc.multiply', undefined, 'calc-op'), key('%', 'calc.percent', undefined, 'calc-op'));
        rows.push(d[3]!, d[4]!, d[5]!, key('−', 'calc.minus', undefined, 'calc-op'), h('span', { class: 'calc-blank', 'aria-hidden': 'true' }));
        rows.push(d[6]!, d[7]!, d[8]!, key('+', 'calc.plus', undefined, 'calc-op'), h('span', { class: 'calc-blank', 'aria-hidden': 'true' }));
        rows.push(key('0', null, undefined, 'calc-digit calc-wide'), key('.', 'calc.point'), equals(), h('span', { class: 'calc-blank', 'aria-hidden': 'true' }));
      } else {
        const ok = (d: string): boolean => parseInt(d, 16) < state.base;
        const op = (text: string, label: MessageKey, ins = ` ${text} `): HTMLButtonElement => key(text, label, () => insert(ins), 'calc-op');
        rows.push(op('and', 'calc.and'), op('or', 'calc.or'), op('xor', 'calc.xor'), key('not', 'calc.not', () => insert('not '), 'calc-op'), op('nand', 'calc.nand'));
        rows.push(op('nor', 'calc.nor'), op('<<', 'calc.shl'), op('>>', 'calc.shr'), op('rol', 'calc.rol'), op('ror', 'calc.ror'));
        const hex = ['A', 'B', 'C', 'D', 'E', 'F'].map((x) => {
          const b = key(x, null, () => insert(x), 'calc-digit');
          b.disabled = state.base !== 16;
          return b;
        });
        const [clear, back, open, shut] = edit();
        rows.push(...hex.slice(0, 5), hex[5]!, op('mod', 'calc.mod'), open!, shut!, key('÷', 'calc.divide', undefined, 'calc-op'));
        const d = digits(ok);
        rows.push(d[0]!, d[1]!, d[2]!, key('×', 'calc.multiply', undefined, 'calc-op'), clear!);
        rows.push(d[3]!, d[4]!, d[5]!, key('−', 'calc.minus', undefined, 'calc-op'), back!);
        rows.push(d[6]!, d[7]!, d[8]!, key('+', 'calc.plus', undefined, 'calc-op'), key('ans', 'calc.ans', undefined, 'calc-op'));
        rows.push(key('0', null, undefined, 'calc-digit calc-wide'), key('±', 'calc.sign', () => {
          input.value = /^-\(.*\)$/.test(input.value) ? input.value.slice(2, -1) : `-(${input.value})`;
          input.focus();
          preview();
        }, 'calc-op'), key('^', 'calc.power', undefined, 'calc-op'), equals());
      }
      keys.className = `calc-keys calc-keys-${state.mode}`;
      keys.replaceChildren(...rows);
    };

    const select = <T extends string | number>(label: MessageKey, value: T, choices: [T, string][], change: (v: T) => void): HTMLLabelElement => {
      const s = h('select', { 'aria-label': t(label) }, ...choices.map(([v, text]) => h('option', { value: String(v), ...(v === value ? { selected: true } : {}) }, text)));
      s.addEventListener('change', () => {
        const picked = choices.find(([v]) => String(v) === s.value);
        if (picked) change(picked[0]);
        saveCalcState(state);
        input.focus();
      });
      return h('label', {}, `${t(label)} `, s);
    };

    const renderOptions = (): void => {
      if (state.mode === 'scientific') {
        const digitsInput = h('input', { type: 'number', min: '1', max: '17', value: String(state.digits) });
        digitsInput.addEventListener('change', () => {
          state.digits = Math.min(17, Math.max(1, Math.round(Number(digitsInput.value) || 12)));
          digitsInput.value = String(state.digits);
          saveCalcState(state);
        });
        const constant = h('select', { 'aria-label': t('calc.constants') }, h('option', { value: '' }, t('calc.constants')), ...CONSTANTS.map((c) => h('option', { value: c.name }, `${c.name} — ${t(`calc.const.${c.key}` as MessageKey)}`)));
        constant.addEventListener('change', () => {
          if (constant.value) insert(constant.value);
          constant.value = '';
        });
        options.replaceChildren(
          select<AngleUnit>('calc.angle', state.angle, [['deg', t('calc.deg')], ['rad', t('calc.rad')], ['grad', t('calc.grad')]], (v) => (state.angle = v)),
          select<Notation>('calc.notation', state.notation, [['normal', t('calc.normal')], ['sci', t('calc.sci')], ['eng', t('calc.eng')]], (v) => (state.notation = v)),
          h('label', {}, `${t('calc.digits')} `, digitsInput),
          constant,
        );
      } else if (state.mode === 'programmer') {
        options.replaceChildren(
          select<Base>('calc.inputBase', state.base, [[10, 'DEC'], [16, 'HEX'], [8, 'OCT'], [2, 'BIN']], (v) => {
            // The number shown is written again in the new base.
            state.base = v;
            if (lastValue !== undefined) input.value = formatInteger(lastValue, v, word()).replace(/ /g, '');
            renderKeys();
          }),
          select<number>('calc.word', state.bits, [[8, t('calc.bits8')], [16, t('calc.bits16')], [32, t('calc.bits32')], [64, t('calc.bits64')], [0, t('calc.unbounded')]], (v) => {
            state.bits = v;
            preview();
            renderBases();
          }),
          (() => {
            const box = h('input', { type: 'checkbox', ...(state.signed ? { checked: true } : {}) });
            box.addEventListener('change', () => {
              state.signed = box.checked;
              saveCalcState(state);
              preview();
              renderBases();
            });
            return h('label', {}, box, ` ${t('calc.signed')}`);
          })(),
        );
      } else options.replaceChildren();
    };

    const word = (): Word => ({ bits: state.bits, signed: state.signed });

    /** CALC-005: the value in every base, and its bits to click. */
    const renderBases = (): void => {
      if (state.mode !== 'programmer') {
        bases.replaceChildren();
        bitGrid.replaceChildren();
        return;
      }
      const v = lastValue ?? 0n;
      bases.replaceChildren(
        ...([[16, 'HEX'], [10, 'DEC'], [8, 'OCT'], [2, 'BIN']] as [Base, string][]).map(([b, name]) =>
          h('div', { class: `calc-base${b === state.base ? ' current' : ''}` }, h('span', { class: 'calc-base-name' }, name), h('code', {}, formatInteger(v, b, word()))),
        ),
      );
      const bits = bitsOf(v, word());
      bitGrid.replaceChildren(
        ...bits
          .map((on, i) => {
            const b = button(t('calc.bit', { n: i }), () => {
              lastValue = toggleBit(v, i, word());
              input.value = formatInteger(lastValue, state.base, word()).replace(/ /g, '');
              renderBases();
              bitGrid.querySelector<HTMLButtonElement>(`[data-bit="${i}"]`)?.focus();
            }, { text: on ? '1' : '0', pressed: on, className: 'calc-bit' });
            b.dataset.bit = String(i);
            return b;
          })
          .reverse(),
      );
      bitGrid.hidden = !bits.length;
    };

    const renderHistory = (): void => {
      const entries = state.history.filter((e) => e.mode === state.mode);
      historyList.replaceChildren(
        ...entries.map((e) =>
          h(
            'li',
            {},
            h('span', { class: 'calc-history-expr' }, e.expr),
            h('span', { class: 'calc-history-result' }, ` = ${e.result}`),
            ' ',
            button(t('calc.reuse'), () => {
              input.value = e.expr;
              input.focus();
              preview();
            }, { className: 'link' }),
            ' ',
            button(t('calc.useResult'), () => insert(e.mode === 'programmer' ? formatInteger(BigInt(e.result), state.base, word()).replace(/ /g, '') : e.result), { className: 'link' }),
            ' ',
            button(t('calc.copy'), () => void navigator.clipboard?.writeText(e.result).catch(() => undefined), { className: 'link' }),
          ),
        ),
      );
      if (!entries.length) historyList.replaceChildren(h('li', { class: 'hint' }, t('calc.noHistory')));
    };

    const renderMode = (): void => {
      for (const tab of tabs.querySelectorAll<HTMLButtonElement>('[role=tab]')) {
        const on = tab.dataset.mode === state.mode;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
      }
      dialog.dataset.mode = state.mode;
      ans = state.history.find((e) => e.mode === state.mode)?.result ?? '';
      lastValue = undefined;
      input.value = '';
      output.textContent = '';
      output.classList.remove('calc-error');
      renderOptions();
      renderKeys();
      renderBases();
      renderHistory();
      memoryLine.hidden = state.mode === 'programmer';
      renderMemory();
      saveCalcState(state);
    };

    for (const mode of MODES) {
      const tab = h('button', { type: 'button', role: 'tab', class: 'calc-tab', 'data-mode': mode, 'aria-controls': 'calc-panel' }, t(`calc.mode.${mode}` as MessageKey));
      tab.addEventListener('click', () => {
        state.mode = mode;
        renderMode();
        input.focus();
      });
      tabs.append(tab);
    }
    // Arrows move between the tabs (ARIA tabs pattern).
    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = MODES.indexOf(state.mode);
      state.mode = MODES[(i + (e.key === 'ArrowRight' ? 1 : MODES.length - 1)) % MODES.length]!;
      renderMode();
      tabs.querySelector<HTMLButtonElement>(`[data-mode="${state.mode}"]`)?.focus();
      e.preventDefault();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        compute();
      }
    });
    input.addEventListener('input', preview);

    dialog.append(
      h('div', { class: 'calc-head' }, h('h2', { id: 'calc-title' }, t('calc.title')), tabs),
      h(
        'div',
        { id: 'calc-panel', role: 'tabpanel', class: 'calc-panel', 'aria-labelledby': 'calc-title' },
        h('div', { class: 'calc-main' }, options, input, output, memoryLine, bases, bitGrid, memKeys, keys),
        h('section', { class: 'calc-history', 'aria-label': t('calc.history') }, h('h3', {}, t('calc.history')), historyList, button(t('calc.clearHistory'), () => {
          state.history = state.history.filter((e) => e.mode !== state.mode);
          saveCalcState(state);
          renderHistory();
        }, { className: 'link' })),
      ),
      h('p', { class: 'hint calc-hint' }, t('calc.hint')),
      h('div', { class: 'dialog-actions' }, button(t('common.close'), close)),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    host.append(dialog);
    renderMode();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    input.focus();
  });
}
