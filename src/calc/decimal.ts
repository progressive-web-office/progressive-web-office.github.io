/**
 * CALC-002: decimal numbers, exact for + − ×, with 34 significant digits for
 * ÷ (as IEEE 754 decimal128): 0.1 + 0.2 = 0.3. A value is `m × 10^−s`.
 */
import { CalcError } from './expr';

/** Significant digits kept by a division. */
export const DIVISION_DIGITS = 34;
/** Digits of the integer part beyond which a result is too large to show. */
const MAX_DIGITS = 1000;

export class Dec {
  private constructor(
    readonly m: bigint,
    readonly s: number,
  ) {}

  static of(m: bigint, s = 0): Dec {
    // Normalised: no trailing zero in the mantissa, no negative scale.
    let mm = m;
    let ss = s;
    while (ss > 0 && mm % 10n === 0n) {
      mm /= 10n;
      ss--;
    }
    if (ss < 0) {
      mm *= 10n ** BigInt(-ss);
      ss = 0;
    }
    if (mm.toString().replace('-', '').length - ss > MAX_DIGITS) throw new CalcError('tooBig');
    return new Dec(mm, ss);
  }

  /** `12.5`, `-0.03`, `1.5e3`. */
  static parse(text: string): Dec {
    const m = /^(-)?(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text.trim());
    if (!m || (!m[2] && !m[3])) throw new CalcError('syntax', text);
    const frac = m[3] ?? '';
    const exp = Number(m[4] ?? 0);
    const mant = BigInt(`${m[1] ?? ''}${m[2] || '0'}${frac}`);
    return Dec.of(mant, frac.length - exp);
  }

  private static align(a: Dec, b: Dec): [bigint, bigint, number] {
    const s = Math.max(a.s, b.s);
    return [a.m * 10n ** BigInt(s - a.s), b.m * 10n ** BigInt(s - b.s), s];
  }

  add(b: Dec): Dec {
    const [x, y, s] = Dec.align(this, b);
    return Dec.of(x + y, s);
  }

  sub(b: Dec): Dec {
    return this.add(b.neg());
  }

  mul(b: Dec): Dec {
    return Dec.of(this.m * b.m, this.s + b.s);
  }

  neg(): Dec {
    return new Dec(-this.m, this.s);
  }

  isZero(): boolean {
    return this.m === 0n;
  }

  isInteger(): boolean {
    return this.s === 0;
  }

  /** Rounded half away from zero to `DIVISION_DIGITS` significant digits. */
  div(b: Dec): Dec {
    if (b.isZero()) throw new CalcError('divZero');
    if (this.isZero()) return Dec.of(0n);
    // this / b = (this.m / b.m) × 10^(b.s − this.s); scale the numerator to get enough digits.
    const digits = (x: bigint): number => (x < 0n ? -x : x).toString().length;
    const extra = Math.max(0, DIVISION_DIGITS + 1 - (digits(this.m) - digits(b.m)));
    const num = this.m * 10n ** BigInt(extra);
    let q = num / b.m;
    const r = num % b.m;
    const negative = this.m < 0n !== b.m < 0n;
    if (r !== 0n && 2n * (r < 0n ? -r : r) >= (b.m < 0n ? -b.m : b.m)) q += negative ? -1n : 1n;
    return Dec.of(q, this.s - b.s + extra).round(DIVISION_DIGITS);
  }

  /** Rounded half away from zero to `n` significant digits. */
  round(n: number): Dec {
    const abs = this.m < 0n ? -this.m : this.m;
    const drop = abs.toString().length - n;
    if (drop <= 0) return this;
    const p = 10n ** BigInt(drop);
    let q = abs / p;
    if (2n * (abs % p) >= p) q += 1n;
    return Dec.of(this.m < 0n ? -q : q, this.s - drop);
  }

  /** An integer power. */
  pow(e: Dec): Dec {
    if (!e.isInteger()) throw new CalcError('notInMode', 'power');
    if (e.m < 0n) return Dec.of(1n).div(this.pow(e.neg()));
    if (e.m > 10000n) throw new CalcError('tooBig');
    let result = Dec.of(1n);
    for (let i = 0n; i < e.m; i++) result = result.mul(this);
    return result;
  }

  /** As written by the calculator: `-12.5`, `0.003`. */
  toString(): string {
    const neg = this.m < 0n;
    const digits = (neg ? -this.m : this.m).toString().padStart(this.s + 1, '0');
    const int = digits.slice(0, digits.length - this.s);
    const frac = digits.slice(digits.length - this.s);
    return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
  }
}
