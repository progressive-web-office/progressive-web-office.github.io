/**
 * README and documentation screenshots: `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts`
 * writes them to docs/public/screenshots/. Skipped in normal test runs.
 */
import { test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

test.skip(!process.env.SCREENSHOTS, 'only when SCREENSHOTS=1');
// The settings of a first visit (compact toolbars), not those of the tests.
test.use({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', storageState: { cookies: [], origins: [] } });

const OUT = 'docs/public/screenshots';

const REPORT = `# Lab report: speed control

The motor follows a first-order model, with gain $K$ and time constant $\\tau$:

$$
G(s) = \\frac{K}{1 + \\tau s}
$$

| Test | Gain K | τ (s) | Overshoot |
| --- | --- | --- | --- |
| P controller | 2.1 | 0.40 | 18 % |
| PI controller | 2.1 | 0.40 | 6 % |

The PI controller removes the static error[^1].

[^1]: Measured over ten runs.
`;

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test('start screen', async ({ page }) => {
  await openApp(page);
  await shot(page, 'start');
});

test('text document', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page h1').waitFor();
  await shot(page, 'document');
});

test('spreadsheet', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'measures.csv', 'Time (s),Speed (rpm),Set point (rpm)\n0,0,1000\n0.2,420,1000\n0.4,690,1000\n0.6,850,1000\n0.8,930,1000\n1.0,968,1000\n1.2,985,1000\n1.4,993,1000\n');
  await page.getByRole('button', { name: 'Insert chart' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Chart type').selectOption('line');
  await dialog.getByLabel('Title', { exact: true }).fill('Step response');
  await dialog.getByLabel('Data range').fill('A1:C9');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  await shot(page, 'spreadsheet');
});

test('phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, colorScheme: 'light' });
  const page = await context.newPage();
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page h1').waitFor();
  await shot(page, 'phone');
  await context.close();
});

test('phone start screen and spreadsheet (manifest screenshots)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, colorScheme: 'light', storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await openApp(page);
  await shot(page, 'phone-start');
  await openFile(page, 'measures.csv', 'Time (s),Speed (rpm),Set point (rpm)\n0,0,1000\n0.2,420,1000\n0.4,690,1000\n0.6,850,1000\n0.8,930,1000\n1.0,968,1000\n1.2,985,1000\n1.4,993,1000\n');
  await page.getByRole('grid', { name: 'Spreadsheet' }).waitFor();
  await shot(page, 'phone-spreadsheet');
  await context.close();
});

test('letter (template, fields and springs)', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light', locale: 'fr-FR' });
  const page = await context.newPage();
  await openApp(page);
  await page.getByRole('button', { name: /Modèles et exemples/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Lettre', exact: true }).click();
  await page.locator('.doc-page p').first().waitFor();
  await shot(page, 'letter');
  await context.close();
});

test('command palette', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page h1').waitFor();
  await page.getByRole('button', { name: 'Commands', exact: true }).click();
  await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('insert');
  await shot(page, 'palette');
});

test('context menu', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'lab-report.md', REPORT);
  await page.locator('.doc-page td').first().click({ button: 'right' });
  await shot(page, 'context-menu');
});

test('designing a PDF form', async ({ page }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pdfPage = doc.addPage([595, 842]);
  pdfPage.drawText('Registration form', { x: 72, y: 760, size: 22, font: bold });
  ['Name', 'E-mail', 'Level', 'Newsletter'].forEach((label, i) => pdfPage.drawText(label, { x: 72, y: 700 - i * 40, size: 12, font }));
  const form = doc.getForm();
  form.createTextField('Name').addToPage(pdfPage, { x: 170, y: 694, width: 250, height: 20 });
  form.createTextField('E-mail').addToPage(pdfPage, { x: 170, y: 654, width: 250, height: 20 });
  await openApp(page);
  await openFile(page, 'registration.pdf', Buffer.from(await doc.save()), 'application/pdf');
  await page.locator('.pdf-page canvas').first().waitFor();
  await page.getByRole('button', { name: 'Design the form' }).click();
  await page.waitForTimeout(800);
  await shot(page, 'form-design');
});

test('templates and examples', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: /Templates and examples/ }).first().click();
  await page.locator('.template-dialog').waitFor();
  await shot(page, 'templates');
});

test('the properties of a PDF form field', async ({ page }) => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pdfPage = doc.addPage([595, 842]);
  pdfPage.drawText('Order form', { x: 72, y: 760, size: 22, font });
  pdfPage.drawText('Client code', { x: 72, y: 700, size: 12, font });
  await openApp(page);
  await openFile(page, 'order.pdf', Buffer.from(await doc.save()), 'application/pdf');
  await page.locator('.pdf-page canvas').first().waitFor();
  await page.getByRole('button', { name: 'Design the form' }).click();
  const box = (await page.locator('.pdf-page').first().boundingBox())!;
  await page.mouse.click(box.x + 170, box.y + 140);
  const dialog = page.getByRole('dialog', { name: 'Text' });
  await dialog.getByLabel(/Name of the field/).fill('Client code');
  await dialog.getByLabel(/^Tooltip/).fill('Two letters, then three digits');
  await dialog.getByLabel('Required').check();
  await dialog.getByLabel('Maximum number of characters').fill('5');
  await dialog.getByLabel('One box per character (comb)').check();
  await dialog.getByLabel('What may be typed').selectOption('regex');
  await dialog.getByLabel(/^Pattern/).fill('[A-Z]{2}\\d{3}');
  await dialog.getByLabel(/^Message when/).fill('Two letters, then three digits');
  await dialog.getByPlaceholder('Type a value to check it').fill('AB123');
  await page.setViewportSize({ width: 1280, height: 1250 });
  await dialog.evaluate((d) => d.scrollTo(0, 0));
  await shot(page, 'form-properties');
});

test('adding a device to the synchronisation', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pwo.collab.transport', 'local');
    localStorage.setItem('pwo.devsync', JSON.stringify({ device: 'd1', name: 'Laptop', understood: true, auto: true, peers: {}, base: {}, known: {}, deleted: {}, pairing: { room: 'room-of-the-screenshot', secret: 'the-key-of-the-documents-shot', since: 1 } }));
  });
  await page.setViewportSize({ width: 1280, height: 1100 });
  await openApp(page);
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('combobox', { name: 'Commands' }).fill('show an invitation');
  await page.keyboard.press('Enter');
  await page.locator('img.devsync-qr').waitFor();
  await shot(page, 'device-sync');
});

test('painting in layers', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await openApp(page);
  await page.getByRole('button', { name: /Templates and examples/ }).first().click();
  await page.getByRole('dialog').getByRole('tab', { name: /Examples/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Poster in layers' }).click();
  await page.getByRole('button', { name: 'Paint on the picture' }).click();
  const dialog = page.getByRole('dialog', { name: 'Painting' });
  await dialog.getByRole('listbox', { name: 'Layers' }).getByRole('option').first().click();
  await dialog.getByRole('button', { name: 'Select', exact: true }).click();
  const box = (await dialog.locator('canvas.paint-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.18);
  await shot(page, 'painting-layers');
});
