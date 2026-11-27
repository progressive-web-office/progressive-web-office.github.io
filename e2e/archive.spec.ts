import { expect, test } from '@playwright/test';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { openApp, openFile, saveAs, answerName } from './helpers';

// A 1×1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test('opens a ZIP archive as a folder, shows source files and pictures, downloads the changes (FILE-021..FILE-023)', async ({ page }) => {
  const errors = await openApp(page);
  const zip = zipSync({
    'Group A/Alice/main.c': strToU8('#include <stdio.h>\n/* entry */\nint main(void) {\n  printf("hi\\n");\n  return 0;\n}\n'),
    'Group A/Bob/solution.py': strToU8('def f(x):\n    return x * 2  # double\n'),
    'Group A/Bob/plot.png': new Uint8Array(PNG),
    'Group A/Bob/data.bin': new Uint8Array([0, 1, 2, 3]),
    'readme.txt': strToU8('Submissions'),
    'Group B/Carol.zip': zipSync({ 'carol/answer.java': strToU8('class A {}\n') }),
  });
  await openFile(page, 'submissions.zip', Buffer.from(zip), 'application/zip');
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 submissions.zip' })).toBeVisible();
  await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: 'is open as a folder' })).toBeVisible();

  await panel.getByRole('button', { name: 'Group A' }).click();
  await panel.getByRole('button', { name: 'Alice' }).click();
  await panel.getByRole('button', { name: 'main.c' }).click();
  const code = page.getByRole('textbox', { name: 'Content of main.c' });
  await expect(code).toContainText('printf("hi\\n");');
  await expect(page.locator('.code-info')).toHaveText('C · UTF-8 · LF');
  await expect(code.locator('.tok-keyword')).toHaveText(['return']);
  await expect(code.locator('.tok-string').first()).toHaveText('<stdio.h>');
  await expect(code.locator('.tok-comment')).toHaveText('/* entry */');
  await expect(page.locator('.cm-gutter.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^7$/ })).toBeVisible();

  // An archive inside the archive is a folder.
  await panel.getByRole('button', { name: 'Group B' }).click();
  await panel.getByRole('button', { name: 'Carol.zip' }).click();
  await panel.getByRole('button', { name: 'carol', exact: true }).click();
  await panel.getByRole('button', { name: 'answer.java' }).click();
  await expect(page.getByRole('textbox', { name: 'Content of answer.java' })).toHaveText('class A {}');
  await expect(page.locator('.code-info')).toHaveText('Java · UTF-8 · LF');

  // Edit a Python file and save it into the archive.
  await panel.getByRole('button', { name: 'Bob' }).click();
  await panel.getByRole('button', { name: 'solution.py' }).click();
  const py = page.getByRole('textbox', { name: 'Content of solution.py' });
  await expect(py.locator('.tok-comment')).toHaveText('# double');
  await py.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('print(f(21))\n');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved in the archive.')).toBeVisible();

  // A picture is shown; a file the app cannot show is offered for download.
  await panel.getByRole('button', { name: 'plot.png' }).click();
  await expect(page.getByRole('img', { name: 'plot.png' })).toBeVisible();
  page.once('dialog', (d) => void d.dismiss());
  await panel.getByRole('button', { name: 'data.bin' }).click();

  // The archive is downloaded with the change.
  const download = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download the archive with its changes' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('submissions.zip');
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  const back = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  expect(Object.keys(back).sort()).toEqual(['Group A/Alice/main.c', 'Group A/Bob/data.bin', 'Group A/Bob/plot.png', 'Group A/Bob/solution.py', 'Group B/Carol.zip', 'readme.txt']);
  expect(new TextDecoder().decode(back['Group A/Bob/solution.py'])).toBe('def f(x):\n    return x * 2  # double\nprint(f(21))\n');
  expect(errors).toEqual([]);
});

