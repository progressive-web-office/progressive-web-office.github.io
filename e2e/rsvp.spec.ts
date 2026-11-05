import { expect, test } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { openApp, openFile } from './helpers';

// RSVP-001..RSVP-007: speed reading, one word at a time.

test('reads a Markdown note from the cursor, word by word, back to the last word read (RSVP-001..RSVP-006)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'read.md', '# Title\n\nFirst sentence here. Second one, slowly.\n\nLast paragraph words.\n', 'text/markdown');
  const doc = page.getByRole('textbox', { name: 'Document' });
  await doc.getByText('Last paragraph').click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+Alt+s');
  const reader = page.getByRole('dialog', { name: 'Speed reading' });
  const word = reader.locator('.rsvp-word');
  // Paused at the first word, its sentence shown; the eye fixes its second letter.
  await expect(word).toHaveText('Last');
  await expect(reader.locator('.rsvp-pivot')).toHaveText('a');
  await expect(reader.getByRole('status')).toHaveText('Last paragraph words.');
  await page.keyboard.press('ArrowRight');
  await expect(word).toHaveText('paragraph');
  await page.keyboard.press('Control+ArrowLeft');
  await expect(word).toHaveText('Last');
  await page.keyboard.press('Control+ArrowLeft');
  await expect(word).toHaveText('Second');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(word).toHaveText('slowly.');
  await page.keyboard.press('ArrowUp');
  await expect(reader.getByLabel('Speed, in words per minute')).toHaveValue('325');
  await expect(reader.locator('.rsvp-left')).toContainText('left');

  // Back to the text, the cursor at the last word read.
  await page.keyboard.press('Escape');
  await expect(reader).toBeHidden();
  await page.keyboard.type('X');
  await expect(doc).toContainText('Second one, Xslowly.');

  // The speed is remembered; the command palette offers the reader.
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await palette.getByRole('combobox').fill('Speed reading');
  await palette.getByRole('combobox').press('Enter');
  await expect(reader.getByLabel('Speed, in words per minute')).toHaveValue('325');
  // RSVP-007: three words at a time, never past a sentence.
  await reader.getByLabel('Words at a time').selectOption('3');
  await expect(word).toHaveText('Xslowly.');
  await page.keyboard.press('Control+ArrowLeft');
  await expect(word).toHaveText('Second one, Xslowly.');

  // Read, slowly: the words go by, then paused again.
  await reader.getByLabel('Speed, in words per minute').fill('100');
  await reader.getByLabel('Speed, in words per minute').press('Enter');
  await page.keyboard.press('Space');
  await expect(reader.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(word).not.toHaveText('Second one, Xslowly.');
  await page.keyboard.press('Space');
  await expect(reader.getByRole('button', { name: 'Read' })).toBeVisible();
  await reader.getByRole('button', { name: 'Done' }).click();
  expect(errors).toEqual([]);
});

test('reads a PDF file from the current page, and goes to the page of the last word (RSVP-001, RSVP-005)', async ({ page }) => {
  const errors = await openApp(page);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) pdf.addPage([595, 842]).drawText(`Hello page ${i}.`, { x: 72, y: 760, size: 24, font });
  await openFile(page, 'three.pdf', Buffer.from(await pdf.save()), 'application/pdf');
  await page.getByRole('button', { name: 'Next page' }).click();
  // The smooth scroll to page 2 over.
  const top = (): Promise<number> => page.locator('.pdf-scroll').evaluate((el) => el.scrollTop);
  await expect.poll(async () => {
    const before = await top();
    await page.waitForTimeout(150);
    return before > 0 && before === (await top());
  }).toBe(true);
  await expect(page.getByLabel('Page number')).toHaveValue('2');
  await page.getByRole('button', { name: 'Speed reading' }).click();
  const reader = page.getByRole('dialog', { name: 'Speed reading' });
  await expect(reader.locator('.rsvp-word')).toHaveText('Hello');
  await expect(reader.getByRole('status')).toHaveText('Hello page 2.');
  await page.keyboard.press('Control+ArrowRight');
  await expect(reader.getByRole('status')).toHaveText('Hello page 3.');
  await page.keyboard.press('Escape');
  await expect(reader).toBeHidden();
  await expect(page.getByLabel('Page number')).toHaveValue('3');
  expect(errors).toEqual([]);
});
