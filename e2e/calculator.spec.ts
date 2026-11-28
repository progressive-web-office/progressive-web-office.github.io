import { expect, test, type Page } from '@playwright/test';
import { openApp } from './helpers';

async function openCalculator(page: Page) {
  await page.getByRole('button', { name: 'Calculator' }).click();
  const calc = page.getByRole('dialog', { name: 'Calculator' });
  await expect(calc).toBeVisible();
  return calc;
}

test('Standard mode: decimal arithmetic, keys, percentages, memory and history; the mode is kept (CALC-001, CALC-002, CALC-012)', async ({ page }) => {
  const errors = await openApp(page);
  const outside: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost:4173/') && !/^(blob|data):/.test(r.url())) outside.push(r.url());
  });
  const calc = await openCalculator(page);
  await expect(calc.getByRole('tab', { name: 'Standard' })).toHaveAttribute('aria-selected', 'true');
  const input = calc.getByRole('textbox', { name: 'Expression' });
  const result = calc.getByRole('status');
  // Typed, Enter computes.
  await input.fill('0.1 + 0.2');
  await input.press('Enter');
  await expect(result).toHaveText('= 0.3');
  await input.fill('200 + 10%');
  await input.press('Enter');
  await expect(result).toHaveText('= 220');
  // With the keys.
  await calc.getByRole('button', { name: 'Clear', exact: true }).click();
  for (const k of ['7', 'Multiply', '6']) await calc.getByRole('button', { name: k, exact: true }).click();
  await expect(input).toHaveValue('7×6');
  await calc.getByRole('button', { name: 'Compute' }).click();
  await expect(result).toHaveText('= 42');
  // Memory: store, then recall into a new expression.
  await calc.getByRole('button', { name: 'Store the last result in the memory' }).click();
  await expect(calc.getByText('Memory: 42')).toBeVisible();
  await input.fill('');
  await calc.getByRole('button', { name: 'Recall the memory' }).click();
  await input.press('End');
  await input.type(' ÷ 4');
  await input.press('Enter');
  await expect(result).toHaveText('= 10.5');
  // The history, the latest first; an entry can be taken up again.
  const history = calc.getByRole('region', { name: 'History' });
  await expect(history.locator('li')).toHaveText([/^42 ÷ 4 = 10\.5/, /^7×6 = 42/, /^200 \+ 10% = 220/, /^0\.1 \+ 0\.2 = 0\.3/]);
  await history.locator('li').nth(1).getByRole('button', { name: 'Edit' }).click();
  await expect(input).toHaveValue('7×6');
  // Errors are said, not thrown.
  await input.fill('1 ÷ 0');
  await input.press('Enter');
  await expect(result).toHaveText('Division by zero.');
  // The last mode is kept from one opening to the next.
  await calc.getByRole('tab', { name: 'Scientific' }).click();
  await calc.getByRole('button', { name: 'Close' }).click();
  await expect(calc).toBeHidden();
  const again = await openCalculator(page);
  await expect(again.getByRole('tab', { name: 'Scientific' })).toHaveAttribute('aria-selected', 'true');
  expect(outside).toEqual([]);
  expect(errors).toEqual([]);
});

