import { expect, test, type Page } from '@playwright/test';
import { fakeFolder, openLocalFolder } from './helpers';

// NOTE-004..NOTE-006: a `.base` file — views of the notes, formulas, display names, sort written back.

test.use({ viewport: { width: 1280, height: 900 } });

const stored = (page: Page, path: string) => page.evaluate((p) => (window as unknown as { __folder: Map<string, string> }).__folder.get(p), path);

const BASE = `# The projects
filters:
  and:
    - file.hasTag("project")
formulas:
  ttc: price * 1.2
properties:
  formula.ttc:
    displayName: Price incl. tax
  status:
    displayName: Status
views:
  - type: table
    name: Open
    filters:
      not:
        - status == "done"
    order: [file.name, status, due, formula.ttc]
    sort:
      - property: due
        direction: ASC
  - type: cards
    name: By status
    order: [file.name, status, formula.ttc, formula.unknown]
    groupBy:
      property: status
      direction: ASC
    myOwnKey: kept
`;

test('shows a .base file as views of the notes, with formulas, and writes what is changed (NOTE-004..NOTE-006)', async ({ page }) => {
  await fakeFolder(page, {
    'Projects/Engine.md': '---\nstatus: doing\ndue: 2026-12-01\nprice: 10\ntags: [project]\n---\n# Engine\n',
    'Projects/Loom.md': '---\nstatus: todo\ndue: 2026-11-20\nprice: 5\ntags: [project]\n---\n# Loom\n',
    'Projects/Archive.md': '---\nstatus: done\nprice: 7\ntags: [project]\n---\n# Archive\n',
    'People/Ada.md': '---\ntype: Person\n---\n# Ada\n',
    'Projects.base': BASE,
  });
  await openLocalFolder(page);
  await page.getByRole('complementary', { name: 'Folder' }).getByRole('button', { name: 'Projects.base', exact: true }).click();
  const view = page.getByRole('region', { name: 'Projects' });
  const table = view.getByRole('table', { name: 'Open' });
  // The display names as headers, the formula computed, the filters applied.
  await expect(table.locator('thead th')).toHaveText(['file.name', 'Status', 'due ▲', 'Price incl. tax']);
  await expect(table.locator('tbody tr th')).toHaveText(['Loom.md', 'Engine.md']);
  await expect(table.locator('tbody tr').nth(0).locator('td[data-column="formula.ttc"]')).toHaveText('6');

  // Sorted by a column, the other way at the second click.
  await table.getByRole('button', { name: 'Sort by due' }).click();
  await expect(table.locator('tbody tr th')).toHaveText(['Engine.md', 'Loom.md']);

  // A property changed in a cell: in the note's front matter, its other lines kept.
  await table.locator('tbody tr').filter({ hasText: 'Loom' }).locator('td[data-column="status"]').dblclick();
  const input = view.getByRole('textbox', { name: 'Change Status of Loom' });
  await input.fill('doing');
  await input.press('Enter');
  await expect.poll(() => stored(page, 'Projects/Loom.md')).toBe('---\nstatus: doing\ndue: 2026-11-20\nprice: 5\ntags: [project]\n---\n# Loom\n');

  // The cards view, in sections by status; what is not supported is said.
  await view.getByRole('tab', { name: 'By status' }).click();
  await expect(view.getByRole('region', { name: 'Status: doing' }).getByRole('article')).toHaveCount(2);
  await expect(view.getByRole('region', { name: 'Status: done' }).getByRole('article', { name: 'Archive' })).toBeVisible();
  await expect(view.getByRole('status')).toContainText('formula.unknown');
  await expect(view.getByRole('status')).toContainText('myOwnKey');
  await expect(view.getByRole('article', { name: 'Engine' })).toContainText('not supported');

  // Saved: only the sort changed, the comments and the unknown key kept.
  await page.keyboard.press('Control+s');
  await expect.poll(() => stored(page, 'Projects.base')).toBe(BASE.replace('        direction: ASC\n  - type: cards', '        direction: DESC\n  - type: cards'));
});
