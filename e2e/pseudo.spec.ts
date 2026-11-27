import { expect, test, type Download, type Page } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { zipSync } from 'fflate';
import { openApp, openFile } from './helpers';
import { docxFixture, listSpreadsheets, odtFixture, pdfFixture, rosters } from '../tests/pseudo-fixtures';

async function bytesOf(d: Download): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of await d.createReadStream()) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

/** Every request outside the application's own origin fails, and is recorded (PSEUDO-003). */
async function blockNetwork(page: Page): Promise<string[]> {
  const outside: string[] = [];
  await page.context().route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://localhost:4173/') || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    outside.push(url);
    return route.abort();
  });
  return outside;
}

const list = rosters().find((r) => r.name === 'list-semicolon-utf8.csv')!;
const PASSWORD = 'correct horse battery staple';

async function acknowledgeNotice(page: Page): Promise<void> {
  const notice = page.getByRole('dialog', { name: 'Pseudonymisation — read before use' });
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await notice.getByLabel('I have read this notice').check();
  await notice.getByRole('button', { name: 'Continue' }).click();
}

async function chooseList(page: Page, dialog: ReturnType<Page['getByRole']>): Promise<void> {
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Choose the list…' }).click();
  await (await chooser).setFiles({ name: list.name, mimeType: 'text/csv', buffer: Buffer.from(list.bytes) });
  await expect(dialog.getByText(/16 people read from list-semicolon-utf8\.csv/)).toBeVisible();
}