test('Scientific mode: functions, angles, notation and constants, from the keyboard (CALC-003, CALC-012)', async ({ page }) => {
  const errors = await openApp(page);
  const calc = await openCalculator(page);
  // The tabs from the keyboard: arrows move between the modes.
  await calc.getByRole('tab', { name: 'Standard' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(calc.getByRole('tab', { name: 'Scientific' })).toHaveAttribute('aria-selected', 'true');
  const input = calc.getByRole('textbox', { name: 'Expression' });
  const result = calc.getByRole('status');
  await calc.getByLabel('Angles').selectOption('Degrees');
  await input.fill('2sin(30) + sqrt(16) + 5!');
  await input.press('Enter');
  await expect(result).toHaveText('= 125');
  await calc.getByLabel('Angles').selectOption('Radians');
  await input.fill('cos(π)');
  await input.press('Enter');
  await expect(result).toHaveText('= -1');
  await calc.getByRole('button', { name: 'Clear', exact: true }).click();
  await calc.getByRole('button', { name: 'Natural logarithm' }).click();
  await calc.getByRole('button', { name: "Euler's number" }).or(calc.getByRole('button', { name: 'Euler’s number' })).click();
  await calc.getByRole('button', { name: ')', exact: true }).click();
  await input.press('Enter');
  await expect(result).toHaveText('= 1');
  await calc.getByLabel('Notation').selectOption('Scientific');
  await calc.getByLabel('Significant digits').fill('3');
  await calc.getByLabel('Significant digits').press('Tab');
  await input.fill('');
  await calc.getByLabel('Constants').selectOption({ label: 'c — speed of light (m/s)' });
  await input.press('Enter');
  await expect(result).toHaveText('= 3e8');
  await input.fill('sqrt(-1)');
  await input.press('Enter');
  await expect(result).toHaveText('Outside the domain of the function.');
  expect(errors).toEqual([]);
});

test('Programmer mode: words, bases, bitwise operations and the grid of bits (CALC-005)', async ({ page }) => {
  const errors = await openApp(page);
  const calc = await openCalculator(page);
  await calc.getByRole('tab', { name: 'Programmer' }).click();
  const input = calc.getByRole('textbox', { name: 'Expression' });
  const result = calc.getByRole('status');
  await calc.getByLabel('Word', { exact: true }).selectOption('8 bits');
  await input.fill('127 + 1');
  await input.press('Enter');
  await expect(result).toHaveText('= -128');
  const bases = calc.locator('.calc-bases');
  await expect(bases).toContainText('HEX80');
  await expect(bases).toContainText('BIN1000 0000');
  // A bit clicked changes the number.
  const bits = calc.getByRole('group', { name: 'Bits of the word' });
  await expect(bits.getByRole('button')).toHaveCount(8);
  await bits.getByRole('button', { name: 'Bit 0' }).click();
  await expect(bits.getByRole('button', { name: 'Bit 0' })).toHaveAttribute('aria-pressed', 'true');
  await expect(bases).toContainText('DEC-127');
  await expect(input).toHaveValue('-127');
  // Unsigned, typed in hexadecimal; the letters become keys.
  await calc.getByLabel('Signed (two’s complement)').uncheck();
  await calc.getByLabel('Typed in').selectOption('HEX');
  await expect(calc.getByRole('button', { name: 'F', exact: true })).toBeEnabled();
  await expect(calc.getByRole('button', { name: '9', exact: true })).toBeEnabled();
  await input.fill('f0');
  await calc.getByRole('button', { name: 'Bitwise exclusive OR' }).click();
  await input.press('End');
  await input.type('ff');
  await input.press('Enter');
  await expect(result).toHaveText('= 15');
  await expect(bases).toContainText('HEXF');
  await calc.getByLabel('Typed in').selectOption('BIN');
  await expect(calc.getByRole('button', { name: '2', exact: true })).toBeDisabled();
  await input.fill('1 rol 111');
  await input.press('Enter');
  await expect(result).toHaveText('= 128');
  expect(errors).toEqual([]);
});

test('the calculator opens from the command palette and from the Insert menu of a document (CALC-001)', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+Shift+P');
  const palette = page.getByRole('dialog', { name: 'Commands' });
  await palette.getByRole('combobox').fill('calculator');
  await expect(palette.getByRole('option').first()).toContainText('Calculator');
  await page.keyboard.press('Enter');
  const calc = page.getByRole('dialog', { name: 'Calculator' });
  await expect(calc).toBeVisible();
  await calc.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'New document' }).click();
  await page.locator('.ProseMirror').click();
  await page.getByRole('toolbar', { name: 'Formatting' }).getByRole('button', { name: 'Calculator' }).click();
  await expect(calc).toBeVisible();
});
