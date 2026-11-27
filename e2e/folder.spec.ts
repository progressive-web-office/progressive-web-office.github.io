import { expect, test } from '@playwright/test';
import { fakeFolder, openLocalFolder } from './helpers';

test('works on a folder: tree, search, links, saving in place and master documents (FOLDER-001..003, DOC-028)', async ({ page }) => {
  await fakeFolder(page, {
    'main.md': '# Thesis\n\nSee [the first chapter](chapters/one.md).\n\n{{#include chapters/one.md}}\n\n{{#include chapters/two.md}}\n',
    'chapters/one.md': '# Control\n\nA PID regulator.\n',
    'chapters/two.md': '# Results\n\nThe regulator is stable.\n',
    'notes.txt': 'not shown in the tree',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 thesis' })).toBeVisible();
  await expect(panel.getByRole('button', { name: /\.md$|chapters/ })).toHaveText(['chapters', 'main.md']);
  await panel.getByRole('button', { name: 'chapters' }).click();
  await expect(panel.getByRole('button', { name: /\.md$/ })).toHaveText(['one.md', 'two.md', 'main.md']);

  // Search across the folder, then open a result at its match.
  await panel.getByLabel('Search the folder').fill('régulator');
  await expect(panel.getByText('2 matches in 2 documents')).toBeVisible();
  await panel.getByRole('button', { name: 'chapters/two.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Results');
  await expect(page.getByLabel('Find', { exact: true })).toHaveValue('régulator');
  await panel.getByLabel('Search the folder').fill('');

  // The master document: sub-documents, and Ctrl+click on a relative link.
  await panel.getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'main.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('div.include')).toHaveCount(2);
  await editor.getByRole('link', { name: 'the first chapter' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Control');
  await expect(panel.locator('[aria-current=page]')).toHaveText('one.md');

  // Saving writes the file back into the folder.
  await editor.locator('p').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Tuned.');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('chapters/one.md'))).toContain('A PID regulator. Tuned.');

  // Assembling the master document gives one file with its chapters.
  await panel.getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'main.md' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Assemble…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Assemble…' });
  await dialog.getByLabel('Markdown (.md)').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('main-assembled.md');
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  const md = Buffer.concat(chunks).toString();
  expect(md).toContain('# Control\n\nA PID regulator. Tuned.');
  expect(md).toContain('# Results');
  expect(md).not.toContain('{{#include');
});

test('creates, renames and deletes documents in the folder (FOLDER-004)', async ({ page }) => {
  await fakeFolder(page, { 'notes/a.md': '# A\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const files = () => page.evaluate(() => [...(window as unknown as { __folder: Map<string, string> }).__folder.keys()].sort());
  await panel.getByRole('button', { name: 'notes', exact: true }).click();
  page.once('dialog', (d) => void d.accept('Plan.md'));
  await panel.getByRole('button', { name: 'New document', exact: true }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Untitled');
  await expect.poll(files).toEqual(['notes/Plan.md', 'notes/a.md']);
  // Renaming the open document follows it.
  page.once('dialog', (d) => void d.accept('Outline.md'));
  await panel.getByRole('button', { name: 'Rename (F2)' }).click();
  await expect.poll(files).toEqual(['notes/Outline.md', 'notes/a.md']);
  await expect(page.locator('.doc-name')).toHaveText('Outline.md');
  await expect(panel.locator('[aria-current=page]')).toHaveText('Outline.md');
  await panel.locator('.fs-explorer').getByRole('button', { name: 'a.md', exact: true }).click();
  page.once('dialog', (d) => void d.accept());
  await panel.getByRole('button', { name: 'Delete (Del)' }).click();
  await expect.poll(files).toEqual(['notes/Outline.md']);
});

test('imports files, moves with the keyboard, sorts, filters names and undoes a deletion (FOLDER-008..011)', async ({ page }) => {
  await fakeFolder(page, { 'notes/a.md': '# A\n', 'notes/b.md': '# B\n', 'z.md': '# Z\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const files = () => page.evaluate(() => [...(window as unknown as { __folder: Map<string, string> }).__folder.keys()].sort());
  // Keyboard: open the folder with the right arrow, go down into it.
  await panel.getByRole('button', { name: 'notes', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('button', { name: 'a.md' })).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(panel.getByRole('button', { name: 'a.md' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(panel.getByRole('button', { name: 'b.md' })).toBeFocused();
  // Import into the selected file's folder; a taken name gets a number.
  await panel.locator('.fs-explorer input[type=file]').setInputFiles([{ name: 'a.md', mimeType: 'text/markdown', buffer: Buffer.from('# New\n') }]);
  await expect.poll(files).toEqual(['notes/a 2.md', 'notes/a.md', 'notes/b.md', 'z.md']);
  await expect(panel.locator('[data-path="notes/a 2.md"]')).toHaveAttribute('data-meta', /6 B/);
  // Sort by type keeps folders first, under the folder itself (FOLDER-032).
  await panel.getByLabel('Sort by').selectOption('size');
  await expect(panel.locator('.fs-tree > .fs-list > li > .fs-entry')).toHaveText(['thesis']);
  await expect(panel.locator('.fs-root + .fs-list > li > .fs-entry')).toHaveText(['notes', 'z.md']);
  // Select two files, delete them, then undo.
  await panel.getByRole('button', { name: 'a.md', exact: true }).click();
  await panel.getByRole('button', { name: 'b.md' }).click({ modifiers: ['ControlOrMeta'] });
  page.once('dialog', (d) => void d.accept());
  await panel.getByRole('button', { name: 'Delete (Del)' }).click();
  await expect.poll(files).toEqual(['notes/a 2.md', 'z.md']);
  await panel.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
  await expect.poll(files).toEqual(['notes/a 2.md', 'notes/a.md', 'notes/b.md', 'z.md']);
  // Names are found at once in the search box.
  await panel.getByLabel('Search the folder').fill('a 2');
  await expect(panel.locator('.folder-names').getByRole('button', { name: 'notes/a 2.md' })).toBeVisible();
});

test('keeps documents in the browser storage (FOLDER-006)', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Open a folder' }).click();
  const dialog = page.getByRole('dialog', { name: 'Open a folder' });
  await dialog.getByLabel('Browser storage').check();
  await dialog.getByRole('button', { name: 'Open' }).click();
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 Browser storage' })).toBeVisible();
  page.once('dialog', (d) => void d.accept('Draft.md'));
  await panel.getByRole('button', { name: 'New document', exact: true }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Untitled');
  // Still there after a reload.
  await page.reload();
  await page.getByRole('button', { name: 'Open a folder' }).click();
  await dialog.getByLabel('Browser storage').check();
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(panel.getByRole('button', { name: 'Draft.md' })).toBeVisible();
});

test('follows links between Markdown notes, shows backlinks and keeps links on rename (FOLDER-005)', async ({ page }) => {
  await fakeFolder(page, {
    'index.md': '# Index\n\nSee [[Control]] and [[Missing note]].\n',
    'notes/Control.md': '# Control\n\nA PID regulator.\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'index.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.getByRole('link', { name: 'Control' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Control');
  // FOLDER-026: under the page, by default.
  const backlinks = page.getByRole('region', { name: 'Notes linking here' });
  await expect(backlinks.getByRole('heading', { name: /Linked from \(1\)/ })).toBeVisible();
  await expect(page.locator('.doc-page-bottom .folder-backlink-list').getByRole('button', { name: 'index.md' })).toBeVisible();
  // Renaming the note updates the link in index.md.
  page.once('dialog', (d) => void d.accept('Regulation.md'));
  await panel.getByRole('button', { name: 'Rename (F2)' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('index.md'))).toContain('[[Regulation]]');
  // A link to a missing note creates it.
  await panel.getByRole('button', { name: 'index.md' }).first().click();
  page.once('dialog', (d) => void d.accept());
  await editor.getByRole('link', { name: 'Missing note' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Missing note');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.has('Missing note.md'))).toBe(true);
});

test('shows the backlinks under the page or in the side panel, and links the unlinked mentions (FOLDER-026)', async ({ page }) => {
  await fakeFolder(page, {
    'Project Alpha.md': '---\naliases: [PA]\n---\n# Project Alpha\n\nThe plan.\n',
    'a.md': '# A\n\nSee [[Project Alpha]] for the plan.\n',
    'b.md': '# B\n\nAlso [[Project Alpha|the project]].\n',
    'c.md': '# C\n\nWe talked about project alpha on Monday.\n',
    'd.md': '# D\n\nThe alphabet, and PA again.\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'Project Alpha.md' }).click();
  const backlinks = page.getByRole('region', { name: 'Notes linking here' });
  const bottom = page.locator('.doc-page-bottom');
  await expect(bottom.getByRole('heading', { name: /Linked from \(2\)/ })).toBeVisible();
  await expect(backlinks.locator('.folder-backlink-list').first().getByRole('button')).toHaveText(['a.md', 'b.md']);
  await expect(backlinks.locator('.folder-snippet').first()).toContainText('See [[Project Alpha]] for the plan.');

  // Unlinked mentions, when asked: the name or an alias written without a link.
  await backlinks.getByRole('button', { name: 'Find unlinked mentions' }).click();
  await expect(backlinks.getByRole('heading', { name: 'Unlinked mentions (2)' })).toBeVisible();
  await backlinks.locator('.folder-unlinked-row', { hasText: 'c.md' }).getByRole('button', { name: 'Make this mention a link to Project Alpha' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('c.md'))).toContain('We talked about [[Project Alpha|project alpha]] on Monday.');
  await expect(bottom.getByRole('heading', { name: /Linked from \(3\)/ })).toBeVisible();
  await expect(backlinks.getByRole('heading', { name: 'Unlinked mentions (1)' })).toBeVisible();
  await page.screenshot({ path: 'test-results/backlinks-bottom.png' });

  // The settings: without the words around, then in the side panel.
  await backlinks.getByRole('button', { name: 'Settings of the backlinks' }).click();
  await backlinks.getByLabel('Words around each link').uncheck();
  await expect(backlinks.locator('.folder-snippet')).toHaveCount(0);
  await backlinks.getByLabel('Shown').selectOption({ label: 'In the side panel' });
  await expect(panel.getByRole('region', { name: 'Notes linking here' })).toBeVisible();
  await expect(bottom).toBeHidden();
  // Kept for the next note.
  await panel.locator('.fs-explorer').getByRole('button', { name: 'a.md', exact: true }).click();
  await expect(panel.getByRole('region', { name: 'Notes linking here' }).getByRole('heading', { name: /Linked from \(0\)/ })).toBeVisible();
});

test('opens or creates the note of a day from the calendar, named and filed as set (FOLDER-027)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 9, 4, 9, 30));
  await fakeFolder(page, {
    'Journal/2026/10/2026-10-01.md': '# 2026-10-01\n\nMet the team.\n',
    'Templates/Day.md': '---\ndate: {{date:YYYY-MM-DD}}\n---\n# {{title}}\n\n## Tasks\n',
    'Project.md': '# Project\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  // Open at once in the panel.
  const calendar = panel.locator('.daily-calendar');
  await expect(calendar.locator('.daily-month')).toHaveText('October 2026');
  // The folder and template of the daily notes.
  await calendar.getByRole('button', { name: 'Settings of the daily notes' }).click();
  await calendar.getByLabel('Folder').fill('Journal');
  await calendar.getByLabel('Folder').press('Enter');
  await calendar.getByLabel('Template').fill('Templates/Day.md');
  await calendar.getByLabel('Template').dispatchEvent('change');
  await expect(calendar.locator('.daily-example')).toHaveText('Today: Journal/2026/10/2026-10-04.md — titled “2026-10-04”.');
  await expect(calendar.locator('.daily-day.has-note')).toHaveText(['1']);
  await expect(calendar.locator('.daily-day.today')).toHaveText('4');

  // A day with its note opens it; a day without, creates it from the template.
  await calendar.getByRole('button', { name: /October 1, 2026 — open its note/ }).click();
  await expect(page.locator('.ProseMirror')).toContainText('Met the team.');
  await calendar.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.ProseMirror h2')).toHaveText('Tasks');
  const folder = () => page.evaluate(() => Object.fromEntries((window as unknown as { __folder: Map<string, string> }).__folder));
  await expect.poll(async () => (await folder())['Journal/2026/10/2026-10-04.md']).toBe('---\ndate: 2026-10-04\n---\n# 2026-10-04\n\n## Tasks\n');
  await expect(calendar.locator('.daily-day.has-note')).toHaveText(['1', '4']);

  // Another name: a sub-folder by month, the day written out.
  await calendar.getByLabel('Name').fill('YYYY/MM/dddd D');
  await calendar.getByLabel('Name').press('Enter');
  await calendar.getByRole('button', { name: 'Next month' }).click();
  await calendar.getByRole('button', { name: /November 2, 2026 — create its note/ }).click();
  await expect.poll(async () => Object.keys(await folder())).toContain('Journal/2026/11/Monday 2.md');
  await page.screenshot({ path: 'test-results/daily-calendar.png' });
});

test('copies, pastes, duplicates and downloads from the context menu and the keyboard (FOLDER-012..014)', async ({ page }) => {
  await fakeFolder(page, { 'notes/a.md': '# A\n', 'notes/b.md': '# B\n', 'z.md': '# Z\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  const files = () => page.evaluate(() => [...(window as unknown as { __folder: Map<string, string> }).__folder.keys()].sort());
  // Duplicate from the context menu.
  await panel.getByRole('button', { name: 'z.md' }).click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Actions on the files' });
  await expect(menu.getByRole('menuitem')).toContainText(['Open', 'Rename (F2)', 'Duplicate', 'Copy (Ctrl+C)', 'Cut (Ctrl+X)', 'Download', 'Copy the path', 'Delete (Del)']);
  await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect.poll(files).toEqual(['notes/a.md', 'notes/b.md', 'z 2.md', 'z.md']);
  // The tree shows the copy before the next step (it is drawn again).
  await expect(panel.getByRole('button', { name: 'z 2.md' })).toBeVisible();
  // Copy with the keyboard, paste into the folder.
  await panel.getByRole('button', { name: 'z.md', exact: true }).focus();
  await page.keyboard.press('ControlOrMeta+c');
  await panel.getByRole('button', { name: 'notes', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'notes', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(files).toEqual(['notes/a.md', 'notes/b.md', 'notes/z.md', 'z 2.md', 'z.md']);
  // Download the folder as an archive.
  await panel.getByRole('button', { name: 'notes', exact: true }).click({ button: 'right' });
  const download = page.waitForEvent('download');
  await menu.getByRole('menuitem', { name: 'Download' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('notes.zip');
  const { readFileSync } = await import('node:fs');
  const zip = readFileSync((await file.path())!);
  expect(zip.subarray(0, 2).toString()).toBe('PK');
  expect(zip.toString('latin1')).toContain('notes/z.md');
});

test('lists the tags of the notes, renames one everywhere and draws the graph of the notes (FOLDER-017, FOLDER-018)', async ({ page }) => {
  await fakeFolder(page, {
    'a.md': '---\ntags: [physics]\n---\n# A\n\nSee [[b]]. #todo\n',
    'b.md': '# B\n\nBack to [[a]]. #todo\n',
    'c.md': '# C\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByText('Tags', { exact: true }).click();
  await expect(panel.locator('.folder-tag .link')).toHaveText(['#todo', '#physics']);
  await panel.getByRole('button', { name: '#todo' }).click();
  await expect(panel.getByLabel('Search the folder')).toHaveValue('#todo');
  await expect(panel.locator('.folder-results .folder-file')).toHaveText(['a.md', 'b.md']);
  // Renaming a tag rewrites every note using it.
  page.once('dialog', (d) => void d.accept('next'));
  await panel.getByRole('button', { name: 'Rename the tag todo' }).click();
  await expect(panel.locator('.folder-tag .link')).toHaveText(['#next', '#physics']);
  const files = () => page.evaluate(() => Object.fromEntries((window as unknown as { __folder: Map<string, string> }).__folder));
  await expect.poll(async () => (await files())['b.md']).toBe('# B\n\nBack to [[a]]. #next\n');
  // The graph of the notes; a click opens one.
  await panel.getByRole('button', { name: 'Graph of the notes' }).click();
  const graph = page.getByRole('dialog', { name: 'Graph of the notes' });
  await expect(graph).toContainText('3 notes, 2 links, 1 notes without links');
  await expect(graph.locator('svg g.node')).toHaveCount(3, { timeout: 30_000 });
  await graph.locator('svg g.node[data-note="b.md"]').click();
  await expect(graph).toBeHidden();
  await expect(page.locator('.doc-page h1')).toHaveText('B');
  // FOLDER-019: beside the open note, the notes sharing its tags or linked with it.
  await expect(page.locator('.folder-related li')).toHaveText(['a.md#next · linked']);
});

test('offers the templates of the folder and keeps new ones there (FOLDER-020)', async ({ page }) => {
  await fakeFolder(page, { 'Templates/Lab note.md': '# Lab note\n\nDate:\n', 'a.md': '# A\n' });
  await openLocalFolder(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  const gallery = page.getByRole('dialog', { name: 'New from a template' });
  await gallery.getByRole('tabpanel', { name: 'Templates of thesis' }).getByRole('button', { name: 'Lab note' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('h1')).toHaveText('Lab note');
  // Saving as template offers the folder's templates folder.
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' today');
  page.once('dialog', (d) => void d.accept('Daily'));
  await page.getByLabel('Save as format').selectOption({ label: 'Save as template…' });
  const where = page.getByRole('dialog', { name: 'Save as template…' });
  await where.getByLabel('In the folder Templates').check();
  await where.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Templates/Daily.md');
  const files = () => page.evaluate(() => Object.fromEntries((window as unknown as { __folder: Map<string, string> }).__folder));
  await expect.poll(async () => (await files())['Templates/Daily.md']).toContain('Date: today');
});

test('completes links to notes after [[ and tags after # while typing (FOLDER-021)', async ({ page }) => {
  await fakeFolder(page, {
    'index.md': '# Index\n\nStart.\n',
    'notes/Project plan.md': '# Plan\n\n#physics\n',
    'notes/Meeting.md': '# Meeting\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'index.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.getByText('Start.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' See [[pro');
  const list = page.getByRole('listbox', { name: 'Notes to link to' });
  await expect(list.getByRole('option')).toHaveText(['Project plan']);
  await page.keyboard.press('Enter');
  await expect(editor.getByRole('link', { name: 'Project plan' })).toBeVisible();
  await page.keyboard.type('about #ph');
  await expect(page.getByRole('listbox', { name: 'Tags' }).getByRole('option')).toHaveText(['#physics']);
  await page.keyboard.press('Tab');
  // Escape closes the list; typing goes on as usual.
  await page.keyboard.type('and [[');
  await expect(list.getByRole('option')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('index.md'))).toContain('Start. See [[Project plan]] about #physics and');
});

test('shows the #tags of a note as tags, in the colours given to them (FOLDER-023)', async ({ page }) => {
  await fakeFolder(page, { 'a.md': '# A\n\nTo do: #todo and `#code`, see #physics.\n', 'b.md': '# B #todo\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.locator('.fs-explorer').getByRole('button', { name: 'a.md', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('.note-tag')).toHaveText(['#todo', '#physics']);
  await panel.getByText('Tags', { exact: true }).click();
  await panel.getByLabel('Colour of the tag todo').selectOption('red');
  await expect(editor.locator('.note-tag').first()).toHaveAttribute('style', /--tag-colour: #d1453b/);
  await expect(editor.locator('.note-tag').nth(1)).not.toHaveAttribute('style', /.+/);
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/tags.png' });
  // Kept for the folder: reopening the page shows it again.
  await page.reload();
  await openLocalFolder(page);
  await panel.getByText('Tags', { exact: true }).click();
  await expect(panel.getByLabel('Colour of the tag todo')).toHaveValue('red');
});

test('creates notes with an identifier and follows links by identifier (FOLDER-024)', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2024, 9, 3, 15, 30));
  await fakeFolder(page, { 'index.md': '# Index\n\nSee [[202301011200]].\n', 'z/202301011200 Entropy.md': '# Entropy\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'index.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await editor.getByRole('link', { name: '202301011200' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.doc-page h1')).toHaveText('Entropy');
  // A new note named and marked with the date and time.
  await panel.getByRole('button', { name: 'z', exact: true }).click();
  page.once('dialog', (d) => void d.accept('202410031530 Heat.md'));
  await panel.getByRole('button', { name: 'New note with an identifier' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Heat');
  const files = () => page.evaluate(() => Object.fromEntries((window as unknown as { __folder: Map<string, string> }).__folder));
  expect((await files())['z/202410031530 Heat.md']).toBe('---\nid: 202410031530\n---\n# Heat\n');
});

test('shows ==highlights== and callouts of a note and keeps them on save (MD-019)', async ({ page }) => {
  const note = '# N\n\nAn ==important== point.\n\n> [!WARNING] Hot\n>\n> Do not touch.\n\nAfter.\n';
  await fakeFolder(page, { 'n.md': note });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'n.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  await expect(editor.locator('blockquote.callout-warning')).toHaveCount(2);
  // The icon of the type before the title; the marker shown only while the title line is edited.
  await expect(editor.locator('blockquote.callout-head .callout-icon')).toHaveText('⚠️');
  await expect(editor.locator('blockquote.callout-head .callout-marker')).toBeHidden();
  await expect(editor.locator('blockquote.callout-head')).toContainText('Hot');
  await expect(editor.getByText('important')).toHaveCSS('background-color', 'rgb(255, 241, 118)');
  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/callouts.png' });
  await editor.getByText('After.').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Done');
  await page.keyboard.press('Control+s');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('n.md'))).toBe(note.replace('After.', 'After. Done'));
});

test('makes one document per row of a table of the folder by mail merge (DOC-036)', async ({ page }) => {
  await fakeFolder(page, {
    'letters/letter.md': '# Letter\n\nDear {{First name}} {{Name}}, your mark is {{Mark}}.\n',
    'letters/class.csv': 'Name,First name,Mark\nCurie,Marie,18\nNoether,Emmy,19\n',
  });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'letters', exact: true }).click();
  await panel.getByRole('button', { name: 'letter.md' }).click();
  await page.getByRole('button', { name: 'Mail merge…' }).click();
  const pick = page.getByRole('dialog', { name: 'Mail merge' }).first();
  await pick.getByLabel('class.csv').check();
  await pick.getByRole('button', { name: 'Open' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mail merge' });
  await expect(dialog).toContainText('2 rows in class.csv.');
  await dialog.getByLabel('one file per row, in the open folder').check();
  await dialog.getByLabel('Format').selectOption('md');
  await dialog.getByLabel('Name the files after').selectOption('Name');
  await dialog.getByRole('button', { name: 'Make the documents' }).click();
  await expect(page.getByRole('alert')).toContainText('2 documents written');
  const files = () => page.evaluate(() => Object.fromEntries((window as unknown as { __folder: Map<string, string> }).__folder));
  await expect.poll(async () => (await files())['letters/Letter – merge/Curie.md']).toContain('Dear Marie Curie, your mark is 18.');
  expect((await files())['letters/Letter – merge/Noether.md']).toContain('Dear Emmy Noether, your mark is 19.');
  await expect(panel.getByRole('button', { name: 'Letter – merge', exact: true })).toBeVisible();
});

test('a Git working copy shows its branch; documents are saved in place (GIT-014)', async ({ page }) => {
  await fakeFolder(page, { '.git/HEAD': 'ref: refs/heads/main\n', '.git/config': '[core]\n', 'notes.md': '# Notes\n' });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('button', { name: 'Git working copy, branch main' })).toHaveText('⎇ main');
  await expect(panel.getByRole('button', { name: '.git' })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Git working copy, branch main' }).click();
  await expect(page.getByRole('dialog', { name: 'This folder is a Git working copy' })).toContainText('Git keeps the versions');
});
