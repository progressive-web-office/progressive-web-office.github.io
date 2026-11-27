/** PSEUDO-002: the notice shown before the first pseudonymisation, acknowledged with a check box. */
import { button, h } from '../../app/dom';
import { t } from '../../i18n';
import { acknowledgeNotice, noticeAcknowledged } from '../settings';

const POINTS = ['pseudo.notice.what', 'pseudo.notice.limits', 'pseudo.notice.responsible', 'pseudo.notice.table', 'pseudo.notice.ai', 'pseudo.notice.warranty'] as const;

export function noticeBody(): HTMLElement {
  return h('ul', { class: 'pseudo-notice' }, ...POINTS.map((k) => h('li', {}, t(k))));
}

/** Show the notice; with `ask`, resolve true only once the user has acknowledged it. */
export function showNotice(host: HTMLElement, ask: boolean): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog pseudo-dialog', 'aria-labelledby': 'pseudo-notice-title' });
    const box = h('input', { type: 'checkbox', id: 'pseudo-notice-ack' });
    const ok = button(ask ? t('common.continue') : t('common.ok'), () => close(true), { className: 'primary' });
    if (ask) {
      ok.disabled = true;
      box.addEventListener('change', () => (ok.disabled = !box.checked));
    }
    const close = (value: boolean): void => {
      if (value && ask) acknowledgeNotice();
      dialog.close();
      dialog.remove();
      resolve(value || !ask);
    };
    dialog.append(
      h('h2', { id: 'pseudo-notice-title' }, t('pseudo.notice.title')),
      noticeBody(),
      ...(ask ? [h('label', { class: 'pseudo-check' }, box, ` ${t('pseudo.notice.ack')}`)] : []),
      h('div', { class: 'dialog-actions' }, ask ? button(t('common.cancel'), () => close(false)) : null, ok),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close(false);
    });
    host.append(dialog);
    dialog.showModal();
  });
}

/** The notice, if it was not acknowledged yet (or has changed since). */
export async function ensureNotice(host: HTMLElement): Promise<boolean> {
  return noticeAcknowledged() || showNotice(host, true);
}
