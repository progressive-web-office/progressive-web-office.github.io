import { expect, test } from '@playwright/test';
import { openApp, openFile } from './helpers';
import { SAMPLE } from '../tests/canvas-fixtures';

test('opens a canvas, adds a card, edits and connects it, undoes, and saves it as JSON Canvas (CANVAS-001..CANVAS-004)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'plan.canvas', SAMPLE);
  const view = page.locator('.canvas-view');
  await expect(view.locator('.canvas-node')).toHaveCount(5);
  await expect(view.locator('.canvas-edge-label')).toHaveText('leads to');
  await expect(view.locator('.canvas-text h1')).toHaveText('Hello');
  await expect(view.locator('.canvas-group-label')).toHaveText('Ideas');

  // A new text card, edited in place.
  await view.getByRole('button', { name: 'Text', exact: true }).click();
  const area = view.getByRole('textbox', { name: /Text of the card/ });
  await area.fill('Added **card**');
  await area.press('Control+Enter');
  await expect(view.locator('.canvas-node')).toHaveCount(6);
  const added = view.locator('.canvas-node').last();
  await expect(added.locator('strong')).toHaveText('card');

  // Connect the first text card to the new one, from its right side.
  const from = view.locator('.canvas-node[data-id="t1"]');
  await from.hover();
  const handle = await from.locator('.canvas-handle-right').boundingBox();
  const target = await added.boundingBox();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(view.locator('.canvas-edge')).toHaveCount(3);

  // Undo the edge (Ctrl+Z on the canvas), and redo it.
  await view.locator('.canvas-scroller').press('Control+z');
  await expect(view.locator('.canvas-edge')).toHaveCount(2);
  await view.locator('.canvas-scroller').press('Control+y');
  await expect(view.locator('.canvas-edge')).toHaveCount(3);

  // Saved as JSON Canvas, keeping the unknown card and fields.
  const download = page.waitForEvent('download');
  await page.locator('.header-actions').getByRole('button', { name: 'Save', exact: true }).click();
  const file = await download;
  const chunks: Buffer[] = [];
  for await (const c of await file.createReadStream()) chunks.push(c as Buffer);
  const saved = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(saved.nodes).toHaveLength(6);
  expect(saved.nodes.at(-1).text).toBe('Added **card**');
  expect(saved.edges).toHaveLength(3);
  expect(saved.nodes.find((n: { id: string }) => n.id === 'x1')).toMatchObject({ type: 'sticker', emoji: '*' });
  expect(saved.meta).toEqual({ version: '1.0' });
  expect(errors).toEqual([]);
});

test('a canvas of notes kept in a folder of a ZIP archive shows and opens the notes of its cards (FOLDER-033)', async ({ page }) => {
  const { zipSync, strToU8 } = await import('fflate');
  const errors = await openApp(page);
  const board = JSON.stringify({
    nodes: [
      { id: 'a', type: 'file', file: 'Sessions/S1 sheet.md', x: 0, y: 0, width: 300, height: 200 },
      { id: 'b', type: 'file', file: 'Index.md', x: 400, y: 0, width: 300, height: 200 },
    ],
    edges: [],
  });
  const zip = zipSync({
    'Course/.settings/app.json': strToU8('{}'),
    'Course/Boards/Map.canvas': strToU8(board),
    'Course/Sessions/S1 sheet.md': strToU8('# Session one\n\nThe first session.\n'),
    'Course/Index.md': strToU8('# Index\n\nSee [[S1 sheet]].\n'),
  });
  await openFile(page, 'course.zip', Buffer.from(zip), 'application/zip');
  const panel = page.getByRole('complementary', { name: 'Folder' });
  await panel.getByRole('button', { name: 'Boards' }).click();
  await panel.getByRole('button', { name: 'Map.canvas' }).click();
  const view = page.locator('.canvas-view');
  await expect(view.locator('.canvas-node').first()).toContainText('The first session.');
  await expect(view.locator('.canvas-node').nth(1)).toContainText('See');
  await expect(view.getByText(/not found/i)).toHaveCount(0);
  // Opening a card opens its note.
  await view.locator('.canvas-file-name').first().dblclick();
  await expect(page.locator('.doc-page h1')).toHaveText('Session one');
  expect(errors).toEqual([]);
});
