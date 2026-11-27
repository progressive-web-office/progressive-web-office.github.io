/**
 * MD-028: a page of a PDF file as a picture (a `blob:` URL), for an embed of
 * a note. pdf.js runs in its worker, its assets read from the application.
 */
export async function pdfPagePicture(bytes: Uint8Array, page: number, width = 640): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const asset = (dir: string): string => new URL(`pdfjs/${dir}/`, document.baseURI).href;
  const task = pdfjs.getDocument({ data: bytes.slice(), enableXfa: false, cMapUrl: asset('cmaps'), cMapPacked: true, standardFontDataUrl: asset('standard_fonts'), wasmUrl: asset('wasm'), iccUrl: asset('iccs') });
  try {
    const doc = await task.promise;
    const p = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
    const base = p.getViewport({ scale: 1 });
    const viewport = p.getViewport({ scale: (width * (window.devicePixelRatio || 1)) / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    await p.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('no picture');
    return URL.createObjectURL(blob);
  } finally {
    void task.destroy();
  }
}
