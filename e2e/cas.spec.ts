import { expect, test } from '@playwright/test';
import { openApp, openFile, pickTemplate, saveAs, usePyodidePackages } from './helpers';

test('a math cell is written in a math field, wrapped in an operation, shown and saved as equations (CAS-001, CAS-002, CAS-005)', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await openApp(page);
  const python = await usePyodidePackages(page);
  await openFile(page, 'calc.md', 'Calcul\n');
  await page.locator('.doc-page p').first().click();
  await page.getByRole('button', { name: 'Insert math cell' }).click();
  const dialog = page.getByRole('dialog', { name: 'Insert a math cell' });
  await dialog.getByLabel('LaTeX source').fill('x^2-1');
  // CAS-002: the operation wraps the expression; the code sent to SymPy is shown on request.
  await dialog.getByRole('combobox', { name: 'Operation' }).selectOption({ label: 'Factor' });
  await dialog.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog.getByLabel('LaTeX source')).toHaveValue('\\operatorname{factor}\\left(x^2-1\\right)');
  await dialog.getByText('Code sent to SymPy').click();
  await expect(dialog.locator('.cas-code')).toContainText('_sp.factor(');
  await dialog.getByRole('button', { name: 'Insert' }).click();
  const cell = page.locator('.doc-page .code-cell');
  await expect(cell.locator('.code-cell-lang')).toHaveText('Math · SymPy');
  await expect(cell.locator('.code-cell-source .math[data-rendered]')).toHaveCount(1);

  if (python) {
    await cell.getByRole('button', { name: 'Run cell' }).click();
    await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
    const result = cell.locator('.code-cell-output.math-result .math');
    await expect(result).toHaveAttribute('data-latex', '\\left(x - 1\\right) \\left(x + 1\\right)', { timeout: 200_000 });
    const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
    expect(md).toContain('```math {run sympy}\n\\operatorname{factor}\\left(x^2-1\\right)\n```\n\n```math {output}\n\\left(x - 1\\right) \\left(x + 1\\right)\n```');
  } else {
    const md = (await saveAs(page, 'Markdown (.md)')).data.toString('utf8');
    expect(md).toContain('```math {run sympy}\n\\operatorname{factor}\\left(x^2-1\\right)\n```');
  }
  expect(errors).toEqual([]);
});

test('an expression that cannot be read says why, without running anything (CAS-002)', async ({ page }) => {
  const errors = await openApp(page);
  await openFile(page, 'bad.md', '```math {run sympy}\nx+\n```\n');
  const cell = page.locator('.doc-page .code-cell');
  await cell.getByRole('button', { name: 'Run cell' }).click();
  await page.getByRole('dialog', { name: 'Run the code of this document?' }).getByRole('button', { name: 'Run' }).click();
  await expect(cell.locator('.code-cell-output.error')).toContainText('The expression cannot be read', { timeout: 60_000 });
  expect(errors).toEqual([]);
});

test('the computer algebra example shows its cells and their results as equations (CAS-006)', async ({ page }) => {
  const errors = await openApp(page);
  await page.getByRole('button', { name: 'Templates and examples' }).click();
  await pickTemplate(page, 'Computer algebra');
  const cells = page.locator('.doc-page .code-cell');
  await expect(cells).toHaveCount(13);
  await expect(cells.first().locator('.code-cell-output.math-result .math')).toHaveAttribute('data-latex', '\\frac{1}{2}');
  await expect(page.locator('.doc-page .math-result .math[data-rendered]').first()).toBeVisible();
  expect(errors).toEqual([]);
});
