/**
 * FOLDER-029: the outline of the open text document in the side column —
 * its headings indented by level, a click going to the heading, the heading
 * of the part shown marked.
 */
import { button, h } from '../app/dom';
import { t } from '../i18n';

export interface OutlineHost {
  headings(): { level: number; text: string; pos: number }[];
  /** Show the heading at this position. */
  go(pos: number): void;
  /** The element of the heading at this position (to know which part is shown). */
  dom(pos: number): HTMLElement | undefined;
}

export class OutlinePanel {
  readonly element: HTMLElement;
  private readonly list = h('ol', { class: 'doc-outline-list' });
  private items: { pos: number; li: HTMLLIElement }[] = [];

  constructor(private readonly host: OutlineHost) {
    this.element = h('aside', { class: 'doc-outline', 'aria-label': t('outline.title'), hidden: true }, h('h2', {}, t('outline.title')), this.list);
  }

  get open(): boolean {
    return !this.element.hidden;
  }

  toggle(open = !this.open): void {
    this.element.hidden = !open;
    if (open) this.refresh();
  }

  refresh(): void {
    if (!this.open) return;
    const heads = this.host.headings();
    this.items = heads.map((x) => {
      const li = h('li', { class: `outline-l${x.level}` }, button(x.text, () => this.host.go(x.pos), { className: 'link', title: x.text }));
      return { pos: x.pos, li };
    });
    this.list.replaceChildren(...(this.items.length ? this.items.map((i) => i.li) : [h('li', { class: 'hint' }, t('outline.empty'))]));
    this.mark();
  }

  /** Mark the last heading above the top of the visible part. */
  mark(): void {
    if (!this.open || !this.items.length) return;
    let current = this.items[0]!;
    for (const item of this.items) {
      const el = this.host.dom(item.pos);
      if (el && el.getBoundingClientRect().top <= 120) current = item;
    }
    for (const item of this.items) {
      if (item === current) item.li.setAttribute('aria-current', 'location');
      else item.li.removeAttribute('aria-current');
    }
  }
}
