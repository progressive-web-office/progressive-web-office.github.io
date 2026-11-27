import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([595, 842]).drawText(`Page ${i}`, { x: 72, y: 760, size: 24, font });
  return Buffer.from(await doc.save());
}

test('keeps settings by category: two whole pages side by side, page by page, in review mode (SET-001, SET-002)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
  await dialog.getByLabel('Your name').fill('Ann Lee');
  await dialog.getByLabel('Your name').press('Tab');
  await dialog.getByRole('tab', { name: 'Reading and review' }).click();
  await dialog.getByLabel('Pages side by side').selectOption('2');
  await dialog.getByLabel('Zoom').selectOption('page');
  await dialog.getByLabel('Page layout').selectOption('pages');
  await dialog.getByLabel('Remember the last choice made in the toolbar').uncheck();
  await dialog.getByLabel('Review mode for every file').check();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await openFile(page, 'report.pdf', await pdf(5), 'application/pdf');
  await expect(page.locator('.pdf-page:visible')).toHaveCount(2);
  await expect(page.getByRole('combobox', { name: 'Pages side by side' })).toHaveValue('2');
  await expect(page.getByRole('button', { name: 'Review mode' })).toHaveAttribute('aria-pressed', 'true');
  // A choice of the toolbar is not kept: the settings are.
  await page.getByRole('combobox', { name: 'Pages side by side' }).selectOption('1');
  await page.reload();
  await openFile(page, 'report.pdf', await pdf(5), 'application/pdf');
  await expect(page.getByRole('combobox', { name: 'Pages side by side' })).toHaveValue('2');

  // The settings are found in the palette too, and kept.
  await page.keyboard.press('Control+Shift+P');
  await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('paramètres');
  await page.keyboard.press('Enter');
  await expect(dialog.getByLabel('Your name')).toHaveValue('Ann Lee');
  await dialog.getByRole('tab', { name: 'Reading and review' }).click();
  await expect(dialog.getByLabel('Page layout')).toHaveValue('pages');
  expect(errors).toEqual([]);
});

test('the review mode is one switch for every file (REVIEW-006)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'notes.md', '# Notes\n\nSome text.\n', 'text/markdown');
  await page.getByRole('button', { name: 'Review mode', exact: true }).click();
  await expect(page.getByRole('toolbar', { name: 'Review' })).toBeVisible();
  // Another file opens in review mode too.
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'report.pdf', await pdf(2), 'application/pdf');
  const review = page.getByRole('toolbar', { name: 'PDF' }).getByRole('button', { name: 'Review mode' });
  await expect(review).toHaveAttribute('aria-pressed', 'true');
  // Left in one file, it is left for all.
  await review.click();
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'notes.md', '# Notes\n\nSome text.\n', 'text/markdown');
  await expect(page.getByRole('toolbar', { name: 'Formatting' })).toBeVisible();
  await expect(page.getByRole('toolbar', { name: 'Review' })).toBeHidden();
  expect(errors).toEqual([]);
});

test('the name of the settings signs comments and shows the user in a collaboration, never asked again (SET-003)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pwo.collab.transport', 'local'));
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByLabel('Your name').fill('Ann Lee');
  await dialog.getByLabel('Your name').press('Tab');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New document' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.click();
  await page.keyboard.type('Check this');
  // No question: the name is known.
  let asked = false;
  page.on('dialog', (d) => {
    asked = true;
    void d.dismiss();
  });
  await page.keyboard.press('Control+Alt+m');
  const panel = page.getByRole('complementary', { name: 'Comments' });
  await panel.getByRole('textbox', { name: 'New comment' }).fill('Why?');
  await panel.getByRole('button', { name: 'Post', exact: true }).click();
  await expect(panel.getByRole('article', { name: 'Comment by Ann Lee' })).toBeVisible();
  await page.getByRole('button', { name: 'Collaborate' }).click();
  await page.getByRole('dialog', { name: 'Invite people' }).getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('.collab-person.self')).toContainText('Ann Lee');
  expect(asked).toBe(false);
  expect(errors).toEqual([]);
});

test('every file opens at the zoom of the settings, 100 % by default: a zoom of the toolbar is for the file open only (SET-002)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'notes.md', '# Notes\n\nSome text.\n', 'text/markdown');
  await page.getByRole('button', { name: 'Review mode', exact: true }).click();
  const bar = page.getByRole('toolbar', { name: 'Review' });
  await expect(bar.locator('.zoom-label')).toHaveText('100%');
  await bar.getByRole('button', { name: 'Fit to width' }).click();
  await expect(bar.locator('.zoom-label')).not.toHaveText('100%');
  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  await openFile(page, 'other.md', '# Other\n\nMore text.\n', 'text/markdown');
  await expect(page.getByRole('toolbar', { name: 'Review' }).locator('.zoom-label')).toHaveText('100%');
  expect(errors).toEqual([]);
});
