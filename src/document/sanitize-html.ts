/**
 * MD-023: HTML blocks of Markdown files shown sanitised. The HTML is parsed as
 * an inert document, and a new tree is built from an allow-list of tags and
 * attributes: no scripts, styles, event handlers, frames, forms or
 * `javascript:` links ever reach the page.
 */

const TAGS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'details',
  'dfn', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li',
  'mark', 'ol', 'p', 'pre', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup',
  'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'u', 'ul', 'var', 'wbr',
]);
/** Tags whose content is dropped with them. */
const DROPPED = new Set(['script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'noscript', 'svg', 'math', 'form', 'input', 'button', 'select', 'textarea', 'link', 'meta', 'base', 'head', 'title']);
const ATTRS = new Set(['align', 'alt', 'colspan', 'rowspan', 'height', 'width', 'title', 'open', 'start', 'reversed', 'type', 'datetime', 'dir', 'lang', 'cite', 'span']);

/** A link the page may follow: web, mail, or an anchor of the document. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (h.startsWith('#')) return h;
  try {
    const u = new URL(h, 'https://invalid.example/');
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' ? h : null;
  } catch {
    return null;
  }
}

/** Only pictures carried in the HTML itself (or resolved by the caller): no requests to other sites from a note. */
const safeImage = (src: string): boolean => /^data:image\/(png|jpe?g|gif|webp|bmp|avif);base64,/i.test(src.trim()) || src.startsWith('blob:');

export function sanitizeHtml(html: string, doc: Document = document): DocumentFragment {
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const out = doc.createDocumentFragment();
  const copy = (from: Node, into: Node, depth: number): void => {
    if (depth > 64) return;
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === 3) {
        into.appendChild(doc.createTextNode(child.textContent ?? ''));
        continue;
      }
      if (child.nodeType !== 1) continue;
      const el = child as Element;
      const tag = el.localName;
      if (DROPPED.has(tag)) continue;
      if (!TAGS.has(tag)) {
        // An unknown element: its content stays, without it.
        copy(el, into, depth + 1);
        continue;
      }
      if (tag === 'img' && !safeImage(el.getAttribute('src') ?? '')) {
        const alt = el.getAttribute('alt');
        if (alt) into.appendChild(doc.createTextNode(alt));
        continue;
      }
      const made = doc.createElement(tag);
      for (const a of Array.from(el.attributes)) {
        const name = a.name.toLowerCase();
        if (ATTRS.has(name)) made.setAttribute(name, a.value);
      }
      if (tag === 'a') {
        const href = safeHref(el.getAttribute('href') ?? '');
        if (href) {
          made.setAttribute('href', href);
          if (!href.startsWith('#')) {
            made.setAttribute('target', '_blank');
            made.setAttribute('rel', 'noopener noreferrer');
          }
        }
      }
      if (tag === 'img') made.setAttribute('src', el.getAttribute('src')!.trim());
      copy(el, made, depth + 1);
      into.appendChild(made);
    }
  };
  copy(parsed.body, out, 0);
  return out;
}
