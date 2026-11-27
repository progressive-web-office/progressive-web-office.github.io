/**
 * DOC-055: the bubble of the link holding the cursor — its address or the
 * note it points to, and Open, Edit, Copy the address, Remove the link. It
 * shows when a click (or the keyboard) puts the cursor in a link, the click
 * staying in the text; Ctrl+click follows the link.
 */
import { Plugin } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from './schema';
import { linkAt, linkRange } from './commands';

export interface LinkBubbleHooks {
  /** Whether bubbles are shown (editing, links shown on a click). */
  enabled(): boolean;
  open(href: string): void;
  edit(): void;
  copy(text: string): void;
  labels: { bubble: string; open: string; edit: string; copy: string; remove: string; note: string };
}

/** What a link points to, as shown: the note (and its heading or block) of a wiki link, else the address. */
export function linkLabel(href: string): { note: boolean; text: string } {
  if (!href.startsWith('wiki:')) return { note: false, text: href };
  let target = href.slice('wiki:'.length).replace(/^!/, '');
  try {
    target = decodeURIComponent(target);
  } catch {
    /* as written */
  }
  return { note: true, text: target };
}

class Bubble {
  readonly el: HTMLElement;
  private href = '';
  private readonly onScroll = (): void => this.place();
  private readonly onBlur = (e: FocusEvent): void => {
    if (!this.el.contains(e.relatedTarget as Node | null)) this.hide();
  };

  constructor(
    private readonly view: EditorView,
    private readonly hooks: LinkBubbleHooks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'link-bubble';
    this.el.setAttribute('role', 'toolbar');
    this.el.setAttribute('aria-label', hooks.labels.bubble);
    this.el.hidden = true;
    document.body.append(this.el);
    view.dom.addEventListener('focusout', this.onBlur);
    window.addEventListener('scroll', this.onScroll, true);
  }

  private button(label: string, run: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    // The cursor stays in the text.
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => {
      run();
      this.update();
    });
    return b;
  }

  update(): void {
    const state = this.view.state;
    const mark = this.hooks.enabled() ? linkAt(state) : undefined;
    const href = mark?.attrs.href as string | undefined;
    if (!href || href.startsWith('#') || (!this.view.hasFocus() && !this.el.contains(document.activeElement))) return this.hide();
    if (href !== this.href || this.el.hidden) {
      this.href = href;
      const { note, text } = linkLabel(href);
      const address = document.createElement('span');
      address.className = note ? 'link-bubble-href note' : 'link-bubble-href';
      address.textContent = note ? `${this.hooks.labels.note} ${text}` : text;
      address.title = text;
      this.el.replaceChildren(
        address,
        this.button(this.hooks.labels.open, () => this.hooks.open(href)),
        this.button(this.hooks.labels.edit, () => this.hooks.edit()),
        this.button(this.hooks.labels.copy, () => this.hooks.copy(text)),
        this.button(this.hooks.labels.remove, () => {
          const range = linkRange(this.view.state);
          if (range) this.view.dispatch(this.view.state.tr.removeMark(range.from, range.to, schema.marks.link!));
          this.view.focus();
        }),
      );
      this.el.hidden = false;
    }
    this.place();
  }

  private place(): void {
    if (this.el.hidden) return;
    const range = linkRange(this.view.state);
    if (!range) return this.hide();
    const at = this.view.coordsAtPos(range.from);
    this.el.style.left = `${Math.max(4, Math.min(at.left, window.innerWidth - this.el.offsetWidth - 4))}px`;
    this.el.style.top = `${at.bottom + 4}px`;
  }

  hide(): void {
    this.el.hidden = true;
    this.href = '';
  }

  destroy(): void {
    this.view.dom.removeEventListener('focusout', this.onBlur);
    window.removeEventListener('scroll', this.onScroll, true);
    this.el.remove();
  }
}

export function linkBubblePlugin(hooks: LinkBubbleHooks): Plugin {
  return new Plugin({
    view(view) {
      const bubble = new Bubble(view, hooks);
      const focus = (): void => bubble.update();
      view.dom.addEventListener('focus', focus);
      return {
        update: () => bubble.update(),
        destroy: () => {
          view.dom.removeEventListener('focus', focus);
          bubble.destroy();
        },
      };
    },
  });
}
