import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp, openFile } from './helpers';

// MARK-001..MARK-003: sign, highlight and add text wherever something is marked up.

/** Draws a signature on the pad and places it. */
async function sign(page: Page, from: Locator): Promise<void> {
  await from.getByRole('button', { name: 'Add signature' }).click();
  const pad = page.getByLabel('Signature drawing area');
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 30 + i * 20, box.y + 60 + Math.sin(i) * 25);
  await page.mouse.up();
  await page.getByRole('button', { name: 'Place signature' }).click();
  await expect(page.getByLabel('Signature drawing area')).toBeHidden();
}

async function drag(page: Page, [x1, y1]: [number, number], [x2, y2]: [number, number], shift = false): Promise<void> {
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move((x1 + x2) / 2, (y1 + y2) / 2 + 15, { steps: 3 });
  await page.mouse.move(x2, y2, { steps: 3 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}

test('the drawing editor signs, highlights and finds both in the command palette (MARK-001..MARK-003)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New drawing or schematic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });

  await sign(page, dialog);
  const picture = dialog.locator('.draw-content image');
  await expect(picture).toHaveCount(1);
  await expect(dialog.locator('.draw-objects button', { hasText: 'Picture: Signature' })).toHaveCount(1);
  // Resized from its corner: its proportions kept.
  const ratio = async (): Promise<number> => Number(await picture.getAttribute('width')) / Number(await picture.getAttribute('height'));
  const before = await ratio();
  const handle = (await dialog.locator('.draw-handle').first().boundingBox())!;
  await drag(page, [handle.x + handle.width / 2, handle.y + handle.height / 2], [handle.x + 80, handle.y + 10]);
  expect(Math.abs((await ratio()) - before)).toBeLessThan(0.02);

  // MARK-002: a wide translucent yellow stroke, straight with Shift.
  await dialog.getByRole('button', { name: 'Highlight' }).click();
  const stage = (await dialog.locator('svg.draw-stage').boundingBox())!;
  await drag(page, [stage.x + 60, stage.y + 300], [stage.x + 260, stage.y + 300], true);
  const mark = dialog.locator('.draw-content path[opacity="0.4"]');
  await expect(mark).toHaveCount(1);
  await expect(mark).toHaveAttribute('stroke', '#ffeb3b');
  expect(Number(await mark.getAttribute('stroke-width'))).toBeGreaterThanOrEqual(12);
  await expect(dialog.locator('.draw-objects button', { hasText: 'Highlight' })).toHaveCount(1);

  // MARK-003: the same names, offered by the command palette.
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await palette.getByRole('combobox').fill('Add signature');
  await expect(palette.getByRole('option', { name: /Add signature/ })).toHaveCount(1);
  // Chromium skips the first Escape after text typed by a script (no user activation).
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(palette).toBeHidden({ timeout: 500 });
  }).toPass();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('the painting editor signs on a layer of its own and highlights what stays readable (MARK-001, MARK-002)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New painting' }).click();
  const dialog = page.getByRole('dialog', { name: 'Painting' });
  const canvas = dialog.locator('canvas.paint-canvas').first();
  const box = (await canvas.boundingBox())!;
  const scale = box.width / 800;
  const at = (x: number, y: number): [number, number] => [box.x + x * scale, box.y + y * scale];
  const pixel = (x: number, y: number): Promise<number[]> =>
    dialog.locator('canvas.paint-layer.active').evaluate((c: HTMLCanvasElement, [px, py]) => Array.from(c.getContext('2d')!.getImageData(px!, py!, 1, 1).data), [x, y]);

  // A black line, highlighted over: the line stays dark, the white turns yellow.
  await dialog.getByLabel('Colour', { exact: true }).first().fill('#000000');
  await dialog.getByRole('button', { name: 'Line' }).click();
  await drag(page, at(100, 200), at(500, 200));
  await dialog.getByRole('button', { name: 'Highlight' }).click();
  await expect(dialog.getByLabel('Colour', { exact: true }).first()).toHaveValue('#ffeb3b');
  await drag(page, at(100, 205), at(500, 205), true);
  const [r, g, b] = await pixel(300, 210);
  expect(r).toBeGreaterThan(200);
  expect(g).toBeGreaterThan(200);
  expect(b).toBeLessThan(200);
  const [lr, lg, lb] = await pixel(300, 200);
  expect(Math.max(lr!, lg!, lb!)).toBeLessThan(80);
  // The brush gets its own colour back.
  await dialog.getByRole('button', { name: 'Brush' }).click();
  await expect(dialog.getByLabel('Colour', { exact: true }).first()).toHaveValue('#000000');

  // MARK-001: the signature is a new layer, resized from its corner.
  await sign(page, dialog);
  await expect(dialog.getByRole('listbox', { name: 'Layers' }).getByRole('option')).toHaveText([/Signature/, /Background/]);
  await expect(dialog.locator('.paint-status')).toContainText(/selection \d+ × \d+/);
  const size = async (): Promise<[number, number]> => {
    const m = /selection (\d+) × (\d+)/.exec((await dialog.locator('.paint-status').textContent()) ?? '')!;
    return [Number(m[1]), Number(m[2])];
  };
  const [w1, h1] = await size();
  // Placed in the middle of the 800 × 500 picture.
  const [right, bottom] = [Math.round((800 + w1) / 2), Math.round((500 + h1) / 2)];
  await drag(page, at(right - 2, bottom - 2), at(right + 120, bottom + 5));
  const [w2, h2] = await size();
  expect(w2).toBeGreaterThan(w1);
  expect(Math.abs(w2 / h2 - w1 / h1)).toBeLessThan(0.05);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('the photo editor signs, the signature placed again by a drag (MARK-001, MARK-003)', async ({ page }) => {
  const errors = await openApp(page);
  const png = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 300;
    c.height = 200;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 300, 200);
    return c.toDataURL('image/png');
  });
  await openFile(page, 'pic.md', `![White](${png})\n`);
  const img = page.getByRole('textbox', { name: 'Document' }).getByRole('img', { name: 'White' });
  await img.click({ button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Edit the picture…' }).click();
  const photo = page.getByRole('dialog', { name: 'Edit the picture' });
  await expect(photo.getByLabel('🖍 Highlight')).toBeVisible();
  await sign(page, photo);
  const preview = photo.getByRole('img', { name: 'Picture being edited' });
  const dark = (): Promise<number> =>
    preview.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! < 100 && d[i + 3]! > 0) n++;
      return n;
    });
  // Placed at the bottom right; a drag puts it elsewhere, its size chosen.
  const where = (): Promise<number> =>
    preview.evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i]! < 100) (sum += (i / 4) % c.width, n++);
      return n ? sum / n / c.width : 0;
    });
  expect(await dark()).toBeGreaterThan(50);
  expect(await where()).toBeGreaterThan(0.5);
  const box = (await preview.boundingBox())!;
  await drag(page, [box.x + 10, box.y + 10], [box.x + box.width * 0.4, box.y + box.height * 0.4]);
  expect(await where()).toBeLessThan(0.5);
  await photo.getByRole('button', { name: 'Apply' }).click();
  await expect(photo).toBeHidden();
  expect(errors).toEqual([]);
});

test('a text document is signed with the pad of the PDF viewer (MARK-001)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  const doc = page.getByRole('textbox', { name: 'Document' });
  await sign(page, page.locator('.toolbar'));
  await expect(doc.getByRole('img', { name: 'Signature' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('a presentation is signed with the pad of the PDF viewer (MARK-001)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).click();
  await sign(page, page.locator('.toolbar'));
  await expect(page.locator('.stage img[alt="Signature"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});
