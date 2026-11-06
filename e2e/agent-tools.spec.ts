import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, StandardFonts } from '@pdfme/pdf-lib';
import { answerName, fakeFolder, openApp, openFile, openLocalFolder } from './helpers';

// AI-010, AI-011: the tools of a PDF file and of an open folder, for AI agents reached through WebMCP.

type Tools = Map<string, { execute(input: unknown): Promise<{ content: { text: string }[]; isError?: boolean }> }>;

/** A WebMCP host in the page, keeping the tools registered. */
async function webMcp(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tools = new Map<string, unknown>();
    (window as unknown as { __tools: Map<string, unknown> }).__tools = tools;
    (document as unknown as { modelContext: unknown }).modelContext = {
      registerTool(tool: { name: string }, opts?: { signal?: AbortSignal }) {
        tools.set(tool.name, tool);
        opts?.signal?.addEventListener('abort', () => tools.delete(tool.name));
      },
    };
  });
}

const names = (page: Page): Promise<string[]> => page.evaluate(() => [...(window as unknown as { __tools: Map<string, unknown> }).__tools.keys()].sort());
const call = (page: Page, name: string, input: unknown): Promise<{ content: { text: string }[]; isError?: boolean }> =>
  page.evaluate(([n, i]) => (window as unknown as { __tools: Tools }).__tools.get(n as string)!.execute(i), [name, input] as const);

async function formPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 2; i++) doc.addPage([595, 842]).drawText(`Hello page ${i}`, { x: 72, y: 760, size: 24, font });
  const form = doc.getForm();
  form.createTextField('full_name').addToPage(doc.getPage(0), { x: 72, y: 700, width: 220, height: 24 });
  form.createCheckBox('accept').addToPage(doc.getPage(0), { x: 72, y: 660, width: 16, height: 16 });
  return Buffer.from(await doc.save());
}

test('an AI agent reads a PDF file, fills its form, highlights and comments it, with the approval of the user (AI-010)', async ({ page }) => {
  await webMcp(page);
  const errors = await openApp(page);
  await openFile(page, 'form.pdf', await formPdf(), 'application/pdf');
  await expect.poll(() => names(page)).toEqual(['pwo_add_pdf_note', 'pwo_fill_pdf_fields', 'pwo_highlight_pdf_text', 'pwo_list_pdf_annotations', 'pwo_list_pdf_fields', 'pwo_read_pdf']);

  expect((await call(page, 'pwo_read_pdf', { first_page: 2 })).content[0]!.text).toBe('--- Page 2 of 2 ---\nHello page 2');
  const fields = JSON.parse((await call(page, 'pwo_list_pdf_fields', {})).content[0]!.text) as { name: string; type: string }[];
  expect(fields.map((f) => [f.name, f.type])).toEqual([['full_name', 'text'], ['accept', 'checkbox']]);

  // Each change asks the user first.
  const allow = page.getByRole('dialog', { name: 'An AI agent wants to modify the document' }).getByRole('button', { name: 'Allow' });
  const filled = call(page, 'pwo_fill_pdf_fields', { fields: [{ name: 'full_name', value: 'Ada Lovelace' }, { name: 'accept', value: 'yes' }] });
  await allow.click();
  expect((await filled).content[0]!.text).toBe('Filled 2 field(s).');
  await expect(page.locator('[data-field="full_name"]')).toHaveValue('Ada Lovelace');
  await expect(page.locator('[data-field="accept"]')).toBeChecked();

  const marked = call(page, 'pwo_highlight_pdf_text', { text: 'page 2', comment: 'Check' });
  await allow.click();
  await answerName(page, 'Agent');
  expect((await marked).content[0]!.text).toBe('Highlighted 1 occurrence(s) of "page 2".');
  const noted = call(page, 'pwo_add_pdf_note', { page: 1, text: 'Signed?' });
  await allow.click();
  expect((await noted).content[0]!.text).toBe('Note placed on page 1.');
  expect((await call(page, 'pwo_list_pdf_annotations', {})).content[0]!.text).toBe('Page 2, highlight by Agent: Check\nPage 1, note by Agent: Signed?');
  // Drawn when its page is shown.
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('.pdf-highlight')).toHaveCount(1);

  // A change refused is not made.
  const refused = call(page, 'pwo_fill_pdf_fields', { fields: [{ name: 'full_name', value: 'Someone else' }] });
  await page.getByRole('dialog', { name: 'An AI agent wants to modify the document' }).getByRole('button', { name: 'Cancel' }).click();
  expect((await refused).isError).toBe(true);
  await expect(page.locator('[data-field="full_name"]')).toHaveValue('Ada Lovelace');
  expect(errors).toEqual([]);
});

test('an AI agent lists, searches and reads the notes of the open folder, and nothing outside it (AI-011)', async ({ page }) => {
  await webMcp(page);
  await fakeFolder(page, { 'ideas.md': '# Ideas\n\nA garden by the river.\n', 'work/plan.md': '# Plan\n\nThe garden in May.\n' });
  const errors = await openApp(page);
  await openLocalFolder(page);
  await expect.poll(() => names(page)).toEqual(['pwo_list_notes', 'pwo_read_note', 'pwo_search_notes']);
  expect((await call(page, 'pwo_list_notes', {})).content[0]!.text).toMatch(/ideas\.md\n.*work\/plan\.md|work\/plan\.md\n.*ideas\.md/s);
  const found = (await call(page, 'pwo_search_notes', { query: 'GARDEN' })).content[0]!.text;
  expect(found).toContain('ideas.md (1 match)');
  expect(found).toContain('work/plan.md (1 match)');
  expect((await call(page, 'pwo_read_note', { path: 'work/plan.md' })).content[0]!.text).toBe('# Plan\n\nThe garden in May.\n');
  const outside = await call(page, 'pwo_read_note', { path: '../etc/passwd' });
  expect(outside.isError).toBe(true);
  expect(errors).toEqual([]);
});
