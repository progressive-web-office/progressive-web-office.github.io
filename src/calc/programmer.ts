/**
 * CALC-005: the Programmer mode, on integers (BigInt): a word of 8, 16, 32
 * or 64 bits, signed (two's complement) or not, or without limit; bitwise
 * operations, shifts and rotations; every base at once, and the bits.
 */
import { CalcError, type CalcNode } from './expr';

export interface Word {
  /** 8, 16, 32 or 64; 0 for no limit. */
  bits: number;
  signed: boolean;
}

/** `v` as a word holds it: wrapped at its size, read as signed or not. */
export function wrap(v: bigint, w: Word): bigint {
  if (!w.bits) return v;
  const size = 1n << BigInt(w.bits);
  let r = ((v % size) + size) % size;
  if (w.signed && r >= size >> 1n) r -= size;
  return r;
}

/** The bits of the word, as an unsigned number (two's complement for a negative one). */
const unsigned = (v: bigint, w: Word): bigint => wrap(v, { bits: w.bits, signed: false });

export function evaluateProgrammer(node: CalcNode, w: Word, ans = 0n): bigint {
  const needsWord = (): void => {
    if (!w.bits) throw new CalcError('needsWord');
  };
  const walk = (n: CalcNode): bigint => {
    switch (n.k) {
      case 'num':
        try {
          return wrap(BigInt(n.base === 10 ? n.text : `0${{ 16: 'x', 8: 'o', 2: 'b' }[n.base as 16 | 8 | 2]}${n.text}`), w);
        } catch {
          throw new CalcError('syntax', n.text);
        }
      case 'id':
        if (n.name.toLowerCase() === 'ans') return ans;
        throw new CalcError('unknown', n.name);
      case 'neg':
        return wrap(-walk(n.a), w);
      case 'not':
        return wrap(~walk(n.a), w);
      case 'bin': {
        const a = walk(n.a);
        const b = walk(n.b);
        switch (n.op) {
          case '+':
            return wrap(a + b, w);
          case '-':
            return wrap(a - b, w);
          case '*':
            return wrap(a * b, w);
          case '/':
            if (b === 0n) throw new CalcError('divZero');
            // BigInt division truncates towards zero, as C does.
            return wrap(a / b, w);
          case 'mod':
            if (b === 0n) throw new CalcError('divZero');
            return wrap(a % b, w);
          case '^':
            if (b < 0n) throw new CalcError('domain', '^');
            if (!w.bits && b > 100000n) throw new CalcError('tooBig');
            return wrap(w.bits ? modPow(a, b, w) : a ** b, w);
          case 'and':
            return wrap(a & b, w);
          case 'or':
            return wrap(a | b, w);
          case 'xor':
            return wrap(a ^ b, w);
          case 'nand':
            return wrap(~(a & b), w);
          case 'nor':
            return wrap(~(a | b), w);
          case '<<':
            if (b < 0n) throw new CalcError('domain', '<<');
            if (!w.bits && b > 100000n) throw new CalcError('tooBig');
            return wrap(a << b, w);
          case '>>':
            if (b < 0n) throw new CalcError('domain', '>>');
            // Arithmetic for a signed word, logical for an unsigned one.
            return wrap((w.signed || !w.bits ? a : unsigned(a, w)) >> b, w);
          case 'rol':
          case 'ror': {
            needsWord();
            const size = BigInt(w.bits);
            const k = ((n.op === 'rol' ? b : -b) % size + size) % size;
            const u = unsigned(a, w);
            return wrap((u << k) | (u >> (size - k)), w);
          }
        }
        throw new CalcError('notInMode');
      }
      default:
        throw new CalcError('notInMode', n.k);
    }
  };
  return walk(node);
}

/** a^b in a word, without building the whole power. */
function modPow(a: bigint, b: bigint, w: Word): bigint {
  const size = 1n << BigInt(w.bits);
  let base = ((a % size) + size) % size;
  let e = b;
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * base) % size;
    base = (base * base) % size;
    e >>= 1n;
  }
  return r;
}

/** `v` in `base`, its digits grouped by four in binary and hexadecimal; a negative word as its bits outside base 10. */
export function formatInteger(v: bigint, base: 2 | 8 | 10 | 16, w: Word): string {
  if (base === 10) return v.toString();
  const negative = v < 0n && !w.bits;
  const digits = (negative ? -v : w.bits ? unsigned(v, w) : v).toString(base).toUpperCase();
  const grouped = base === 2 || base === 16 ? digits.replace(/\B(?=(.{4})+$)/g, ' ') : digits;
  return negative ? `-${grouped}` : grouped;
}

/** The bits of the word, the lowest first. */
export function bitsOf(v: bigint, w: Word): boolean[] {
  const u = unsigned(v, w);
  return Array.from({ length: w.bits }, (_, i) => ((u >> BigInt(i)) & 1n) === 1n);
}

/** `v` with bit `i` changed. */
export function toggleBit(v: bigint, i: number, w: Word): bigint {
  return wrap(v ^ (1n << BigInt(i)), w);
}
