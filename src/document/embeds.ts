/**
 * Embeds of a note (MD-027, MD-028): `![[note]]`, `![[note#heading]]` and
 * `![[note#^id]]` shown in place, read-only — the whole note, the section
 * under the heading or the block — nested embeds up to three levels, an embed
 * of a note already shown not repeated; `![[file.pdf#page=N]]` as the picture
 * of that page; audio and video files as players.
 */
import type { Block, Paragraph, RichDocument } from './model';

export interface EmbeddedFile {
  path: string;
  bytes: Uint8Array;
}

/** Finds and reads the file an embed points to (in the open folder). */
export type EmbedLoader = (target: string) => Promise<EmbeddedFile | undefined>;

export interface EmbedLabels {
  open: string;
  missing: (name: string) => string;
  loop: string;
  loading: string;
}

export const MAX_DEPTH = 3;
const AUDIO: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac' };
const VIDEO: Record<string, string> = { webm: 'video/webm', mp4: 'video/mp4', mov: 'video/quicktime' };

/** `note#heading` → its parts; `file.pdf#page=3` → the page. */
export function parseEmbed(ref: string): { target: string; heading?: string; block?: string; page?: number } {
  const hash = ref.indexOf('#');
  const target = hash >= 0 ? ref.slice(0, hash) : ref;
  const sub = hash >= 0 ? ref.slice(hash + 1) : '';
  if (!sub) return { target };
  if (sub.startsWith('^')) return { target, block: sub.slice(1) };
  const page = /^page=(\d+)$/.exec(sub);
  if (page) return { target, page: Number(page[1]) };
  return { target, heading: sub };
}

export const extensionOf = (path: string): string => /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? '';

const textOf = (p: Paragraph): string => p.runs.map((r) => ('text' in r ? r.text : '')).join('');
const level = (b: Block): number => (b.type === 'paragraph' && /^h(\d)$/.test(b.style) ? Number(b.style[1]) : 0);
const fold = (s: string): string => s.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');

/** MD-027: the blocks of a note an embed shows — all of them, a section, or one block. */
export function embeddedBlocks(blocks: Block[], part: { heading?: string; block?: string }): Block[] | undefined {
  if (part.block) {
    const found = blocks.find((b) => b.type === 'paragraph' && b.blockId === part.block);
    return found ? [found] : undefined;
  }
  if (part.heading) {
    const wanted = fold(part.heading);
    const start = blocks.findIndex((b) => b.type === 'paragraph' && level(b) > 0 && fold(textOf(b)) === wanted);
    if (start < 0) return undefined;
    const lvl = level(blocks[start]!);
    let end = start + 1;
    while (end < blocks.length && !(level(blocks[end]!) > 0 && level(blocks[end]!) <= lvl)) end++;
    return blocks.slice(start, end);
  }
  return blocks;
}

/** The embeds alone in their paragraph (`![[note]]` on its own line), as nested embeds. */
const nestedRef = (b: Block): string | undefined => {
  if (b.type !== 'paragraph' || b.runs.length !== 1) return undefined;
  const r = b.runs[0]!;
  return 'text' in r && r.link?.startsWith('wiki:!') ? r.link.slice('wiki:!'.length) : undefined;
};

function box(kind: string, name: string, labels: EmbedLabels, open?: () => void): { el: HTMLElement; body: HTMLElement } {
  const el = document.createElement('div');
  el.className = `note-embed note-embed-${kind}`;
  el.contentEditable = 'false';
  const head = document.createElement('div');
  head.className = 'note-embed-head';
  const title = document.createElement('span');
  title.textContent = name;
  head.append(title);
  if (open) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'note-embed-open';
    b.textContent = '↗';
    b.title = labels.open;
    b.setAttribute('aria-label', `${labels.open}: ${name}`);
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', open);
    head.append(b);
  }
  const body = document.createElement('div');
  body.className = 'note-embed-body';
  body.textContent = labels.loading;
  el.append(head, body);
  return { el, body };
}

export interface EmbedContext {
  load: EmbedLoader;
  labels: EmbedLabels;
  /** Open the note or file (an embed's ↗). */
  open: (ref: string) => void;
  /** Read a note's Markdown into blocks (the editor's reader). */
  read: (markdown: string) => Promise<RichDocument>;
  /** Draw the blocks of a note read-only. */
  draw: (doc: RichDocument) => DocumentFragment;
  /** Draw a page of a PDF file as a picture (a blob: URL). */
  pdfPage?: (bytes: Uint8Array, page: number) => Promise<string>;
  /** Keep a URL, revoked when the editor goes. */
  keep?: (url: string) => void;
}

/** An embed, drawn now and filled when its file has been read. */
export function renderEmbed(ref: string, ctx: EmbedContext, depth = 1, shown: ReadonlySet<string> = new Set()): HTMLElement {
  const part = parseEmbed(ref);
  const name = part.target.split('/').pop() || part.target;
  const ext = extensionOf(part.target);
  const kind = ext === 'pdf' ? 'pdf' : AUDIO[ext] ? 'audio' : VIDEO[ext] ? 'video' : 'note';
  const { el, body } = box(kind, ref, ctx.labels, () => ctx.open(ref));
  const key = part.target.toLowerCase();
  if (kind === 'note' && shown.has(key)) {
    body.textContent = ctx.labels.loop;
    return el;
  }
  void (async () => {
    const file = await ctx.load(part.target).catch(() => undefined);
    if (!file) return void (body.textContent = ctx.labels.missing(name));
    body.replaceChildren();
    if (kind === 'audio' || kind === 'video') {
      const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: (AUDIO[ext] ?? VIDEO[ext])! }));
      ctx.keep?.(url);
      const media = document.createElement(kind);
      media.controls = true;
      media.preload = 'metadata';
      media.src = url;
      return void body.append(media);
    }
    if (kind === 'pdf') {
      if (!ctx.pdfPage) return void (body.textContent = name);
      const url = await ctx.pdfPage(file.bytes, part.page ?? 1).catch(() => '');
      if (!url) return void (body.textContent = name);
      ctx.keep?.(url);
      const img = document.createElement('img');
      img.src = url;
      img.alt = `${name}, ${part.page ?? 1}`;
      return void body.append(img);
    }
    const doc = await ctx.read(new TextDecoder().decode(file.bytes));
    const blocks = embeddedBlocks(doc.blocks, part);
    if (!blocks) return void (body.textContent = ctx.labels.missing(ref));
    const inner = new Set([...shown, key]);
    // Embeds alone on their line are shown in their turn, up to three levels.
    let run: Block[] = [];
    const flush = (): void => {
      if (run.length) body.append(ctx.draw({ ...doc, blocks: run }));
      run = [];
    };
    for (const b of blocks) {
      const nested = nestedRef(b);
      if (nested && depth < MAX_DEPTH) {
        flush();
        body.append(renderEmbed(nested, ctx, depth + 1, inner));
      } else run.push(b);
    }
    flush();
  })();
  return el;
}
