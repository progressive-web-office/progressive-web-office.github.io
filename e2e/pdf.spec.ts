import { expect, test } from '@playwright/test';
import { PDFDocument, PDFName, StandardFonts, decodePDFRawStream } from '@pdfme/pdf-lib';
import { openApp, openFile, saveAs, answerName } from './helpers';

async function samplePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Hello page ${i}`, { x: 72, y: 760, size: 24, font });
  }
  const field = doc.getForm().createTextField('full_name');
  field.addToPage(doc.getPage(0), { x: 72, y: 700, width: 220, height: 24 });
  const box = doc.getForm().createCheckBox('accept');
  box.addToPage(doc.getPage(0), { x: 72, y: 660, width: 16, height: 16 });
  return Buffer.from(await doc.save());
}

async function download(page: import('@playwright/test').Page): Promise<Buffer> {
  const d = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const stream = await (await d).createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

test('highlights text and adds notes saved as PDF annotations (PDF-018)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'sample.pdf', await samplePdf(), 'application/pdf');
  const span = page.locator('.pdf-page').first().locator('.textLayer span', { hasText: 'Hello page 1' });
  await expect(span).toBeVisible();
  await span.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  });
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await answerName(page, 'Prof');
  const panel = page.getByRole('complementary', { name: 'Annotations' });
  const card = panel.getByRole('article', { name: 'Highlight, page 1' });
  await expect(card).toContainText('Prof');
  await card.getByRole('textbox', { name: 'Comment' }).fill('Say more.');
  await expect(page.locator('.pdf-highlight').first()).toBeVisible();

  await page.getByRole('button', { name: 'Note', exact: true }).click();
  await page.locator('.pdf-page').nth(1).click({ position: { x: 100, y: 100 } });
  await panel.getByRole('article', { name: 'Note, page 2' }).getByRole('textbox', { name: 'Comment' }).fill('Good.');
  await expect(page.locator('.pdf-page').nth(1).locator('.pdf-note-icon')).toBeVisible();

  const saved = await download(page);
  const doc = await PDFDocument.load(saved);
  const kinds = (i: number): string[] => {
    const annots = doc.getPage(i).node.Annots();
    if (!annots) return [];
    return annots.asArray().map((ref) => String((doc.context.lookup(ref) as import('@pdfme/pdf-lib').PDFDict).get(PDFName.of('Subtype'))));
  };
  expect(kinds(0)).toContain('/Highlight');
  expect(kinds(1)).toEqual(['/Text']);

  // Reopened, the annotations are listed with their comments.
  await openFile(page, 'annotated.pdf', saved, 'application/pdf');
  await expect(panel.getByRole('article')).toHaveCount(2);
  await expect(panel).toContainText('Say more.');
  await expect(panel).toContainText('Good.');
  expect(errors).toEqual([]);
});

test('adds text boxes and arrows with the drawing editor, saved as vectors and edited again (PDF-021)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'sample.pdf', await samplePdf(), 'application/pdf');
  await expect(page.locator('.pdf-page').first().locator('.textLayer span', { hasText: 'Hello page 1' })).toBeVisible();
  await page.getByRole('button', { name: 'Draw', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing on page 1' });
  await expect(dialog.locator('image.draw-background')).toHaveCount(1);
  // The page cannot change size.
  await expect(dialog.getByLabel('Width', { exact: true })).toHaveCount(0);

  // The text tool is chosen: a click, then the text is typed in place, on two lines.
  const stage = dialog.locator('svg.draw-stage');
  const box = (await stage.boundingBox())!;
  // The page as wide as the window: the symbols and objects panels hidden.
  await expect(dialog.locator('.draw-library')).toBeHidden();
  expect(box.width).toBeGreaterThan(900);
  await page.mouse.click(box.x + box.width * 0.2, box.y + 120);
  const editor = dialog.locator('.draw-text-editor');
  await expect(editor).toBeFocused();
  await editor.pressSequentially('Approved');
  await editor.press('Enter');
  await editor.pressSequentially('by Ada');
  // DRAW-020: the first line alone, bold and larger.
  await editor.press('Control+Home');
  await editor.press('Shift+End');
  await editor.press('Control+B');
  await dialog.getByLabel('Size', { exact: true }).selectOption('24');
  await expect(editor).toBeFocused();
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/pdf-draw-typing.png' });
  await editor.press('Escape');
  await expect(dialog.locator('.draw-objects button', { hasText: 'Approved' })).toHaveCount(1);
  await expect(dialog.locator('.draw-content text > tspan')).toHaveText(['Approved', 'by Ada']);
  await expect(dialog.locator('.draw-content tspan[font-weight="bold"][font-size="24"]')).toHaveText('Approved');

  // An arrow pointing at it.
  await dialog.getByRole('button', { name: 'Arrow' }).click();
  // The page fills the window's width: near the text, in view.
  const at = (await dialog.locator('.draw-content text').boundingBox())!;
  await page.mouse.move(at.x + at.width + 150, at.y + at.height + 80);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width + 10, at.y + at.height / 2, { steps: 4 });
  await page.mouse.up();
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.pdf-page').first().locator('.pdf-drawing-layer text > tspan')).toHaveText(['Approved', 'by Ada']);
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/pdf-draw-page.png' });

  // The form's fields are annotations too: the stamps alone.
  const stamps = (doc: PDFDocument): import('@pdfme/pdf-lib').PDFDict[] =>
    (doc.getPage(0).node.Annots()?.asArray() ?? []).map((ref) => doc.context.lookup(ref) as import('@pdfme/pdf-lib').PDFDict).filter((a) => String(a.get(PDFName.of('Subtype'))) === '/Stamp');
  const contents = (a: import('@pdfme/pdf-lib').PDFDict): string => (a.get(PDFName.of('Contents')) as import('@pdfme/pdf-lib').PDFHexString).decodeText();
  const saved = await download(page);
  const doc = await PDFDocument.load(saved);
  expect(stamps(doc)).toHaveLength(1);
  expect(contents(stamps(doc)[0]!)).toBe('Approved\nby Ada');
  const appearance = (a: import('@pdfme/pdf-lib').PDFDict): string => {
    const ap = (a.lookup(PDFName.of('AP')) as import('@pdfme/pdf-lib').PDFDict).lookup(PDFName.of('N')) as import('@pdfme/pdf-lib').PDFRawStream;
    return new TextDecoder().decode(decodePDFRawStream(ap).decode());
  };
  // The bold part in Helvetica Bold, the rest in Helvetica.
  expect(appearance(stamps(doc)[0]!)).toContain('/F2 24 Tf');
  expect(appearance(stamps(doc)[0]!)).toContain('/F1 16 Tf');

  // Opened again: one drawing, editable, not drawn twice.
  await openFile(page, 'drawn.pdf', saved, 'application/pdf');
  await expect(page).toHaveTitle(/^drawn\.pdf/);
  const edit = page.getByRole('button', { name: 'Drawing on page 1, editable again' });
  await expect(edit).toBeVisible();
  await edit.click();
  const again = page.getByRole('dialog', { name: 'Drawing on page 1' });
  await expect(again.locator('.draw-objects button')).toHaveCount(2);
  // A double click edits the text in place.
  const text = again.locator('.draw-content text');
  const tb = (await text.boundingBox())!;
  await page.mouse.dblclick(tb.x + 5, tb.y + 5);
  const editor2 = again.locator('.draw-text-editor');
  await expect(editor2).toBeFocused();
  await expect(editor2.locator('span', { hasText: 'Approved' })).toHaveCSS('font-weight', '700');
  await editor2.press('Control+End');
  await editor2.pressSequentially(' L.');
  await editor2.press('Control+Enter');
  await again.getByRole('button', { name: 'Done' }).click();
  const doc2 = await PDFDocument.load(await download(page));
  expect(stamps(doc2)).toHaveLength(1);
  expect(contents(stamps(doc2)[0]!)).toBe('Approved\nby Ada L.');
  expect(errors).toEqual([]);
});

test('finds text in the pages (PDF-017)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'sample.pdf', await samplePdf(), 'application/pdf');
  await expect(page.locator('.pdf-page').first().locator('.textLayer')).toContainText('Hello page 1');
  await page.locator('.pdf-scroll').focus();
  await page.keyboard.press('Control+f');
  const input = page.getByRole('searchbox', { name: 'Find in the document' });
  await expect(input).toBeFocused();
  await input.fill('PAGE');
  await expect(page.locator('.pdf-find-count')).toHaveText('1 of 3');
  await expect(page.locator('.pdf-page').first().locator('mark.pdf-hit.current')).toHaveText('page');
  await input.press('Enter');
  await input.press('Enter');
  await expect(page.locator('.pdf-find-count')).toHaveText('3 of 3');
  await expect(page.locator('.pdf-page').nth(2).locator('mark.pdf-hit.current')).toHaveText('page');
  await input.fill('nowhere');
  await expect(page.locator('.pdf-find-count')).toHaveText('Not found');
  await input.press('Escape');
  await expect(page.locator('mark.pdf-hit')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('fits the whole page and shows pages side by side (PDF-016)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'sample.pdf', await samplePdf(), 'application/pdf');
  const pages = page.locator('.pdf-page');
  await expect(pages).toHaveCount(3);
  const scroller = page.locator('.pdf-scroll');
  await page.getByRole('button', { name: 'Whole page' }).click();
  // The whole page is in view: its height fits the scrolling area.
  await expect.poll(async () => (await pages.first().boundingBox())!.height).toBeLessThanOrEqual((await scroller.boundingBox())!.height);
  await page.getByLabel('Pages side by side').selectOption('2');
  await expect.poll(async () => (await pages.nth(1).boundingBox())!.y).toBeCloseTo((await pages.first().boundingBox())!.y, 0);
  const [a, b] = [(await pages.first().boundingBox())!, (await pages.nth(1).boundingBox())!];
  expect(b.x).toBeGreaterThan(a.x + a.width);
  await expect.poll(async () => (await pages.nth(2).boundingBox())!.y).toBeGreaterThan(a.y + a.height);
  // The choice is kept for the next PDF.
  await page.reload();
  await openFile(page, 'sample.pdf', await samplePdf(), 'application/pdf');
  await expect(page.getByLabel('Pages side by side')).toHaveValue('2');
});

test('views a PDF, navigates, zooms and selects text (PDF-001..005)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'sample.pdf', await samplePdf(), 'application/pdf');
  await expect(page.locator('.pdf-page')).toHaveCount(3);
  await expect(page.locator('.pdf-page').first().locator('canvas')).toBeVisible();
  await expect(page.locator('.pdf-page').first().locator('.textLayer')).toContainText('Hello page 1');
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.getByLabel('Page number')).toHaveValue('2');
  const before = await page.locator('.pdf-page').first().boundingBox();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await page.locator('.pdf-page').first().boundingBox())!.width).toBeGreaterThan(before!.width);
  expect(errors).toEqual([]);
});

test('fills form fields, adds text and saves a valid PDF (PDF-008, PDF-009, PDF-013)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'form.pdf', await samplePdf(), 'application/pdf');
  await page.getByLabel('full_name').fill('Ada Lovelace');
  await page.getByLabel('accept').check();
  page.once('dialog', (d) => void d.accept('2026-10-01'));
  await page.getByRole('button', { name: 'Add text' }).click();
  await expect(page.locator('.pdf-stamp.text')).toHaveCount(1);
  const saved = await download(page);
  const doc = await PDFDocument.load(saved);
  expect(doc.getForm().getTextField('full_name').getText()).toBe('Ada Lovelace');
  expect(doc.getForm().getCheckBox('accept').isChecked()).toBe(true);
  expect(doc.getPageCount()).toBe(3);
});

test('saves a flattened copy whose fields can no longer be edited (PDF-010)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'form.pdf', await samplePdf(), 'application/pdf');
  await page.getByLabel('full_name').fill('Ada Lovelace');
  await page.getByLabel('accept').check();

  // The flattened PDF is a copy: the open document keeps its editable fields.
  const flat = await saveAs(page, 'Flattened PDF – fields locked (.pdf)');
  expect(flat.name).toBe('form-flattened.pdf');
  const frozen = await PDFDocument.load(flat.data);
  expect(frozen.getForm().getFields()).toHaveLength(0);
  expect(frozen.getPageCount()).toBe(3);
  await expect(page.locator('.doc-name')).toHaveText('form.pdf');
  await expect(page.locator('.modified')).toBeVisible();
  await expect(page.locator('.app-alert')).toContainText('form-flattened.pdf');

  // Saving normally keeps the fields editable for later changes.
  const editable = await PDFDocument.load(await download(page));
  expect(editable.getForm().getTextField('full_name').getText()).toBe('Ada Lovelace');

  // Reopened, the flattened copy shows no form controls.
  await openFile(page, 'form-flattened.pdf', flat.data, 'application/pdf');
  await expect(page.locator('.pdf-page').first().locator('canvas')).toBeVisible();
  await expect(page.getByLabel('full_name')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('draws a handwritten signature, places it and saves it into the PDF (PDF-011, PDF-012)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'sign.pdf', await samplePdf(), 'application/pdf');
  await page.getByRole('button', { name: 'Add signature' }).click();
  const pad = page.getByLabel('Signature drawing area');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(box.x + 30 + i * 15, box.y + 60 + Math.sin(i) * 25);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Place signature' }).click();
  const stamp = page.locator('.pdf-stamp.image');
  await expect(stamp).toHaveCount(1);
  // move it with the keyboard
  await stamp.focus();
  await page.keyboard.press('Shift+ArrowDown');
  const saved = await download(page);
  const doc = await PDFDocument.load(saved);
  const { PDFName } = await import('@pdfme/pdf-lib');
  expect(doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'))).toBeDefined();
});

test('remembers the signature only when asked, and forgets it (PDF-014)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'sign.pdf', await samplePdf(), 'application/pdf');
  const draw = async () => {
    const box = (await page.getByLabel('Signature drawing area').boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + 30 + i * 20, box.y + 60 + Math.sin(i) * 20);
    await page.mouse.up();
  };
  // Not remembered without consent.
  await page.getByRole('button', { name: 'Add signature' }).click();
  await draw();
  await page.getByRole('button', { name: 'Place signature' }).click();
  expect(await page.evaluate(() => localStorage.getItem('pwo.pdf.signature'))).toBeNull();
  // Remembered when ticked.
  await page.getByRole('button', { name: 'Add signature' }).click();
  await expect(page.getByRole('button', { name: 'Use this signature' })).toHaveCount(0);
  await draw();
  await page.getByLabel(/Remember this signature/).check();
  await page.getByRole('button', { name: 'Place signature' }).click();
  // Used again in one click.
  await page.getByRole('button', { name: 'Add signature' }).click();
  await page.getByRole('button', { name: 'Use this signature' }).click();
  await expect(page.locator('.pdf-stamp.image')).toHaveCount(3);
  // Forgotten.
  await page.getByRole('button', { name: 'Add signature' }).click();
  await page.getByRole('button', { name: 'Forget it' }).click();
  await expect(page.getByRole('button', { name: 'Use this signature' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('pwo.pdf.signature'))).toBeNull();
});