test.describe('PSEUDO-028 pseudonymise a copy of the open document', () => {
  test('PSEUDO-002 PSEUDO-003 PSEUDO-027 PSEUDO-030 notice, copy, report, table, re-identification — no network', async ({ page }) => {
    const errors = await openApp(page);
    const outside = await blockNetwork(page);
    const f = docxFixture();
    await openFile(page, f.name, Buffer.from(f.bytes));
    await expect(page.locator('.doc-page')).toContainText('Wei Li a calibré');
    await page.getByRole('button', { name: 'Pseudonymise…' }).click();

    const choice = page.getByRole('dialog', { name: 'Pseudonymisation' });
    await choice.getByLabel(`A copy of “${f.name}”`).check();
    await choice.getByRole('button', { name: 'Continue' }).click();
    // Opened from a file: the stored file is chosen again.
    await choice.getByLabel('Choose the file').check();
    const chooser = page.waitForEvent('filechooser');
    await choice.getByRole('button', { name: 'Continue' }).click();
    await (await chooser).setFiles({ name: f.name, mimeType: 'application/octet-stream', buffer: Buffer.from(f.bytes) });

    await acknowledgeNotice(page);
    const dialog = page.getByRole('dialog', { name: 'Pseudonymisation' });
    await chooseList(page, dialog);
    // PSEUDO-041: this browser cannot write a file in place: the table is saved after the run.
    await expect(dialog.getByLabel('Create a new table')).toBeChecked();
    await expect(dialog.getByText(/after the run you save it with “Save the table…”/)).toBeVisible();
    await dialog.getByLabel('Password of the table', { exact: true }).fill(PASSWORD);
    await dialog.getByLabel('Password again').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Pseudonymise', exact: true }).click();

    const report = dialog.getByRole('region', { name: 'Report of the pseudonymisation' });
    await expect(report).toBeVisible({ timeout: 20_000 });
    // Never a bare OK: this file has an object with a name inside, and a picture.
    await expect(report.getByText('Residues', { exact: true })).toBeVisible();
    await expect(report.getByText(/Items still to check: \d+/)).toBeVisible();

    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download the copies' }).click();
    const copy = await download;
    expect(copy.suggestedFilename()).toMatch(/^ETU-\d{3}(_ETU-\d{3})*\.docx$/);
    const entries = unzipSync(new Uint8Array(await bytesOf(copy)));
    const body = strFromU8(entries['word/document.xml']!);
    for (const name of ['Léa', 'Théo Petit', 'Inès Blanc', 'lea.martin@etu.example.org']) expect(body).not.toContain(name);
    expect(entries['docProps/thumbnail.jpeg']).toBeUndefined();

    const tableDownload = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Save the table…' }).click();
    const tableFile = await tableDownload;
    expect(tableFile.suggestedFilename()).toMatch(/\.kdbx$/);
    const table = await bytesOf(tableFile);
    expect(table.includes(Buffer.from('Martin'))).toBe(false);
    await expect(dialog.getByText(/The table was saved/)).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    expect(outside).toEqual([]);

    // Offline (once the window is loaded): the names come back in a text.
    await page.getByRole('button', { name: 'Re-identify…' }).click();
    const reid = page.getByRole('dialog', { name: 'Re-identification' });
    await expect(reid).toBeVisible();
    await page.context().setOffline(true);
    const tableChooser = page.waitForEvent('filechooser');
    await reid.getByRole('button', { name: 'Open a table…' }).click();
    await (await tableChooser).setFiles({ name: tableFile.suggestedFilename(), mimeType: 'application/octet-stream', buffer: table });
    await reid.getByLabel('Password of the table').fill(PASSWORD);
    const pseudonym = copy.suggestedFilename().split(/[_.]/)[0]!;
    await reid.getByLabel('Text with pseudonyms').fill(`Très bien, **${pseudonym.toLowerCase()}** ; voir ETU-999.`);
    await reid.getByRole('button', { name: 'Re-identify the text' }).click();
    await expect(reid.getByLabel('Text with the names')).toHaveValue(/^Très bien, \*\*(Léa|Hugo) Martin\*\* ; voir ETU-999\.$/, { timeout: 20_000 });
    await expect(reid.getByText('Not in the table, left as they are: ETU-999')).toBeVisible();
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('PSEUDO-029 a folder into an output folder', () => {
  test('refuses an output folder inside the input folder, then writes the copies to an empty one', async ({ page }) => {
    const f = docxFixture();
    await page.addInitScript(
      ({ docx, csv }: { docx: number[]; csv: number[] }) => {
        const store = new Map<string, Uint8Array>([
          ['in/report.docx', Uint8Array.from(docx)],
          ['in/notes.md', new TextEncoder().encode('Nom : Théo Petit\n')],
          ['in/list.csv', Uint8Array.from(csv)],
          ['in/old/table.kdbx', new Uint8Array([1, 2, 3])],
        ]);
        (window as unknown as { __store: Map<string, Uint8Array> }).__store = store;
        const dirs = new Map<string, unknown>();
        const dir = (prefix: string, name: string): unknown => {
          if (dirs.has(prefix)) return dirs.get(prefix);
          const handle = {
            kind: 'directory',
            name,
            isSameEntry: async (o: unknown) => o === handle,
            resolve: async (o: unknown) => {
              for (const [p, d] of dirs) if (d === o) return p.startsWith(prefix) ? p.slice(prefix.length).split('/').filter(Boolean) : null;
              return null;
            },
            async *values() {
              const seen = new Set<string>();
              for (const path of store.keys()) {
                if (!path.startsWith(prefix)) continue;
                const head = path.slice(prefix.length).split('/')[0]!;
                if (seen.has(head)) continue;
                seen.add(head);
                if (path.slice(prefix.length).includes('/')) yield dir(`${prefix}${head}/`, head);
                else yield file(path);
              }
            },
            getDirectoryHandle: async (n: string) => dir(`${prefix}${n}/`, n),
            getFileHandle: async (n: string) => file(`${prefix}${n}`),
          };
          dirs.set(prefix, handle);
          return handle;
        };
        const file = (path: string) => ({
          kind: 'file',
          name: path.split('/').pop(),
          getFile: async () => new Blob([(store.get(path) ?? new Uint8Array()) as BlobPart]),
          createWritable: async () => ({
            write: async (d: Uint8Array) => void store.set(path, new Uint8Array(d)),
            close: async () => {},
          }),
        });
        // Pickers answer in turn: the input folder, an output inside it, then an empty output.
        const answers = [() => dir('in/', 'in'), () => dir('in/old/', 'old'), () => dir('out/', 'out')];
        (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker = async () => answers.shift()!();
        delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
      },
      { docx: [...f.bytes], csv: [...list.bytes] },
    );
    const outside = await blockNetwork(page);
    await page.goto('./');
    await page.getByRole('button', { name: 'Pseudonymise…' }).click();
    await acknowledgeNotice(page);
    const dialog = page.getByRole('dialog', { name: 'Pseudonymisation' });
    await chooseList(page, dialog);
    await dialog.getByLabel('Password of the table', { exact: true }).fill(PASSWORD);
    await dialog.getByLabel('Password again').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Folder of the documents…' }).click();
    await dialog.getByRole('button', { name: 'Output folder…' }).click();
    await dialog.getByRole('button', { name: 'Pseudonymise', exact: true }).click();
    await expect(dialog.getByText('The output folder is inside the folder of the documents.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Output folder…' }).click();
    await dialog.getByRole('button', { name: 'Pseudonymise', exact: true }).click();
    await expect(dialog.getByText(/2 pseudonymised copies were written to the output folder/)).toBeVisible({ timeout: 20_000 });
    const written = await page.evaluate(() => [...(window as unknown as { __store: Map<string, Uint8Array> }).__store.keys()].filter((k) => k.startsWith('out/')).sort());
    expect(written).toHaveLength(3);
    expect(written).toContain('out/.pwo-pseudonymised');
    expect(written.some((k) => /^out\/ETU-\d{3}\.md$/.test(k))).toBe(true);
    // The list and the table were not taken as inputs.
    expect(written.some((k) => k.includes('list') || k.includes('kdbx'))).toBe(false);
    const md = await page.evaluate(() => {
      const s = (window as unknown as { __store: Map<string, Uint8Array> }).__store;
      const key = [...s.keys()].find((k) => k.startsWith('out/') && k.endsWith('.md'))!;
      return new TextDecoder().decode(s.get(key));
    });
    expect(md).toMatch(/^Nom : ETU-\d{3}\n$/);
    expect(outside).toEqual([]);
  });
});

test.describe('PSEUDO-004 PSEUDO-036 PSEUDO-037 a list in a spreadsheet', () => {
  test('the sheet, the header row and the columns are chosen, the people shown as they will be read', async ({ page }) => {
    const errors = await openApp(page);
    const outside = await blockNetwork(page);
    await page.getByRole('button', { name: 'Pseudonymise…' }).click();
    await acknowledgeNotice(page);
    const dialog = page.getByRole('dialog', { name: 'Pseudonymisation' });
    const groups = listSpreadsheets().find((l) => l.name === 'groups.xlsx')!;
    const chooser = page.waitForEvent('filechooser');
    await dialog.getByRole('button', { name: 'Choose the list…' }).click();
    await (await chooser).setFiles({ name: groups.name, mimeType: 'application/octet-stream', buffer: Buffer.from(groups.bytes) });
    // The first sheet by default; the header row found below the title; the names in one column.
    await expect(dialog.getByLabel('Sheet')).toHaveValue('0');
    await expect(dialog.getByLabel('Header row')).toHaveValue('2');
    await expect(dialog.getByLabel('Full name in one column')).toBeChecked();
    await expect(dialog.getByText('8 people read from groups.xlsx.')).toBeVisible();
    await expect(dialog.getByText(/may have lost their leading zeros/)).toBeVisible();
    const firstRow = dialog.getByRole('table', { name: 'The people as they will be read' }).locator('tbody tr').first();
    await expect(firstRow.locator('td')).toHaveText(['MARTIN', 'Léa', 'lea.martin@etu.example.org', '21900101']);
    // The order of the names, then the number column, changed by the user.
    await dialog.getByLabel('Order of the names').selectOption('first-last');
    await expect(firstRow.locator('td').nth(0)).toHaveText('Léa');
    await dialog.getByLabel('Number', { exact: true }).selectOption('');
    await expect(firstRow.locator('td').nth(3)).toHaveText('');
    // Another sheet: two columns.
    await dialog.getByLabel('Sheet').selectOption({ label: 'Groupe B' });
    await expect(dialog.getByLabel('Last name and first name in two columns')).toBeChecked();
    await expect(firstRow.locator('td').nth(0)).toHaveText('Force');
    await expect(dialog.getByText('8 people read from groups.xlsx.')).toBeVisible();
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('PSEUDO-039 the open spreadsheet is offered as the list', async ({ page }) => {
    const errors = await openApp(page);
    const list = listSpreadsheets().find((l) => l.name === 'list.ods')!;
    await openFile(page, list.name, Buffer.from(list.bytes));
    await expect(page.getByRole('tab', { name: 'Liste' })).toBeVisible();
    await page.getByRole('button', { name: 'Pseudonymise…' }).click();
    const choice = page.getByRole('dialog', { name: 'Pseudonymisation' });
    await choice.getByLabel('A folder, into another folder').check();
    await choice.getByRole('button', { name: 'Continue' }).click();
    await acknowledgeNotice(page);
    const dialog = page.getByRole('dialog', { name: 'Pseudonymisation' });
    await dialog.getByRole('button', { name: 'Use the open spreadsheet (list.ods)' }).click();
    await expect(dialog.getByLabel('Sheet')).toHaveValue('0');
    await expect(dialog.getByText('Choose the column of the last names (or of the full names).')).toBeVisible();
    await dialog.getByLabel('Sheet').selectOption({ label: 'Liste' });
    await expect(dialog.getByText('16 people read from list.ods.')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('PSEUDO-041 PSEUDO-042 the mapping table and its file', () => {
  test('a new table gets its file when it is created, and is updated there after each run, opened again too', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // File pickers kept in memory: the table file written in place.
    await page.addInitScript(() => {
      const files = new Map<string, Uint8Array>();
      (window as unknown as { __files: Map<string, Uint8Array> }).__files = files;
      const handle = (name: string) => ({
        kind: 'file',
        name,
        getFile: async () => new Blob([(files.get(name) ?? new Uint8Array()) as BlobPart]),
        createWritable: async () => ({ write: async (d: Uint8Array) => void files.set(name, new Uint8Array(d)), close: async () => {} }),
        queryPermission: async () => 'granted',
        requestPermission: async () => 'granted',
      });
      const w = window as unknown as Record<string, unknown>;
      w.showSaveFilePicker = async (o: { suggestedName?: string; types?: unknown }) => {
        // Only the table goes through this picker in this test.
        if (!o.types) throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
        return handle('classe.kdbx');
      };
      w.showOpenFilePicker = async () => [handle('classe.kdbx')];
    });
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Progressive Web Office' })).toBeVisible();
    const outside = await blockNetwork(page);
    const run = async (doc: string, first: boolean): Promise<ReturnType<Page['getByRole']>> => {
      await openFile(page, 'notes.md', `${doc}\n`);
      await expect(page.locator('.doc-page')).toContainText(doc.split(':')[0]!);
      await page.getByRole('button', { name: 'Pseudonymise…' }).click();
      const choice = page.getByRole('dialog', { name: 'Pseudonymisation' });
      await choice.getByLabel('A copy of “notes.md”').check();
      await choice.getByRole('button', { name: 'Continue' }).click();
      await choice.getByLabel('Use the document as it is now').check();
      await choice.getByRole('button', { name: 'Continue' }).click();
      if (first) await acknowledgeNotice(page);
      const dialog = page.getByRole('dialog', { name: 'Pseudonymisation' });
      await chooseList(page, dialog);
      return dialog;
    };

    // 1. A new table: chosen by default, its file chosen when it is created.
    let dialog = await run('Nom : Théo Petit', true);
    await expect(dialog.getByLabel('Create a new table')).toBeChecked();
    await expect(dialog.getByText(/in a \.kdbx file that you choose now/)).toBeVisible();
    await dialog.getByLabel('Password of the table', { exact: true }).fill(PASSWORD);
    await dialog.getByLabel('Password again').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Create the table…' }).click();
    await expect(dialog.getByText('Table created in classe.kdbx: it will be updated there after each run.')).toBeVisible({ timeout: 20_000 });
    const created = await page.evaluate(() => (window as unknown as { __files: Map<string, Uint8Array> }).__files.get('classe.kdbx')?.length ?? 0);
    expect(created).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Pseudonymise', exact: true }).click();
    await expect(dialog.getByText(/The table was updated in classe\.kdbx\./)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('button', { name: 'Save the table…' })).toHaveCount(0);
    // Closing does not warn: the table is saved.
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();

    // 2. The table opened again, updated in its own file.
    dialog = await run('Rédigé par : Inès Blanc', false);
    await dialog.getByLabel('Open a table (.kdbx)').check();
    await dialog.getByRole('button', { name: 'Open a table…' }).click();
    const ask = page.getByRole('dialog', { name: 'Password of classe.kdbx' });
    await ask.getByLabel('Password of the table').fill(PASSWORD);
    await ask.getByRole('button', { name: 'Open' }).click();
    await expect(dialog.getByText(/Table classe\.kdbx: 16 people.*It will be updated in its file after each run\./)).toBeVisible({ timeout: 20_000 });
    await dialog.getByRole('button', { name: 'Pseudonymise', exact: true }).click();
    await expect(dialog.getByText(/The table was updated in classe\.kdbx\./)).toBeVisible({ timeout: 20_000 });

    // The file holds both runs.
    const bytes = await page.evaluate(() => [...(window as unknown as { __files: Map<string, Uint8Array> }).__files.get('classe.kdbx')!]);
    const { openTable } = await import('../src/pseudo/table');
    const table = await openTable(Uint8Array.from(bytes), PASSWORD);
    expect(table.people).toHaveLength(16);
    expect(table.files).toHaveLength(2);
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test.describe('PSEUDO-044 entries of the open folder', () => {
  test('a ZIP opened as a folder, pseudonymised from the folder itself, formats kept: the PDF masked (FOLDER-032, PSEUDO-043, PSEUDO-024)', async ({ page }) => {
    const errors = await openApp(page);
    const outside = await blockNetwork(page);
    const docx = docxFixture();
    const odt = odtFixture();
    const pdf = await pdfFixture();
    const zip = zipSync({ [`Groupe 1/${docx.name}`]: docx.bytes, [`Groupe 1/${odt.name}`]: odt.bytes, [`Groupe 2/${pdf.name}`]: pdf.bytes });
    await openFile(page, 'rendus.zip', Buffer.from(zip), 'application/zip');
    const panel = page.getByRole('complementary', { name: 'Folder' });
    // FOLDER-032: the folder itself, first entry of the tree.
    const root = panel.locator('.fs-root');
    await expect(root).toHaveText('rendus.zip');
    await expect(panel.getByRole('button', { name: 'Groupe 1' })).toBeVisible();
    await root.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Pseudonymise…' }).click();

    await acknowledgeNotice(page);
    const dialog = page.getByRole('dialog', { name: 'Pseudonymisation' });
    await expect(dialog.getByText('The files of “rendus.zip”')).toBeVisible();
    await expect(dialog.getByText('3 files')).toBeVisible();
    // PSEUDO-043: one choice per kind of file, its own format by default.
    await expect(dialog.getByLabel('Output of the Word (.docx) files')).toHaveValue('kept');
    await expect(dialog.getByLabel('Output of the PDF (.pdf) files')).toHaveValue('kept');
    await dialog.getByLabel('Output of the OpenDocument text (.odt) files').selectOption({ label: 'Word (.docx)' });
    await chooseList(page, dialog);
    await dialog.getByLabel('Password of the table', { exact: true }).fill(PASSWORD);
    await dialog.getByLabel('Password again').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Pseudonymise', exact: true }).click();
    const report = dialog.getByRole('region', { name: 'Report of the pseudonymisation' });
    await expect(report).toBeVisible({ timeout: 30_000 });

    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download the copies' }).click();
    const copies = unzipSync(new Uint8Array(await bytesOf(await download)));
    const names = Object.keys(copies).sort();
    expect(names.filter((n) => n.endsWith('.docx'))).toHaveLength(2);
    const [pdfName] = names.filter((n) => n.endsWith('.pdf'));
    expect(pdfName).toMatch(/^ETU-\d{3}/);
    // Flat: no folder names (they may hold names).
    expect(names.every((n) => !n.includes('/'))).toBe(true);
    const out = copies[pdfName!]!;
    expect(strFromU8(out.subarray(0, 5))).toBe('%PDF-');
    // The first page is a picture now; the metadata and the outline are gone.
    const latin = Buffer.from(out).toString('latin1');
    expect(latin).toContain('/Subtype /Image');
    for (const gone of ['/Outlines', '/AcroForm', '/EmbeddedFiles', 'Compte rendu']) expect(latin).not.toContain(gone);
    // The masked page is shown to check, as a picture.
    await expect(report.locator('img').first()).toBeVisible();
    expect(outside).toEqual([]);
    expect(errors).toEqual([]);
  });
});
