import { expect, test, type Page } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { openApp, saveAs } from './helpers';

/** The centre of a placed symbol, from its transform. */
async function centre(page: Page, name: string): Promise<[number, number]> {
  const id = await page.locator('.draw-objects button', { hasText: name }).getAttribute('data-id');
  const t = await page.locator(`.draw-content g[data-id="${id}"]`).getAttribute('transform');
  const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(t ?? '')!;
  return [Number(m[1]), Number(m[2])];
}

/** Screen coordinates of a drawing point. */
async function screen(page: Page, [x, y]: [number, number]): Promise<[number, number]> {
  const stage = page.locator('svg.draw-stage');
  const box = (await stage.boundingBox())!;
  const [, , w, h] = ((await stage.getAttribute('viewBox')) ?? '').split(' ').map(Number) as [number, number, number, number];
  return [box.x + (x * box.width) / w, box.y + (y * box.height) / h];
}

test('draws a schematic with symbols and wires, inserted in a document and edited again (DRAW-001..DRAW-007, DRAW-011)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('button', { name: 'Drawing or schematic…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });

  // DRAW-005: symbols found by name, placed with a numbered reference.
  await dialog.getByLabel('Search a symbol…').fill('resistor');
  await dialog.getByRole('listitem', { name: 'Resistor', exact: true }).click();
  await dialog.getByLabel('Value').fill('4k7');
  await dialog.getByLabel('Value').press('Enter');
  await expect(dialog.locator('.draw-content')).toContainText('4.7 kΩ');
  await dialog.getByLabel('Search a symbol…').fill('capacitor');
  await dialog.getByRole('listitem', { name: 'Capacitor', exact: true }).click();
  // DRAW-011: moved with the keyboard, a grid step at a time.
  const stage = dialog.locator('svg.draw-stage');
  const before = await centre(page, 'Capacitor C1');
  for (let i = 0; i < 8; i++) await stage.press('ArrowRight');
  const c = await centre(page, 'Capacitor C1');
  expect(c[0]).toBe(before[0] + 80);
  const r = await centre(page, 'Resistor R1');

  // DRAW-006: a wire from pin to pin, kept connected when the capacitor moves.
  await dialog.getByRole('button', { name: 'Wire' }).click();
  const a = await screen(page, [r[0] + 30, r[1]]);
  const b = await screen(page, [c[0] - 30, c[1]]);
  await page.mouse.move(...a);
  await page.mouse.down();
  await page.mouse.move(b[0] - 10, b[1], { steps: 4 });
  await page.mouse.move(...b, { steps: 2 });
  await page.mouse.up();
  const wire = dialog.locator('.draw-content polyline');
  await expect(wire).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Select and move' }).click();
  await dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' }).click();
  await dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' }).press('ArrowDown');
  await dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' }).press('ArrowDown');
  const points = (await wire.getAttribute('points'))!.split(' ');
  expect(points[0]).toBe(`${r[0] + 30},${r[1]}`);
  expect(points[points.length - 1]).toBe(`${c[0] - 30},${c[1] + 20}`);

  // Deleted, then back with undo.
  await stage.focus();
  await stage.press('Delete');
  await expect(dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' })).toHaveCount(0);
  await stage.press('Control+z');
  await expect(dialog.locator('.draw-objects button', { hasText: 'Capacitor C1' })).toHaveCount(1);

  // DRAW-001: a rectangle drawn with the mouse.
  await dialog.getByRole('button', { name: 'Rectangle' }).click();
  const p = await screen(page, [40, 40]);
  await page.mouse.move(...p);
  await page.mouse.down();
  await page.mouse.move(p[0] + 60, p[1] + 40, { steps: 3 });
  await page.mouse.up();
  await expect(dialog.locator('.draw-objects button', { hasText: 'Rectangle' })).toHaveCount(1);
  await expect(dialog.getByLabel('Value')).toBeHidden();

  if (process.env.SCREENSHOTS) await page.screenshot({ path: 'test-results/drawing.png' });
  // DRAW-009: the netlist and the bill of materials.
  const net = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Netlist (SPICE)' }).click();
  const netFile = await net;
  expect(netFile.suggestedFilename()).toBe('schematic.cir');
  const text = (await import('node:fs')).readFileSync((await netFile.path())!, 'utf8');
  expect(text).toMatch(/^R1 N\d+ N\d+ 4\.7k$/m);
  expect(text).toMatch(/^C1 N\d+ N\d+ 1u$/m);
  const bom = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Bill of materials' }).click();
  expect((await import('node:fs')).readFileSync((await (await bom).path())!, 'utf8')).toContain('1,R1,Resistor,4.7 kΩ');
  // DRAW-021: the schematic as a PDF page, in vectors, its text searchable (Ω from the Symbol font).
  const pdf = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download PDF' }).click();
  const pdfFile = await pdf;
  expect(pdfFile.suggestedFilename()).toBe('drawing.pdf');
  const { PDFDocument, PDFName, decodePDFRawStream } = await import('@pdfme/pdf-lib');
  type Dict = import('@pdfme/pdf-lib').PDFDict;
  const pdfDoc = await PDFDocument.load(new Uint8Array((await import('node:fs')).readFileSync((await pdfFile.path())!)));
  expect(pdfDoc.getPageCount()).toBe(1);
  const xobjects = pdfDoc.getPage(0).node.Resources()!.lookup(PDFName.of('XObject')) as Dict;
  const form = xobjects.lookup(xobjects.keys()[0]!) as import('@pdfme/pdf-lib').PDFRawStream;
  const ops = new TextDecoder().decode(decodePDFRawStream(form).decode());
  expect(ops).toContain('/F5 ');
  expect(ops).not.toContain('/Im1');
  await dialog.getByLabel('Description').fill('An RC circuit');
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(dialog).toBeHidden();

  // DRAW-007: a picture of the document, opened again by a double click.
  const img = page.locator('.doc-page img[alt="An RC circuit"]');
  await expect(img).toBeVisible();
  await img.dblclick();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.draw-objects button', { hasText: 'Resistor R1 4.7 kΩ' })).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // DRAW-003: kept as an SVG holding the editable drawing.
  const odt = unzipSync(new Uint8Array((await saveAs(page, 'OpenDocument text (.odt)')).data));
  const svg = Object.entries(odt).find(([p]) => p.endsWith('.svg'));
  expect(svg).toBeDefined();
  expect(strFromU8(svg![1])).toContain('<metadata id="pwo-drawing">');
  // Word gets a PNG version beside the SVG.
  const docx = unzipSync(new Uint8Array((await saveAs(page, 'Word document (.docx)')).data));
  expect(Object.keys(docx).filter((p) => p.startsWith('word/media/')).sort()).toEqual(['word/media/image1.png', 'word/media/image1.svg']);
  expect(docx['word/media/image1.png']!.length).toBeGreaterThan(1000);
  expect(errors).toEqual([]);
});

