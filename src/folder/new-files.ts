/**
 * GIT-015: new documents made right in the open folder — on disk, on a
 * server, in a repository (where saving is a commit) — in the format family
 * chosen in the settings.
 */
import type { NewFileKind } from '../fs';
import { defaultFormat } from '../core/format-preference';
import { fileExtension } from '../core/format';
import { t } from '../i18n';

const blob = (bytes: Uint8Array | string): Blob => new Blob([bytes as BlobPart]);

export function officeNewFiles(): NewFileKind[] {
  const untitled = t('folder.untitled');
  const doc = defaultFormat('document');
  const sheet = defaultFormat('spreadsheet');
  const pres = defaultFormat('presentation');
  return [
    {
      label: `${t('start.newDocument')} (.${fileExtension(doc)})`,
      icon: '📝',
      name: `${untitled}.${fileExtension(doc)}`,
      content: async () => {
        const [{ writeDocument }, { emptyDocument }] = await Promise.all([import('../document/io'), import('../document/model')]);
        return blob(writeDocument(emptyDocument(), doc as Parameters<typeof writeDocument>[1]));
      },
    },
    {
      label: `${t('start.newSpreadsheet')} (.${fileExtension(sheet)})`,
      icon: '📊',
      name: `${untitled}.${fileExtension(sheet)}`,
      content: async () => {
        const [{ writeWorkbook }, { newWorkbook }] = await Promise.all([import('../sheet/io'), import('../sheet/model')]);
        return blob(writeWorkbook(newWorkbook(), sheet as Parameters<typeof writeWorkbook>[1]));
      },
    },
    {
      label: `${t('start.newPresentation')} (.${fileExtension(pres)})`,
      icon: '📽️',
      name: `${untitled}.${fileExtension(pres)}`,
      content: async () => {
        const [{ writePresentation }, { emptyPresentation }] = await Promise.all([import('../slides/io'), import('../slides/model')]);
        return blob(writePresentation(emptyPresentation(), pres as Parameters<typeof writePresentation>[1]));
      },
    },
    // CANVAS-004: a canvas (JSON Canvas).
    {
      label: t('canvas.new'),
      icon: '🧩',
      name: `${untitled}.canvas`,
      content: async () => blob((await import('../canvas/model')).emptyCanvasText()),
    },
    {
      label: `${t('start.newDrawing')} (.svg)`,
      name: `${untitled}.svg`,
      content: async () => {
        const [{ toSvg }, { emptyDrawing }] = await Promise.all([import('../draw/svg'), import('../draw/model')]);
        return blob(toSvg(emptyDrawing()));
      },
    },
  ];
}
