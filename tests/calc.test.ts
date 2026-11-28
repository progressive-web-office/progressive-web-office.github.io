import { describe, expect, it } from 'vitest';
import { CalcError, parseCalc } from '../src/calc/expr';
import { evaluateStandard } from '../src/calc/standard';
import { evaluateScientific, formatNumber } from '../src/calc/scientific';
import { bitsOf, evaluateProgrammer, formatInteger, toggleBit, wrap } from '../src/calc/programmer';

const std = (s: string, ans?: string): string => evaluateStandard(parseCalc(s), ans).toString();
const sci = (s: string, angle: 'deg' | 'rad' | 'grad' = 'rad'): number => evaluateScientific(parseCalc(s), { angle });
const err = (f: () => unknown): string => {
  try {
    f();
  } catch (e) {
    return e instanceof CalcError ? e.code : `other: ${(e as Error).message}`;
  }
  return 'no error';
};

describe('CALC-002 standard mode, in decimal', () => {
  it('adds, subtracts, multiplies and divides exactly', () => {
    expect(std('0.1 + 0.2')).toBe('0.3');
    expect(std('1.1 × 1.1')).toBe('1.21');
    expect(std('7 − 10')).toBe('-3');
    expect(std('10 ÷ 4')).toBe('2.5');
    expect(std('1 / 3')).toBe('0.3333333333333333333333333333333333');
    expect(std('2 + 3 * 4')).toBe('14');
    expect(std('(2 + 3) * 4')).toBe('20');
    expect(std('-(2.5)')).toBe('-2.5');
    expect(std('123456789012345678901234567890 + 1')).toBe('123456789012345678901234567891');
  });

  it('takes percentages as a calculator does', () => {
    expect(std('200 + 10%')).toBe('220');
    expect(std('200 - 10%')).toBe('180');
    expect(std('200 × 10%')).toBe('20');
    expect(std('50%')).toBe('0.5');
  });

  it('reuses the last answer, and reports errors', () => {
    expect(std('ans × 2', '21')).toBe('42');
    expect(err(() => std('1 ÷ 0'))).toBe('divZero');
    expect(err(() => std('2 +'))).toBe('syntax');
    expect(err(() => std('(1 + 2'))).toBe('syntax');
    expect(err(() => std('sin(1)'))).toBe('notInMode');
  });
});

describe('CALC-003 scientific mode', () => {
  it('computes functions, powers, roots and constants', () => {
    expect(sci('2^10')).toBe(1024);
    expect(sci('2^3^2')).toBe(512);
    expect(sci('-2^2')).toBe(-4);
    expect(sci('sqrt(16) + cbrt(27) + root(32, 5)')).toBe(9);
    expect(sci('ln(e)')).toBeCloseTo(1);
    expect(sci('log(1000)')).toBeCloseTo(3);
    expect(sci('log(8, 2)')).toBeCloseTo(3);
    expect(sci('5!')).toBe(120);
    expect(sci('nCr(5, 2) + nPr(5, 2)')).toBe(30);
    expect(sci('abs(-3) + floor(2.7) + ceil(2.1) + round(2.5)')).toBe(11);
    expect(sci('7 mod 3')).toBe(1);
    expect(sci('2π')).toBeCloseTo(2 * Math.PI);
    expect(sci('2(3 + 1)')).toBe(8);
    expect(sci('1.5e3 + 2E-1')).toBe(1500.2);
    expect(sci('c')).toBe(299792458);
    expect(sci('sinh(0) + cosh(0) + tanh(0)')).toBe(1);
  });

  it('follows the unit of angles', () => {
    expect(sci('sin(30)', 'deg')).toBeCloseTo(0.5);
    expect(sci('cos(π)', 'rad')).toBeCloseTo(-1);
    expect(sci('tan(50)', 'grad')).toBeCloseTo(1);
    expect(sci('asin(1)', 'deg')).toBeCloseTo(90);
    expect(sci('atan(1)', 'grad')).toBeCloseTo(50);
  });

  it('reports what cannot be computed', () => {
    expect(err(() => sci('sqrt(-1)'))).toBe('domain');
    expect(err(() => sci('ln(0)'))).toBe('domain');
    expect(err(() => sci('2.5!'))).toBe('domain');
    expect(err(() => sci('1 / 0'))).toBe('divZero');
    expect(err(() => sci('foo(2)'))).toBe('unknown');
  });

  it('writes numbers in the chosen notation and digits', () => {
    expect(formatNumber(0.1 + 0.2, { digits: 15, notation: 'normal' })).toBe('0.3');
    expect(formatNumber(1 / 3, { digits: 4, notation: 'normal' })).toBe('0.3333');
    expect(formatNumber(123456, { digits: 3, notation: 'sci' })).toBe('1.23e5');
    expect(formatNumber(123456, { digits: 4, notation: 'eng' })).toBe('123.5e3');
    expect(formatNumber(0.00012, { digits: 10, notation: 'eng' })).toBe('120e-6');
    expect(formatNumber(1e25, { digits: 10, notation: 'normal' })).toBe('1e25');
    expect(formatNumber(-0, { digits: 10, notation: 'normal' })).toBe('0');
  });
});

