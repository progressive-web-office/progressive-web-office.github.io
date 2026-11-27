import { expect, test } from '@playwright/test';
import { fakeFolder, openLocalFolder } from './helpers';

const HOME = [
  '# Accueil',
  '',
  '- [ ] faire',
  '- [x] fait',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  'Texte %%caché%% visible.',
  '',
  '<div onclick="evil()"><b>gras</b><script>evil()</script></div>',
  '',
  '> [!tip]- Astuce',
  '> contenu replié',
  '',
  '![[Cours#Partie]]',
  '',
  'Voir [[Cours#^b1]].',
  '',
].join('\n');

const COURSE = '# Cours\n\n## Partie\n\nTexte de la partie.\n\n## Autre\n\nParagraphe cible ^b1\n';

test('notes: tasks, coloured code, comments, HTML blocks, folded callouts, embeds, outline and block links (MD-020..MD-027, FOLDER-029)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fakeFolder(page, { 'Accueil.md': HOME, 'Cours.md': COURSE });
  await openLocalFolder(page);
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('navigation', { name: 'Documents of the folder' }).getByRole('button', { name: 'Accueil.md' }).click();
  const editor = page.locator('.doc-page');
  await expect(editor.locator('h1')).toHaveText('Accueil');

  // MD-020: tasks as check boxes; a click toggles; saved as written.
  const boxes = editor.locator('input.task-box');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.nth(0)).not.toBeChecked();
  await expect(boxes.nth(1)).toBeChecked();
  await boxes.nth(0).click();
  await expect(boxes.nth(0)).toBeChecked();

  // MD-021: the code coloured by its language.
  await expect(editor.locator('pre .tok-keyword').first()).toHaveText('const');

  // MD-023: the HTML block sanitised.
  const html = editor.locator('.raw-html-block');
  await expect(html.locator('b')).toHaveText('gras');
  await expect(html.locator('script, [onclick]')).toHaveCount(0);

  // MD-019: the icon of the type before the title, the marker hidden.
  await expect(editor.locator('.callout-icon').first()).toHaveText('🔥');
  await expect(editor.locator('.callout-marker').first()).toBeHidden();

  // MD-026: the folded callout, unfolded by a click.
  await expect(editor.getByText('contenu replié')).toBeHidden();
  await editor.locator('button.callout-fold').click();
  await expect(editor.getByText('contenu replié')).toBeVisible();

  // MD-027: the embedded section of the other note, without the rest.
  const embed = editor.locator('.note-embed');
  await expect(embed).toContainText('Texte de la partie.');
  await expect(embed).not.toContainText('Paragraphe cible');

  // FOLDER-029: the outline.
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Outline' })).toContainText('Accueil');

  // Saved as written, the task changed.
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const saved = () => page.evaluate(() => (window as unknown as { __folder: Map<string, string> }).__folder.get('Accueil.md'));
  await expect.poll(saved).toContain('- [x] faire\n- [x] fait');
  const text = (await saved())!;
  for (const kept of ['```js\nconst a = 1;\n```', 'Texte %%caché%% visible.', '<div onclick="evil()"><b>gras</b><script>evil()</script></div>', '> [!tip]- Astuce\n> contenu replié', '![[Cours#Partie]]', '[[Cours#^b1]]']) expect(text).toContain(kept);

  // MD-024: the comment faint while editing, hidden in reading mode.
  await expect(editor.locator('.md-comment')).toBeVisible();
  const view = page.getByLabel('View', { exact: true }).first();
  await view.selectOption({ label: 'Reading' });
  await expect(page.locator('.doc-page .md-comment')).toBeHidden();
  await page.locator('.doc-mode-bar').getByRole('button', { name: 'Visual editing' }).click();

  // MD-025, FOLDER-003: a click on a link to a block opens the note at that block.
  await page.locator('.doc-page').getByRole('link', { name: 'Cours > ^b1' }).click();
  await expect(page.locator('.doc-page h1')).toHaveText('Cours');
  await expect(page.locator('.doc-page .block-target')).toHaveText('Paragraphe cible');
  expect(errors).toEqual([]);
});
