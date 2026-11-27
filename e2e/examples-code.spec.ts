import { expect, test } from '@playwright/test';
import { answerCodeQuestions, openApp, usePyodidePackages, pickTemplate } from './helpers';

/**
 * FILE-018, CODE-016: every example with code runs without an error — all
 * their cells, as a reader would run them (the network is needed for the
 * packages: CI).
 */
const EXAMPLES: [name: string, cells: number][] = [
  ['A tour of the word processor', 1],
  ['Lab report with Python plots', 0],
  ['Computer algebra', 13],
  ['Interactive widgets', 0],
  ['Instrument panel', 4],
  ['Automation panel', 4],
  ['Flight instruments', 3],
  ['Car dashboard', 3],
];

for (const [name, min] of EXAMPLES) {
  test(`runs every cell of the example “${name}” without an error (FILE-018)`, async ({ page }) => {
    test.setTimeout(600_000);
    test.skip(!(await usePyodidePackages(page)) || !process.env.CI, 'needs the network (CI) for the Python packages');
    const errors = await openApp(page);
    const log: string[] = [];
    page.on('console', (m) => log.push(`${m.type()}: ${m.text()}`));
    await page.getByRole('button', { name: 'Templates and examples' }).click();
    await pickTemplate(page, name);
    const cells = page.locator('.doc-page .code-cell');
    await expect.poll(() => cells.count()).toBeGreaterThanOrEqual(Math.max(1, min));
    const stopAnswering = answerCodeQuestions(page);
    await cells.first().getByRole('button', { name: 'Run all cells' }).click();
    // Started, then done: an error, or no cell waiting or running any more.
    const pending = page.locator('.doc-page .code-cell-output.pending');
    await expect(pending.first()).toBeVisible({ timeout: 60_000 });
    const failed = cells.locator('.code-cell-output.error');
    const done = async (): Promise<boolean> => (await failed.count()) > 0 || (await pending.count()) === 0;
    const deadline = Date.now() + 480_000;
    while (!(await done()) && Date.now() < deadline) await page.waitForTimeout(2_000);
    if (!(await done())) {
      // Stuck: what each cell shows, the windows open, the console — to fix the example.
      console.log(`[${name}] stuck. Cells:\n${(await cells.locator('.code-cell-output').allTextContents()).map((t, i) => `  ${i}: ${t.slice(0, 300)}`).join('\n')}`);
      console.log(`[${name}] dialogs: ${JSON.stringify(await page.locator('dialog[open]').allTextContents())}`);
      console.log(`[${name}] console:\n${log.slice(-60).join('\n')}`);
    }
    stopAnswering();
    expect(await done()).toBe(true);
    const problems = await failed.allTextContents();
    // The whole message in the CI log, to fix the example.
    for (const p of problems) console.log(`[${name}] cell error:\n${p}`);
    expect(problems).toEqual([]);
    expect(errors.filter((e) => !e.startsWith('Failed to load resource'))).toEqual([]);
  });
}
