import { expect, test } from '@playwright/test';
import { fakeFolder, openApp, openFile, openLocalFolder, saveAs } from './helpers';

test('a click shows the link in a bubble, Ctrl+click follows it, and the setting can make a click follow it (DOC-055)', async ({ page }) => {
  const errors = await openApp(page);
  await fakeFolder(page, { 'Home.md': '# Home\n\nSee [[Plan]] and [the site](https://example.org/page).\n', 'Plan.md': '# Plan\n\nThe goals of the plan.\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'Home.md' }).click();
  const editor = page.locator('.doc-page');
  await expect(editor.locator('h1')).toHaveText('Home');

  // A click: the bubble, the document staying open.
  await editor.getByRole('link', { name: 'the site' }).click();
  const bubble = page.getByRole('toolbar', { name: 'Link', exact: true });
  await expect(bubble).toContainText('https://example.org/page');
  await expect(editor.locator('h1')).toHaveText('Home');
  // Remove the link: its text stays.
  await bubble.getByRole('button', { name: 'Remove the link' }).click();
  await expect(editor.getByRole('link', { name: 'the site' })).toHaveCount(0);
  await expect(editor).toContainText('the site');
  await expect(bubble).toBeHidden();
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('Home.md'))).toContain('and the site.');

  // A wiki link: the note it points to, and Ctrl+click follows it.
  await editor.getByRole('link', { name: 'Plan' }).click();
  await expect(bubble).toContainText('Plan');
  await editor.getByRole('link', { name: 'Plan' }).click({ modifiers: ['ControlOrMeta'] });
  await expect(editor.locator('h1')).toHaveText('Plan');

  // The setting (also in the View menu): a click follows the link.
  await page.getByLabel('View', { exact: true }).first().selectOption({ label: 'Follow the link' });
  await panel.getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'Home.md' }).click();
  await expect(editor.locator('h1')).toHaveText('Home');
  await editor.getByRole('link', { name: 'Plan' }).click();
  await expect(editor.locator('h1')).toHaveText('Plan');
  expect(errors).toEqual([]);
});

test('the pointer resting on a link to a note shows the beginning of the note (DOC-057)', async ({ page }) => {
  const errors = await openApp(page);
  await fakeFolder(page, { 'Home.md': '# Home\n\nSee [[Plan#Goals]].\n', 'Plan.md': '# Plan\n\nIntro.\n\n## Goals\n\nThe goals of the plan.\n\n## Other\n\nElse.\n' });
  await openLocalFolder(page);
  await page.getByRole('complementary', { name: 'Folder' }).getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'Home.md' }).click();
  const editor = page.locator('.doc-page');
  await editor.getByRole('link', { name: /Plan/ }).hover();
  const preview = page.locator('.note-preview');
  await expect(preview).toContainText('The goals of the plan.');
  await expect(preview).not.toContainText('Else.');
  // The document stays.
  await expect(editor.locator('h1')).toHaveText('Home');
  await page.mouse.move(5, 5);
  await expect(preview).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the live preview shows the Markdown of the block holding the cursor, and reads it again when the cursor leaves (DOC-056)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'live.md', '# Title\n\nSome **bold** text.\n\nSecond paragraph.\n', 'text/markdown');
  const editor = page.locator('.doc-page');
  const view = page.getByLabel('View', { exact: true }).first();
  await view.selectOption({ label: 'Live preview' });
  await expect(editor.locator('strong')).toHaveText('bold');
  await editor.getByText('Some').click();
  const shown = editor.locator('.live-source');
  await expect(shown).toHaveText('Some **bold** text.');
  // Typed as Markdown.
  await page.keyboard.press('End');
  await page.keyboard.type(' And *more*.');
  await editor.getByText('Second paragraph.').click();
  await expect(editor.locator('p').first()).toContainText('Some bold text. And more.');
  await expect(editor.locator('em')).toHaveText('more');
  await expect(editor.locator('.live-source')).toHaveText('Second paragraph.');
  // The heading shows its #.
  await editor.locator('h1').click();
  await expect(editor.locator('.live-source')).toHaveText('# Title');
  const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
  expect(md).toBe('# Title\n\nSome **bold** text. And *more*.\n\nSecond paragraph.\n');
  expect(errors).toEqual([]);
});

test('the setting of a click on a link is in the settings window too (DOC-055)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('tab', { name: 'Writing' }).click();
  await expect(settings.getByLabel('Click on a link')).toHaveValue('show');
  await settings.getByLabel('Click on a link').selectOption('follow');
  expect(await page.evaluate(() => localStorage.getItem('pwo.doc.linkClick'))).toBe('follow');
  expect(errors).toEqual([]);
});
