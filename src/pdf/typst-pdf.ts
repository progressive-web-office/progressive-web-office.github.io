/**
 * PDF-020: a text document typeset as a PDF in the browser, by Typst — no
 * print dialog: its fonts embedded, its links, its table of contents as
 * bookmarks. The engine (about 11 MB) and the fonts are downloaded once,
 * after the user agrees, then kept for offline use.
 */
import { button, h } from '../app/dom';
import { DownloadConsent } from '../code/consent';
import { t } from '../i18n';
import type { RichDocument } from '../document/model';
import { writeTypst } from '../document/typst-writer';
import { FONT_ORIGIN, fontUrls } from './typst-fonts';
import type { TypstReply, TypstRequest } from './typst.worker';

/** The version of the engine, as in package.json (checked by a test). */
export const TYPST_COMPILER_VERSION = '0.7.0';
export const TYPST_WASM = `${FONT_ORIGIN}/npm/@myriaddreamin/typst-ts-web-compiler@${TYPST_COMPILER_VERSION}/pkg/typst_ts_web_compiler_bg.wasm`;

export type TypstStep = 'engine' | 'fonts' | 'typeset';

export interface PdfOptions {
  /** Where the question is asked. */
  host: HTMLElement;
  fileName?: string;
  progress?(step: TypstStep): void;
}

const consent = new DownloadConsent();
let worker: Worker | undefined;
let nextId = 0;

/** Whether all these files are kept already (nothing to download, nothing to ask). */
async function allCached(urls: string[]): Promise<boolean> {
  try {
    const cache = await caches.open('pwo-typst');
    for (const url of urls) if (!(await cache.match(url))) return false;
    return true;
  } catch {
    return false;
  }
}

/** May the engine and the fonts be downloaded? */
export function confirmTypstDownload(host: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'typst-download-title' });
    const finish = (ok: boolean): void => {
      dialog.close();
      dialog.remove();
      resolve(ok);
    };
    dialog.append(
      h('h2', { id: 'typst-download-title' }, t('pdfx.downloadTitle')),
      h('p', {}, t('pdfx.downloadText', { origin: FONT_ORIGIN })),
      h('p', { class: 'hint' }, t('pdfx.downloadHint')),
      h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), button(t('pdfx.downloadAllow'), () => finish(true), { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(false);
    });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  });
}

/** The document as a PDF. */
export async function typesetPdf(doc: RichDocument, opts: PdfOptions): Promise<Uint8Array> {
  const { renderDiagrams } = await import('../document/io');
  doc = (await import('../document/note-export')).forExport(doc);
  const out = writeTypst(doc, { diagrams: await renderDiagrams(doc, 'pdf'), labels: { references: t('bib.title') }, fileName: opts.fileName, now: new Date() });
  const fonts = fontUrls(out.fonts);
  if (!(await allCached([TYPST_WASM, ...fonts])) && !(await consent.ask(FONT_ORIGIN, () => confirmTypstDownload(opts.host)))) throw new Error(t('pdfx.refused'));
  worker ??= new Worker(new URL('./typst.worker.ts', import.meta.url), { type: 'module' });
  const id = ++nextId;
  const w = worker;
  return new Promise<Uint8Array>((resolve, reject) => {
    const listen = (e: MessageEvent<TypstReply>): void => {
      const reply = e.data;
      if (reply.id !== id) return;
      if ('progress' in reply) return void opts.progress?.(reply.progress);
      w.removeEventListener('message', listen);
      if ('pdf' in reply) resolve(reply.pdf);
      else reject(new Error(reply.error));
    };
    w.addEventListener('message', listen);
    w.addEventListener('error', (e) => reject(new Error(e.message || 'Typst failed')), { once: true });
    const request: TypstRequest = { id, wasmUrl: TYPST_WASM, fontUrls: fonts, source: out.source, files: [...out.files], equations: out.equations };
    w.postMessage(request);
  });
}
