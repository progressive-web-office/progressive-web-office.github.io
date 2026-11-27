/**
 * CAS-001, CAS-002: the dialog of a math cell — the expression in a MathLive
 * math field (and its LaTeX), the operations that wrap it, and the text
 * sent to the engine, shown on request.
 */
import { button, h } from '../app/dom';
import { t, type MessageKey } from '../i18n';
import { loadMathLive } from '../math/mathlive';
import { CAS_OPS, wrapOp, type CasOpId, type OpArgs } from './ops';
import { sympyCell } from './sympy';

export interface MathCellValue {
  latex: string;
}

const ARG_LABEL: Record<CasOpId, Partial<Record<keyof OpArgs, MessageKey>>> = {
  simplify: {},
  expand: {},
  factor: {},
  numeric: {},
  solve: { v: 'cas.arg.v' },
  diff: { v: 'cas.arg.v' },
  integrate: { v: 'cas.arg.v', from: 'cas.arg.from', to: 'cas.arg.to' },
  limit: { v: 'cas.arg.v', to: 'cas.arg.towards' },
  series: { v: 'cas.arg.v', to: 'cas.arg.around', n: 'cas.arg.n' },
};

/** Insert (no `initial`) or edit a math cell; `functions` are those defined by the other cells. */
export async function editMathCell(host: HTMLElement, initial?: MathCellValue, functions: Iterable<string> = []): Promise<MathCellValue | null> {
  await loadMathLive();
  const known = [...functions];
  return new Promise((resolve) => {
    const field = document.createElement('math-field') as HTMLElement & { value: string };
    field.className = 'equation-field';
    field.setAttribute('aria-label', t('cas.field'));
    field.value = initial?.latex ?? '';
    const source = h('input', { type: 'text', class: 'equation-source', 'aria-label': t('math.source'), spellcheck: 'false' });
    source.value = initial?.latex ?? '';
    const code = h('pre', { class: 'cas-code' });
    const showCode = (): void => {
      const latex = source.value.trim();
      if (!latex) return void (code.textContent = '');
      try {
        code.textContent = sympyCell(latex, { functions: known });
        code.classList.remove('error');
      } catch (e) {
        code.textContent = (e as Error).message;
        code.classList.add('error');
      }
    };
    field.addEventListener('input', () => {
      source.value = field.value;
      showCode();
    });
    source.addEventListener('input', () => {
      field.value = source.value;
      showCode();
    });
    showCode();

    // The operations: they wrap the expression in their notation.
    const op = h('select', { 'aria-label': t('cas.operation') }, h('option', { value: '' }, t('cas.op.none')), ...CAS_OPS.map((o) => h('option', { value: o.id }, t(`cas.op.${o.id}` as MessageKey))));
    const inputs: Record<keyof OpArgs, HTMLInputElement> = {
      v: h('input', { type: 'text', size: '4', value: 'x', spellcheck: 'false' }),
      from: h('input', { type: 'text', size: '5', spellcheck: 'false' }),
      to: h('input', { type: 'text', size: '5', spellcheck: 'false' }),
      n: h('input', { type: 'text', size: '3', value: '6', spellcheck: 'false' }),
    };
    const labels = Object.fromEntries((Object.keys(inputs) as (keyof OpArgs)[]).map((k) => [k, h('span', {})])) as Record<keyof OpArgs, HTMLElement>;
    const argFields = (Object.keys(inputs) as (keyof OpArgs)[]).map((k) => h('label', { class: 'cas-arg', hidden: true }, labels[k], ' ', inputs[k]));
    const apply = button(t('cas.apply'), () => {
      const id = op.value as CasOpId | '';
      if (!id || !source.value.trim()) return;
      const args: OpArgs = {};
      for (const k of CAS_OPS.find((o) => o.id === id)!.args) args[k] = inputs[k].value;
      source.value = wrapOp(source.value.trim(), id, args);
      field.value = source.value;
      op.value = '';
      showArgs();
      showCode();
      field.focus();
    });
    apply.disabled = true;
    const showArgs = (): void => {
      const id = op.value as CasOpId | '';
      const wanted = id ? ARG_LABEL[id] : {};
      (Object.keys(inputs) as (keyof OpArgs)[]).forEach((k, i) => {
        const key = wanted[k];
        argFields[i]!.hidden = !key;
        if (key) {
          labels[k].textContent = t(key);
          inputs[k].setAttribute('aria-label', t(key));
        }
      });
      apply.disabled = !id;
    };
    op.addEventListener('change', showArgs);

    const dialog = h('dialog', { class: 'dialog equation-dialog cas-dialog', 'aria-labelledby': 'cas-title' });
    const keyboard = (window as unknown as { mathVirtualKeyboard?: { container: HTMLElement | null; hide(): void } }).mathVirtualKeyboard;
    const finish = (ok: boolean): void => {
      if (keyboard) {
        keyboard.hide();
        keyboard.container = document.body;
      }
      dialog.close();
      dialog.remove();
      resolve(ok && source.value.trim() ? { latex: source.value.trim() } : null);
    };
    dialog.append(
      h('h2', { id: 'cas-title' }, initial ? t('cas.editTitle') : t('cas.insertTitle')),
      field,
      h('label', { class: 'equation-label' }, 'LaTeX ', source),
      h('div', { class: 'cas-ops' }, op, ...argFields, apply),
      h('p', { class: 'hint' }, t('cas.hint')),
      h('details', { class: 'cas-details' }, h('summary', {}, t('cas.code')), code),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(initial ? t('math.update') : t('math.insert'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (keyboard) keyboard.container = dialog;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    setTimeout(() => field.focus(), 0);
  });
}
