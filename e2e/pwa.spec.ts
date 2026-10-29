import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';

test('lists recently opened files and reopens them (FILE-008, FILE-009)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'remember-me.md', '# Remember me\n');
  await expect(page.locator('.doc-page h1')).toHaveText('Remember me');
  await page.getByRole('button', { name: 'Close' }).click();
  const entry = page.getByRole('button', { name: 'Open remember-me.md' });
  await expect(entry).toBeVisible();
  // Date and time it was opened.
  await expect(entry.locator('.meta')).toHaveText(/ · opened \d{1,2}\/\d{1,2}\/\d{2}, \d{1,2}:\d{2}\s?[AP]M$/);
  await page.reload();
  await entry.click();
  await expect(page.locator('.doc-page h1')).toHaveText('Remember me');
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Remove remember-me.md from recent files' }).click();
  await expect(entry).toHaveCount(0);
});

test('works offline once loaded (PLT-003, PLT-004)', async ({ page, context }) => {
  await openApp(page);
  // wait until the service worker has precached everything and is activated
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker?.getRegistration())?.active?.state ?? 'none'), { timeout: 20_000 })
    .toBe('activated');
  await page.reload();
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Progressive Web Office' })).toBeVisible();
  await page.getByRole('button', { name: 'New spreadsheet' }).click();
  await expect(page.getByRole('grid', { name: 'Spreadsheet' })).toBeVisible();
  await context.setOffline(false);
});

test('serves a valid web app manifest with file handlers', async ({ request }) => {
  const res = await request.get('manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('Progressive Web Office');
  expect(manifest.short_name).toBe('PWO');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  expect(manifest.file_handlers[0].accept['application/pdf']).toEqual(['.pdf']);
  expect(manifest).toMatchObject({ lang: 'en', dir: 'ltr', orientation: 'any' });
  // PLT-009
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toEqual(['./?new=document', './?new=spreadsheet', './?new=presentation']);
  expect(manifest.screenshots.map((s: { form_factor: string }) => s.form_factor).sort()).toEqual(['narrow', 'narrow', 'narrow', 'wide', 'wide', 'wide']);
  for (const shot of manifest.screenshots) expect((await request.get(shot.src)).ok(), shot.src).toBe(true);
});

test('starts a new document from an app shortcut (PLT-009)', async ({ page }) => {
  await page.goto('./?new=spreadsheet');
  await expect(page.getByRole('grid', { name: 'Spreadsheet' })).toBeVisible();
  await expect(page).not.toHaveURL(/new=/);
});