test('drawing and painting have the whole window, their tools folded away, and the command palette (DRAW-022)', async ({ page }) => {
  const errors = await openApp(page);
  const viewport = page.viewportSize()!;
  await page.getByRole('button', { name: 'New drawing or schematic' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  const whole = (await dialog.boundingBox())!;
  expect([whole.x, whole.y, whole.width, whole.height]).toEqual([0, 0, viewport.width, viewport.height]);
  // Folded: only a small bar is left over the drawing.
  await dialog.getByRole('button', { name: 'Hide the tools' }).click();
  await expect(dialog.getByRole('toolbar', { name: 'Drawing tools' })).toBeHidden();
  expect((await dialog.locator('.draw-chrome').boundingBox())!.width).toBeLessThan(viewport.width / 2);
  // The tools out of sight are commands of the palette.
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await palette.getByRole('combobox').fill('Ellipse');
  await palette.getByRole('combobox').press('Enter');
  await expect(palette).toBeHidden();
  await dialog.getByRole('button', { name: 'Show the tools' }).click();
  await expect(dialog.getByRole('button', { name: 'Ellipse' })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'New painting' }).click();
  const paint = page.getByRole('dialog', { name: 'Painting' });
  expect((await paint.boundingBox())!.width).toBe(viewport.width);
  await paint.getByRole('button', { name: 'Commands', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Commands' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').fill('Eraser');
  await page.getByRole('dialog', { name: 'Commands' }).getByRole('combobox').press('Enter');
  await expect(paint.getByRole('button', { name: 'Eraser' })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('puts a drawing on a slide, edited again by a double click (DRAW-007)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New presentation' }).click();
  await page.getByRole('button', { name: 'Drawing or schematic…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await dialog.getByLabel('Library').selectOption({ label: 'Flowcharts (ISO 5807)' });
  await dialog.getByRole('listitem', { name: 'Decision' }).click();
  await dialog.getByLabel('Value').fill('x > 0 ?');
  await dialog.getByLabel('Value').press('Enter');
  await dialog.getByRole('button', { name: 'Fit to the content' }).click();
  await dialog.getByRole('button', { name: 'Done' }).click();
  const img = page.locator('.stage img');
  await expect(img).toBeVisible();
  await img.dblclick();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.draw-objects button', { hasText: 'Decision x > 0 ?' })).toHaveCount(1);
  expect(await dialog.getByLabel('Width').inputValue()).toBe('140');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect(errors).toEqual([]);
});

test('a component dragged from inside its body; wheel zoom, middle-button and two-finger pan, pinch (DRAW-018, DRAW-019)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'New document' }).click();
  await page.getByRole('button', { name: 'Drawing or schematic…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Drawing' });
  await dialog.getByLabel('Search a symbol…').fill('block');
  await dialog.getByRole('listitem', { name: 'Block (transfer function)', exact: true }).click();
  const before = await centre(page, 'Block');
  // Pressed in the middle of the empty box, not on its lines: it moves.
  const from = await screen(page, before);
  const to = await screen(page, [before[0] + 100, before[1] + 50]);
  await page.mouse.move(...from);
  await page.mouse.down();
  await page.mouse.move(...to, { steps: 6 });
  await page.mouse.up();
  expect(await centre(page, 'Block')).toEqual([before[0] + 100, before[1] + 50]);
  await expect(dialog.locator('.draw-band')).toHaveCount(0);

  // The wheel zooms, keeping the point under the pointer in place (once the drawing is larger than the view).
  const zoom = dialog.locator('.draw-zoom');
  for (let i = 0; i < 4; i++) await dialog.getByRole('button', { name: 'Zoom in' }).click();
  await dialog.locator('.draw-scroll').evaluate((el) => {
    el.scrollLeft = el.scrollWidth / 2 - el.clientWidth / 2;
    el.scrollTop = el.scrollHeight / 2 - el.clientHeight / 2;
  });
  const view = (await dialog.locator('.draw-scroll').boundingBox())!;
  const under: [number, number] = [view.x + view.width / 2, view.y + view.height / 2];
  const pointAt = await page.evaluate(([x, y]) => {
    const svg = document.querySelector('svg.draw-stage')!;
    const r = svg.getBoundingClientRect();
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number) as number[];
    return [((x! - r.left) / r.width) * w!, ((y! - r.top) / r.height) * h!] as [number, number];
  }, under);
  const shownBefore = await zoom.textContent();
  await page.mouse.move(...under);
  await page.mouse.wheel(0, -300);
  await expect(zoom).not.toHaveText(shownBefore!);
  const again = await screen(page, pointAt);
  expect(Math.abs(again[0] - under[0])).toBeLessThan(3);
  expect(Math.abs(again[1] - under[1])).toBeLessThan(3);
  await page.mouse.wheel(0, 200);

  // The middle button pans.
  const scroller = dialog.locator('.draw-scroll');
  await scroller.evaluate((el) => (el.scrollLeft = 200));
  const left = await scroller.evaluate((el) => el.scrollLeft);
  await page.mouse.move(under[0], under[1]);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(under[0] + 80, under[1], { steps: 4 });
  await page.mouse.up({ button: 'middle' });
  expect(await scroller.evaluate((el) => el.scrollLeft)).toBeLessThan(left - 40);

  // Two fingers on a touch screen: pinched apart, it zooms in.
  const shown = await zoom.textContent();
  await scroller.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
    const fire = (type: string, id: number, x: number): void => {
      el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: cy, bubbles: true, cancelable: true, isPrimary: id === 1 }));
    };
    fire('pointerdown', 1, cx - 20);
    fire('pointerdown', 2, cx + 20);
    for (let k = 1; k <= 5; k++) {
      fire('pointermove', 1, cx - 20 - k * 10);
      fire('pointermove', 2, cx + 20 + k * 10);
    }
    fire('pointerup', 1, cx - 70);
    fire('pointerup', 2, cx + 70);
  });
  const pct = (s: string | null): number => Number(s?.replace(/\D/g, ''));
  expect(pct(await zoom.textContent())).toBeGreaterThan(pct(shown) * 2);
  // Nothing was drawn or moved by the fingers.
  expect(await centre(page, 'Block')).toEqual([before[0] + 100, before[1] + 50]);
  expect(errors).toEqual([]);
});
