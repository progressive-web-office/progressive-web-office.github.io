/**
 * CALC-002, CALC-003, CALC-005: the expressions typed in the calculator,
 * read as a tree that the evaluators of each mode walk. Numbers, names
 * (constants, `ans`), function calls, + − × ÷ ^, mod, the postfix ! and %,
 * a product written without its sign (`2π`, `2(3 + 1)`), and, for integers,
 * the bitwise operators (and, or, xor, not, nand, nor, <<, >>, rol, ror).
 */

export type CalcNode =
  | { k: 'num'; text: string; base: number }
  | { k: 'id'; name: string }
  | { k: 'call'; name: string; args: CalcNode[] }
  | { k: 'neg'; a: CalcNode }
  | { k: 'not'; a: CalcNode }
  | { k: 'bin'; op: BinOp; a: CalcNode; b: CalcNode }
  | { k: 'post'; op: '!' | '%'; a: CalcNode };

export type BinOp = '+' | '-' | '*' | '/' | '^' | 'mod' | 'and' | 'or' | 'xor' | 'nand' | 'nor' | '<<' | '>>' | 'rol' | 'ror';

/** What went wrong, as a key of the messages (`calc.err.<code>`). */
export type CalcErrorCode = 'syntax' | 'divZero' | 'domain' | 'unknown' | 'notInMode' | 'needsWord' | 'tooBig';

export class CalcError extends Error {
  constructor(readonly code: CalcErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export interface ParseOptions {
  /** Programmer mode: integers only, written in `base` unless prefixed with 0x, 0o or 0b. */
  integers?: boolean;
  base?: number;
}

type Token = { t: 'num'; text: string; base: number } | { t: 'id'; name: string } | { t: 'op'; op: string };

const WORD_OPS = new Set(['mod', 'and', 'or', 'xor', 'not', 'nand', 'nor', 'rol', 'ror']);
const SYMBOLS: Record<string, string> = { '−': '-', '–': '-', '×': '*', '·': '*', '÷': '/', '&': 'and', '|': 'or', '~': 'not', ';': ',' };

function tokenize(src: string, opts: ParseOptions): Token[] {
  const base = opts.base ?? 10;
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    // Prefixed integers: 0x1F, 0o17, 0b101.
    const prefixed = /^0([xob])([0-9a-f_]+)/i.exec(src.slice(i));
    if (prefixed) {
      const b = { x: 16, o: 8, b: 2 }[prefixed[1]!.toLowerCase() as 'x' | 'o' | 'b'];
      out.push({ t: 'num', text: prefixed[2]!.replace(/_/g, ''), base: b });
      i += prefixed[0].length;
      continue;
    }
    if (opts.integers && base === 16) {
      // A word of hexadecimal digits is a number, unless it names an operator.
      const word = /^[0-9a-z_]+/i.exec(src.slice(i))?.[0] ?? '';
      if (word && /^[0-9a-f_]+$/i.test(word) && !WORD_OPS.has(word.toLowerCase())) {
        out.push({ t: 'num', text: word.replace(/_/g, ''), base: 16 });
        i += word.length;
        continue;
      }
    }
    if (/[0-9.]/.test(c)) {
      const m = opts.integers ? /^[0-9_]+(?:\.[0-9]*)?/.exec(src.slice(i)) : /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
      if (!m) throw new CalcError('syntax', c);
      if (opts.integers && m[0].includes('.')) throw new CalcError('syntax', m[0]);
      out.push({ t: 'num', text: m[0].replace(/_/g, ''), base: opts.integers ? base : 10 });
      i += m[0].length;
      continue;
    }
    if (/[\p{L}_]/u.test(c)) {
      const m = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))!;
      const name = m[0];
      if (WORD_OPS.has(name.toLowerCase())) out.push({ t: 'op', op: name.toLowerCase() });
      else out.push({ t: 'id', name });
      i += name.length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '<<' || two === '>>' || two === '**') {
      out.push({ t: 'op', op: two === '**' ? '^' : two });
      i += 2;
      continue;
    }
    const op = SYMBOLS[c] ?? c;
    if (!/^[-+*/^!%(),]$|^(and|or|not)$/.test(op)) throw new CalcError('syntax', c);
    out.push({ t: 'op', op });
    i++;
  }
  return out;
}

/** Binding powers of the infix operators, the weakest first. */
const INFIX: Record<string, number> = { or: 1, nor: 1, xor: 2, and: 3, nand: 3, '<<': 4, '>>': 4, rol: 4, ror: 4, '+': 5, '-': 5, '*': 6, '/': 6, mod: 6, '^': 8 };
const PREFIX = 7;

/** Read an expression of the calculator. Throws a `CalcError` (`syntax`) when it cannot be read. */
export function parseCalc(src: string, opts: ParseOptions = {}): CalcNode {
  const tokens = tokenize(src, opts);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const isOp = (tok: Token | undefined, op: string): boolean => tok?.t === 'op' && tok.op === op;
  const expect = (op: string): void => {
    if (!isOp(peek(), op)) throw new CalcError('syntax', `expected ${op}`);
    pos++;
  };

  const primary = (): CalcNode => {
    const tok = tokens[pos++];
    if (!tok) throw new CalcError('syntax', 'end');
    if (tok.t === 'num') return { k: 'num', text: tok.text, base: tok.base };
    if (tok.t === 'id') {
      if (isOp(peek(), '(')) {
        pos++;
        const args: CalcNode[] = [];
        if (!isOp(peek(), ')')) {
          args.push(expr(0));
          while (isOp(peek(), ',')) {
            pos++;
            args.push(expr(0));
          }
        }
        expect(')');
        return { k: 'call', name: tok.name, args };
      }
      return { k: 'id', name: tok.name };
    }
    if (tok.op === '(') {
      const inner = expr(0);
      expect(')');
      return inner;
    }
    if (tok.op === '-') return { k: 'neg', a: expr(PREFIX) };
    if (tok.op === '+') return expr(PREFIX);
    if (tok.op === 'not') return { k: 'not', a: expr(PREFIX) };
    throw new CalcError('syntax', tok.op);
  };

  const postfix = (node: CalcNode): CalcNode => {
    let n = node;
    while (isOp(peek(), '!') || isOp(peek(), '%')) n = { k: 'post', op: (tokens[pos++] as { op: '!' | '%' }).op, a: n };
    return n;
  };

  function expr(min: number): CalcNode {
    let left = postfix(primary());
    for (;;) {
      const tok = peek();
      // A product written without its sign: 2π, 2(3 + 1), (1 + 2)(3 + 4).
      if (tok && (tok.t === 'id' || isOp(tok, '(') || (tok.t === 'num' && left.k !== 'num'))) {
        if (6 < min) break;
        left = { k: 'bin', op: '*', a: left, b: expr(7) };
        continue;
      }
      if (tok?.t !== 'op' || !(tok.op in INFIX)) break;
      const power = INFIX[tok.op]!;
      if (power < min) break;
      pos++;
      // ^ binds to the right: 2^3^2 = 2^9.
      const right = expr(tok.op === '^' ? power : power + 1);
      left = { k: 'bin', op: tok.op as BinOp, a: left, b: right };
    }
    return left;
  }

  const result = expr(0);
  if (pos < tokens.length) throw new CalcError('syntax', 'trailing');
  return result;
}
