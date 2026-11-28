/**
 * CALC-003: the Scientific mode, in double precision: functions, angles in
 * degrees, radians or grads, constants, and numbers written in normal,
 * scientific or engineering notation with a chosen number of digits.
 */
import { CalcError, type CalcNode } from './expr';

export type AngleUnit = 'deg' | 'rad' | 'grad';
export type Notation = 'normal' | 'sci' | 'eng';

export interface ScientificOptions {
  angle: AngleUnit;
  /** The last answer. */
  ans?: number;
  random?: () => number;
}

/** Constants by name, with their symbol and meaning shown in the calculator (SI, CODATA 2018 exact values where defined). */
export const CONSTANTS: { name: string; value: number; key: string }[] = [
  { name: 'π', value: Math.PI, key: 'pi' },
  { name: 'e', value: Math.E, key: 'e' },
  { name: 'φ', value: (1 + Math.sqrt(5)) / 2, key: 'phi' },
  { name: 'c', value: 299792458, key: 'c' },
  { name: 'g', value: 9.80665, key: 'g' },
  { name: 'G', value: 6.6743e-11, key: 'G' },
  { name: 'h', value: 6.62607015e-34, key: 'h' },
  { name: 'qe', value: 1.602176634e-19, key: 'qe' },
  { name: 'NA', value: 6.02214076e23, key: 'NA' },
  { name: 'kB', value: 1.380649e-23, key: 'kB' },
  { name: 'R', value: 8.314462618, key: 'R' },
];
const BY_NAME = new Map<string, number>([...CONSTANTS.map((c) => [c.name, c.value] as const), ['pi', Math.PI], ['phi', (1 + Math.sqrt(5)) / 2]]);

const domain = (ok: boolean, what: string): void => {
  if (!ok) throw new CalcError('domain', what);
};

const integer = (x: number, what: string): number => {
  domain(Number.isInteger(x) && x >= 0, what);
  return x;
};

