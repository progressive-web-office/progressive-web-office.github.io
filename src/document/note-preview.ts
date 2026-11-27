/**
 * DOC-057: the beginning of a note shown in a popup when the pointer rests
 * on a link to it (at once with Ctrl held), without leaving the document —
 * the whole note, the section of its heading or its block, as embeds show
 * them (MD-027).
 */

export interface NotePreviewHooks {
  enabled(): boolean;
  /** The note as an embed (`Note#Heading`), or undefined when no folder is open. */
  render(ref: string): HTMLElement | undefined;
}

/** The note a link points to: a wiki link, or a relative link to a Markdown file. */
export function previewRef(href: string): string | undefined {
  const decode = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  if (href.startsWith('wiki:')) return decode(href.slice('wiki:'.length).replace(/^!/, '')) || undefined;
  if (/^[a-z][a-z0-9+.-]*:|^\/\/|^#/i.test(href)) return undefined;
  return /\.(md|markdown)(#|$)/i.test(href) ? decode(href) : undefined;
}

const DELAY = 500;

/** Watch the links of `root`; returns a function that stops. */
export function attachNotePreview(root: HTMLElement, hooks: NotePreviewHooks): () => void {
  let popup: HTMLElement | undefined;
  let link: HTMLElement | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };
  const hide = (): void => {
    clear();
    popup?.remove();
    popup = undefined;
    link = undefined;
  };
  const show = (a: HTMLElement, ref: string): void => {
    hide();
    const body = hooks.render(ref);
    if (!body) return;
    link = a;
    popup = document.createElement('div');
    popup.className = 'note-preview';
    popup.setAttribute('role', 'tooltip');
    popup.append(body);
    popup.addEventListener('mouseenter', clear);
    popup.addEventListener('mouseleave', () => (timer = setTimeout(hide, 300)));
    document.body.append(popup);
    const r = a.getBoundingClientRect();
    popup.style.left = `${Math.max(4, Math.min(r.left, window.innerWidth - popup.offsetWidth - 8))}px`;
    // The note is read after it shows, and grows: on the side with more room, away from the link.
    const room = { below: window.innerHeight - r.bottom - 10, above: r.top - 10 };
    if (room.below >= 240 || room.below >= room.above) {
      popup.style.top = `${r.bottom + 6}px`;
      popup.style.maxHeight = `${Math.max(120, Math.min(360, room.below))}px`;
    } else {
      popup.style.bottom = `${window.innerHeight - r.top + 6}px`;
      popup.style.maxHeight = `${Math.max(120, Math.min(360, room.above))}px`;
    }
  };
  const over = (e: MouseEvent): void => {
    const a = (e.target as HTMLElement).closest?.<HTMLElement>('a[href]');
    if (!a || !root.contains(a) || !hooks.enabled()) return;
    const ref = previewRef(a.getAttribute('href') ?? '');
    if (!ref || a === link) return;
    clear();
    if (e.ctrlKey || e.metaKey) show(a, ref);
    else timer = setTimeout(() => show(a, ref), DELAY);
  };
  const out = (e: MouseEvent): void => {
    const a = (e.target as HTMLElement).closest?.('a[href]');
    if (!a || a.contains(e.relatedTarget as Node | null)) return;
    clear();
    if (popup && !popup.contains(e.relatedTarget as Node | null)) timer = setTimeout(hide, 300);
  };
  const key = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') hide();
  };
  // Scrolling the page moves the link away; scrolling the popup does not.
  const scrolled = (e: Event): void => {
    if (!popup?.contains(e.target as Node)) hide();
  };
  root.addEventListener('mouseover', over);
  root.addEventListener('mouseout', out);
  document.addEventListener('keydown', key);
  window.addEventListener('scroll', scrolled, true);
  return () => {
    hide();
    root.removeEventListener('mouseover', over);
    root.removeEventListener('mouseout', out);
    document.removeEventListener('keydown', key);
    window.removeEventListener('scroll', scrolled, true);
  };
}