test('opens a source file on its own and saves it under its name (FILE-022)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'hello.py', 'print("hello")\n', 'text/x-python');
  const code = page.getByRole('textbox', { name: 'Content of hello.py' });
  await expect(code).toHaveText('print("hello")');
  await code.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('x = 1\n');
  const download = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('hello.py');
});

test('comments lines of a source file in its own comment syntax (FILE-024)', async ({ page }) => {
  await openApp(page);
  await openFile(page, 'sum.py', 'def total(xs):\n    s = 0\n    for x in xs:\n        s += x\n    return s\n', 'text/x-python');
  const code = page.getByRole('textbox', { name: 'Content of sum.py' });
  await expect(code.locator('.tok-keyword').first()).toHaveText('def');
  await code.locator('.cm-line').nth(2).click();
  page.once('dialog', (d) => void d.accept('Use sum(xs)'));
  await page.getByRole('button', { name: 'Comment the line' }).click();
  await answerName(page, 'Prof');
  await expect(code.locator('.cm-line').nth(2)).toHaveText('    # REVIEW(Prof): Use sum(xs)');
  await expect(code.locator('.cm-review')).toHaveCount(1);
  const panel = page.getByRole('complementary', { name: 'Review comments' });
  await expect(panel.getByRole('article', { name: 'Comment on line 3' })).toContainText('Use sum(xs)');
  const download = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const chunks: Buffer[] = [];
  for await (const c of await (await download).createReadStream()) chunks.push(c as Buffer);
  expect(Buffer.concat(chunks).toString()).toContain('    for x in xs:'.replace('for', '# REVIEW(Prof): Use sum(xs)\n    for'));
  await panel.getByRole('button', { name: 'Delete' }).click();
  await expect(panel).toBeHidden();
});


test('shows the pictures of a note of a folder and keeps them on export; Save as writes outside the folder (MD-018)', async ({ page }) => {
  const errors = await openApp(page);
  const note = '# Results\n\n![Voltage](<img/photo été.png>)\n\n<p align="center"><img src="img/diagram.png" alt="Diagram"></p>\n\nAn embed: ![[logo.png]]\n';
  const zip = zipSync({ 'notes/report.md': strToU8(note), 'notes/img/photo été.png': new Uint8Array(PNG), 'notes/img/diagram.png': new Uint8Array(PNG), 'logo.png': new Uint8Array(PNG), 'syllabus.docx': strToU8('x') });
  await openFile(page, 'course.zip', Buffer.from(zip), 'application/zip');
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'notes', exact: true }).click();
  await panel.getByRole('button', { name: 'report.md' }).click();
  const editor = page.getByRole('textbox', { name: 'Document' });
  const pictures = editor.locator('img[data-resource]');
  await expect(pictures).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect.poll(() => pictures.nth(i).evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);

  // Saved back into the folder, the links stay links.
  await editor.locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved in the archive.')).toBeVisible();

  // Save as: a file outside the folder, with the pictures inside it.
  const mdz = await saveAs(page, 'Markdown package (.mdz)');
  expect(mdz.name).toBe('report.mdz');
  const files = unzipSync(new Uint8Array(mdz.data));
  expect(Object.keys(files).filter((p) => p.startsWith('assets/images/'))).toHaveLength(1);
  const archive = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download the archive with its changes' }).click();
  const chunks: Buffer[] = [];
  for await (const c of await (await archive).createReadStream()) chunks.push(c as Buffer);
  const back = unzipSync(new Uint8Array(Buffer.concat(chunks)));
  expect(Object.keys(back).sort()).toEqual(['logo.png', 'notes/img/diagram.png', 'notes/img/photo été.png', 'notes/report.md', 'syllabus.docx']);
  const saved = new TextDecoder().decode(back['notes/report.md']);
  expect(saved).toContain('# Results\\!');
  expect(saved).toContain('](img/photo%20été.png)');
  expect(saved).not.toContain('data:image');
  expect(errors).toEqual([]);
});