describe('CALC-005 programmer mode', () => {
  const w8s = { bits: 8, signed: true } as const;
  const w8u = { bits: 8, signed: false } as const;
  const w32u = { bits: 32, signed: false } as const;
  const big = { bits: 0, signed: true } as const;
  const prog = (s: string, word: { bits: number; signed: boolean }, base = 10): bigint => evaluateProgrammer(parseCalc(s, { integers: true, base }), word);

  it('wraps at the size of the word, signed or not', () => {
    expect(wrap(200n, w8s)).toBe(-56n);
    expect(wrap(-6n, w8u)).toBe(250n);
    expect(prog('127 + 1', w8s)).toBe(-128n);
    expect(prog('255 + 1', w8u)).toBe(0n);
    expect(prog('2^64 + 1', big)).toBe(18446744073709551617n);
  });

  it('reads numbers in the base chosen, and with prefixes', () => {
    expect(prog('ff + 1', w32u, 16)).toBe(256n);
    expect(prog('0b1010 + 0o17 + 0x10', w32u)).toBe(41n);
    expect(prog('101 * 11', w32u, 2)).toBe(15n);
  });

  it('computes bitwise operations, shifts and rotations', () => {
    expect(prog('12 and 10', w8u)).toBe(8n);
    expect(prog('12 or 10', w8u)).toBe(14n);
    expect(prog('12 xor 10', w8u)).toBe(6n);
    expect(prog('not 5', w8s)).toBe(-6n);
    expect(prog('not 5', w8u)).toBe(250n);
    expect(prog('12 nand 10', w8u)).toBe(247n);
    expect(prog('12 nor 10', w8u)).toBe(241n);
    expect(prog('1 << 7', w8s)).toBe(-128n);
    expect(prog('-128 >> 1', w8s)).toBe(-64n);
    expect(prog('128 >> 1', w8u)).toBe(64n);
    expect(prog('129 rol 1', w8u)).toBe(3n);
    expect(prog('3 ror 1', w8u)).toBe(129n);
    expect(prog('7 ÷ 2', w8s)).toBe(3n);
    expect(prog('-7 ÷ 2', w8s)).toBe(-3n);
    expect(prog('7 mod 3', w8s)).toBe(1n);
    expect(err(() => prog('1 rol 1', big))).toBe('needsWord');
    expect(err(() => prog('1 ÷ 0', w8s))).toBe('divZero');
    expect(err(() => prog('1.5', w8s))).toBe('syntax');
  });

  it('shows a number in every base, negative ones as their bits', () => {
    expect(formatInteger(255n, 16, w32u)).toBe('FF');
    expect(formatInteger(-1n, 16, w8s)).toBe('FF');
    expect(formatInteger(-56n, 2, w8s)).toBe('1100 1000');
    expect(formatInteger(-56n, 10, w8s)).toBe('-56');
    expect(formatInteger(8n, 8, w8s)).toBe('10');
    expect(formatInteger(-5n, 16, big)).toBe('-5');
  });

  it('lists the bits of the word, and changes one', () => {
    expect(bitsOf(5n, w8u)).toEqual([true, false, true, false, false, false, false, false]);
    expect(toggleBit(5n, 7, w8s)).toBe(-123n);
    expect(toggleBit(5n, 0, w8u)).toBe(4n);
  });
});