function factorial(n: number): number {
  integer(n, '!');
  if (n > 170) throw new CalcError('tooBig');
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/** A value close to an integer within the error of a double is that integer (sin(π) = 0). */
const tidy = (x: number): number => (Math.abs(x) < 1e-15 ? 0 : x);

export function evaluateScientific(node: CalcNode, opts: ScientificOptions): number {
  const toRad = opts.angle === 'deg' ? Math.PI / 180 : opts.angle === 'grad' ? Math.PI / 200 : 1;
  const trig = (f: (x: number) => number) => (x: number): number => tidy(f(x * toRad));
  const inverse = (f: (x: number) => number, lo = -1, hi = 1) => (x: number): number => {
    domain(x >= lo && x <= hi, 'range');
    return f(x) / toRad;
  };
  const positive = (f: (x: number) => number) => (x: number): number => {
    domain(x > 0, 'log');
    return f(x);
  };
  const FUNCTIONS: Record<string, (...x: number[]) => number> = {
    sin: trig(Math.sin),
    cos: trig(Math.cos),
    tan: (x) => {
      const c = Math.cos(x * toRad);
      domain(Math.abs(c) > 1e-15, 'tan');
      return tidy(Math.sin(x * toRad) / c);
    },
    asin: inverse(Math.asin),
    acos: inverse(Math.acos),
    atan: inverse(Math.atan, -Infinity, Infinity),
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: (x) => {
      domain(x >= 1, 'acosh');
      return Math.acosh(x);
    },
    atanh: (x) => {
      domain(x > -1 && x < 1, 'atanh');
      return Math.atanh(x);
    },
    exp: Math.exp,
    ln: positive(Math.log),
    log: (x, b) => {
      domain(x > 0, 'log');
      if (b === undefined) return Math.log10(x);
      domain(b > 0 && b !== 1, 'log');
      return Math.log(x) / Math.log(b);
    },
    log2: positive(Math.log2),
    sqrt: (x) => {
      domain(x >= 0, 'sqrt');
      return Math.sqrt(x);
    },
    cbrt: Math.cbrt,
    root: (x, n) => {
      domain(n !== 0 && (x >= 0 || (Number.isInteger(n) && n % 2 !== 0)), 'root');
      return x < 0 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n);
    },
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    // Half away from zero, as taught.
    round: (x) => Math.sign(x) * Math.round(Math.abs(x)),
    nCr: (n, r) => {
      integer(n, 'nCr');
      integer(r, 'nCr');
      if (r > n) return 0;
      let c = 1;
      for (let i = 1; i <= Math.min(r, n - r); i++) c = (c * (n - i + 1)) / i;
      return Math.round(c);
    },
    nPr: (n, r) => {
      integer(n, 'nPr');
      integer(r, 'nPr');
      if (r > n) return 0;
      let p = 1;
      for (let i = 0; i < r; i++) p *= n - i;
      return p;
    },
    rand: () => (opts.random ?? Math.random)(),
  };
  const ARITY: Record<string, [number, number]> = { log: [1, 2], root: [2, 2], nCr: [2, 2], nPr: [2, 2], rand: [0, 0] };

  const walk = (n: CalcNode): number => {
    switch (n.k) {
      case 'num':
        return Number(n.text);
      case 'id': {
        if (n.name.toLowerCase() === 'ans') return opts.ans ?? 0;
        const v = BY_NAME.get(n.name);
        if (v === undefined) throw new CalcError('unknown', n.name);
        return v;
      }
      case 'call': {
        const f = FUNCTIONS[n.name] ?? FUNCTIONS[n.name.toLowerCase()];
        if (!f) throw new CalcError('unknown', n.name);
        const [min, max] = ARITY[n.name] ?? [1, 1];
        if (n.args.length < min || n.args.length > max) throw new CalcError('syntax', n.name);
        return f(...n.args.map(walk));
      }
      case 'neg':
        return -walk(n.a);
      case 'post':
        return n.op === '!' ? factorial(walk(n.a)) : walk(n.a) / 100;
      case 'bin': {
        const a = walk(n.a);
        if (n.b.k === 'post' && n.b.op === '%' && (n.op === '+' || n.op === '-')) {
          const part = (a * walk(n.b.a)) / 100;
          return n.op === '+' ? a + part : a - part;
        }
        const b = walk(n.b);
        switch (n.op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            if (b === 0) throw new CalcError('divZero');
            return a / b;
          case '^': {
            domain(!(a < 0 && !Number.isInteger(b)), '^');
            domain(!(a === 0 && b < 0), '^');
            return Math.pow(a, b);
          }
          case 'mod':
            if (b === 0) throw new CalcError('divZero');
            return a - b * Math.floor(a / b);
          default:
            throw new CalcError('notInMode', n.op);
        }
      }
      default:
        throw new CalcError('notInMode', n.k);
    }
  };
  const result = walk(node);
  if (Number.isNaN(result)) throw new CalcError('domain');
  if (!Number.isFinite(result)) throw new CalcError('tooBig');
  return result;
}

/** A number as written by the calculator, with `digits` significant digits. */
export function formatNumber(x: number, opts: { digits: number; notation: Notation }): string {
  if (x === 0) return '0';
  const digits = Math.min(17, Math.max(1, Math.round(opts.digits)));
  const exponent = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(digits)))));
  const strip = (s: string): string => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);
  const sci = (mantissaExp: number): string => {
    const m = Number((x / 10 ** mantissaExp).toPrecision(digits));
    return `${strip(m.toPrecision(digits))}e${mantissaExp}`;
  };
  if (opts.notation === 'sci') return sci(exponent);
  if (opts.notation === 'eng') {
    const e3 = Math.floor(exponent / 3) * 3;
    // The digits before the point count among the significant ones.
    const m = Number((x / 10 ** e3).toPrecision(digits));
    return `${strip(String(m))}e${e3}`;
  }
  if (exponent >= 21 || exponent < -7) return sci(exponent);
  return strip(Number(x.toPrecision(digits)).toString());
}