test('renames the open file with a click on its name, keeping the extension (FILE-026)', async ({ page }) => {
  const errors = await openApp(page);
  // A file on its own: the new name is used to save it.
  await openFile(page, 'notes.md', '# Notes\n', 'text/markdown');
  await page.getByRole('button', { name: 'Rename notes.md' }).click();
  const input = page.getByRole('textbox', { name: 'New name of the file (without its extension)' });
  await expect(input).toHaveValue('notes');
  await expect(page.locator('.doc-ext')).toHaveText('.md');
  await input.fill('CR TP 1');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Rename CR TP 1.md' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('CR TP 1.md');
  // The recent files and the versions know it under its new name.
  await page.getByRole('button', { name: 'History' }).click();
  const history = page.getByRole('dialog', { name: /Versions/ });
  await expect(history).toContainText('CR TP 1.md');
  await page.keyboard.press('Escape');
  // Escape keeps the name.
  await page.getByRole('button', { name: 'Rename CR TP 1.md' }).click();
  await input.fill('other');
  await input.press('Escape');
  await expect(page.getByRole('button', { name: 'Rename CR TP 1.md' })).toBeVisible();

  await page.locator('.header-actions').getByRole('button', { name: 'Close' }).click();
  const recent = page.getByRole('region', { name: 'Recent files' });
  await expect(recent.getByRole('button', { name: /CR TP 1\.md/ }).first()).toBeVisible();
  await expect(recent.getByRole('button', { name: /notes\.md/ })).toHaveCount(0);
  // A file of an archive is renamed in the archive.
  await openFile(page, 'work.zip', Buffer.from(zipSync({ 'a/report.md': strToU8('# Report\n'), 'a/other.docx': strToU8('x') })), 'application/zip');
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'a', exact: true }).click();
  await panel.getByRole('button', { name: 'report.md' }).click();
  await page.getByRole('button', { name: 'Rename report.md' }).click();
  await input.fill('final.md');
  await input.press('Enter');
  await expect(page.getByRole('status').or(page.getByRole('alert')).filter({ hasText: 'Renamed to final.md' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'final.md' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'report.md' })).toHaveCount(0);
  const archive = page.waitForEvent('download');
  await panel.getByRole('button', { name: 'Download the archive with its changes' }).click();
  const chunks: Buffer[] = [];
  for await (const c of await (await archive).createReadStream()) chunks.push(c as Buffer);
  expect(Object.keys(unzipSync(new Uint8Array(Buffer.concat(chunks)))).sort()).toEqual(['a/final.md', 'a/other.docx']);
  expect(errors).toEqual([]);
});

test('opens a ZIP of Markdown notes (a vault) as a folder, at its entry note, without asking for a main document (FILE-033)', async ({ page }) => {
  const errors = await openApp(page);
  const zip = zipSync({
    'R1.14-Fondamentaux-IA/00-Accueil.md': strToU8('# Accueil\n\nVoir [[01-Introduction]].\n'),
    'R1.14-Fondamentaux-IA/Cours/01-Introduction.md': strToU8('# Introduction\n\nLe début du cours.\n'),
    'R1.14-Fondamentaux-IA/Cours/02-Apprentissage.md': strToU8('# Apprentissage\n'),
    'R1.14-Fondamentaux-IA/.notes-app/app.json': strToU8('{}'),
  });
  await openFile(page, 'vault.zip', Buffer.from(zip), 'application/zip');
  await expect(page.getByRole('dialog', { name: 'Choose the main document' })).toHaveCount(0);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await expect(panel.getByRole('heading', { name: '📁 vault.zip' })).toBeVisible();
  // The entry note is open; the other notes are in the tree.
  await expect(page.locator('.doc-page h1')).toHaveText('Accueil');
  await panel.getByRole('button', { name: 'Cours' }).click();
  await panel.getByRole('button', { name: '01-Introduction.md' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Introduction');
  expect(errors).toEqual([]);
});
