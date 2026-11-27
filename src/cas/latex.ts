/**
 * CAS-002: the LaTeX written by a math field (MathLive), read as an
 * expression tree that an engine's translator walks. Only the notation of
 * mathematics is understood: numbers, symbols, Greek letters, operations,
 * powers, roots, fractions, functions, factorials, absolute values,
 * matrices, relations, definitions (`:=`), integrals, derivatives, limits,
 * sums and products, and the operations written `\operatorname{name}(…)`.
 */

export type Rel = '=' | '<' | '>' | '<=' | '>=' | '!=';

export type Expr =
  | { k: 'num'; v: string }
  | { k: 'sym'; name: string }
  | { k: 'const'; name: 'pi' | 'oo' }
  | { k: 'add'; args: Expr[] }
  | { k: 'neg'; arg: Expr }
  | { k: 'mul'; args: Expr[] }
  | { k: 'div'; num: Expr; den: Expr }
  | { k: 'pow'; base: Expr; exp: Expr }
  | { k: 'paren'; arg: Expr }
  | { k: 'fact'; arg: Expr }
  | { k: 'abs'; arg: Expr }
  /** A usual function (sin, ln, sqrt…), an operation (simplify, solve…), or `root` with its index second. */
  | { k: 'fn'; name: string; args: Expr[] }
  /** A function of the user (`f(x)`), defined in the document or not. */
  | { k: 'call'; name: string; args: Expr[] }
  | { k: 'int'; body: Expr; v: string; from?: Expr; to?: Expr }
  | { k: 'sum' | 'prod'; body: Expr; v: string; from: Expr; to: Expr }
  | { k: 'lim'; body: Expr; v: string; to: Expr; dir?: '+' | '-' }
  | { k: 'diff'; body: Expr; v: string; n: number }
  | { k: 'rel'; op: Rel; left: Expr; right: Expr }
  | { k: 'assign'; target: { k: 'sym'; name: string } | { k: 'call'; name: string; args: Expr[] }; value: Expr }
  | { k: 'list'; items: Expr[] }
  | { k: 'matrix'; rows: Expr[][] };

export class CasSyntaxError extends Error {
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(message);
    this.name = 'CasSyntaxError';
  }
}

type Tok =
  | { t: 'num'; v: string; at: number }
  | { t: 'letter'; v: string; at: number }
  | { t: 'cmd'; v: string; at: number }
  | { t: 'op'; v: string; at: number }
  /** A word: `\operatorname{name}`, `\mathrm{name}`, `\text{name}`. */
  | { t: 'word'; v: string; at: number }
  /** The `d` of a differential: `\mathrm{d}`, `\differentialD`, `\partial`. */
  | { t: 'd'; at: number };

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'rho', 'varrho', 'sigma', 'varsigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]);

/** Functions written as commands (`\sin`), and their names for the translators. */
const FUNCS: Record<string, string> = {
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
  arcsin: 'asin', arccos: 'acos', arctan: 'atan', sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', coth: 'coth',
  ln: 'ln', log: 'ln', lg: 'log10', exp: 'exp', det: 'det', gcd: 'gcd', max: 'max', min: 'min', arg: 'arg',
  Re: 're', Im: 'im',
};

/** Words of `\operatorname{…}` understood as functions or operations. */
const WORDS: Record<string, string> = {
  ...FUNCS,
  sqrt: 'sqrt', abs: 'abs', lcm: 'lcm', ppcm: 'lcm', pgcd: 'gcd', arctg: 'atan', tg: 'tan', sh: 'sinh', ch: 'cosh', th: 'tanh',
  asin: 'asin', acos: 'acos', atan: 'atan', floor: 'floor', ceil: 'ceil', sign: 'sign', sgn: 'sign', conj: 'conjugate', re: 're', im: 'im',
};

const SPACES = new Set([',', ';', ':', '!', ' ', 'quad', 'qquad', 'enspace', 'thinspace', 'medspace', 'thickspace', 'displaystyle', 'textstyle', 'limits', 'nolimits']);
const SIZERS = new Set(['left', 'right', 'bigl', 'bigr', 'Bigl', 'Bigr', 'biggl', 'biggr', 'Biggl', 'Biggr', 'big', 'Big', 'bigg', 'Bigg', 'middle']);
const TIMES = new Set(['cdot', 'times', 'ast']);
const RELS: Record<string, Rel> = { le: '<=', leq: '<=', leqslant: '<=', ge: '>=', geq: '>=', geqslant: '>=', ne: '!=', neq: '!=', lt: '<', gt: '>' };
const ASSIGNS = new Set(['coloneq', 'coloneqq', 'definedas', 'triangleq']);

/** Read the braced text at `i` (`{name}`), as written. */
function braced(src: string, i: number): { text: string; end: number } | undefined {
  let j = i;
  while (src[j] === ' ') j++;
  if (src[j] !== '{') return undefined;
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return { text: src.slice(j + 1, k), end: k + 1 };
  }
  return undefined;
}

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c) || c === '~') {
      i++;
      continue;
    }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+|.)/.exec(src.slice(i));
      if (!m) throw new CasSyntaxError('\\ at the end', i);
      const name = m[1]!;
      const at = i;
      i += m[0].length;
      if (SPACES.has(name) || SIZERS.has(name)) {
        // `\left.` and `\right.`: no delimiter.
        if (SIZERS.has(name) && src[i] === '.') i++;
        continue;
      }
      if (name === 'operatorname' || name === 'mathrm' || name === 'text' || name === 'mathit' || name === 'textrm' || name === 'operatorname*') {
        const b = braced(src, i);
        if (!b) throw new CasSyntaxError(`{ expected after \\${name}`, i);
        i = b.end;
        const word = b.text.replace(/\\[,;: ]|\s/g, '');
        if (word === 'd') out.push({ t: 'd', at });
        else if (word === 'e') out.push({ t: 'letter', v: 'e', at });
        else if (word === 'i') out.push({ t: 'letter', v: 'i', at });
        else if (word.length === 1 && name !== 'operatorname') out.push({ t: 'letter', v: word, at });
        else if (word) out.push({ t: 'word', v: word, at });
        continue;
      }
      if (name === 'differentialD' || name === 'partial') out.push({ t: 'd', at });
      else if (name === 'exponentialE') out.push({ t: 'letter', v: 'e', at });
      else if (name === 'imaginaryI' || name === 'imaginaryJ') out.push({ t: 'letter', v: 'i', at });
      else if (name === '{' || name === '}') out.push({ t: 'op', v: name === '{' ? '(' : ')', at });
      else if (name === '|' || name === 'vert' || name === 'lvert' || name === 'rvert' || name === 'mid') out.push({ t: 'op', v: '|', at });
      else if (name === 'lbrack') out.push({ t: 'op', v: '[', at });
      else if (name === 'rbrack') out.push({ t: 'op', v: ']', at });
      else if (name === 'begin' || name === 'end') {
        const b = braced(src, i);
        if (!b) throw new CasSyntaxError(`{ expected after \\${name}`, i);
        i = b.end;
        out.push({ t: 'cmd', v: `${name}:${b.text}`, at });
      } else out.push({ t: 'cmd', v: name, at });
      continue;
    }
    if (/[0-9.]/.test(c)) {
      // A decimal comma is written `{,}` by MathLive.
      const m = /^(\d+(?:(?:\.|\{,\})\d+)?|\.\d+)/.exec(src.slice(i));
      if (!m) throw new CasSyntaxError(`unexpected ${c}`, i);
      out.push({ t: 'num', v: m[1]!.replace('{,}', '.'), at: i });
      i += m[0].length;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      out.push({ t: 'letter', v: c, at: i });
      i++;
      continue;
    }
    if (c === ':' && src[i + 1] === '=') {
      out.push({ t: 'op', v: ':=', at: i });
      i += 2;
      continue;
    }
    if ((c === '<' || c === '>' || c === '!') && src[i + 1] === '=') {
      out.push({ t: 'op', v: `${c}=`, at: i });
      i += 2;
      continue;
    }
    if (c === '*' && src[i + 1] === '*') {
      out.push({ t: 'op', v: '^', at: i });
      i += 2;
      continue;
    }
    if ('+-*/^_()[]{}=<>,!\'|&;'.includes(c)) {
      out.push({ t: 'op', v: c, at: i });
      i++;
      continue;
    }
    throw new CasSyntaxError(`unexpected ${c}`, i);
  }
  return out;
}

export interface ParseOptions {
  /** Names of functions of the user (`f` in `f(x)`), besides f, g and h. */
  functions?: Iterable<string>;
}

const USUAL_FUNCTIONS = ['f', 'g', 'h'];

class Parser {
  private i = 0;
  /** Inside `|…|`: a `|` closes. */
  private abs = 0;
  /** In the body of an integral: the variable once its differential is read. */
  private integral: { v?: string } | undefined;
  private readonly functions: Set<string>;

  constructor(
    private readonly toks: Tok[],
    private readonly src: string,
    functions: Iterable<string>,
  ) {
    this.functions = new Set([...USUAL_FUNCTIONS, ...functions]);
  }

  private peek(k = 0): Tok | undefined {
    return this.toks[this.i + k];
  }

  private at(): number {
    return this.peek()?.at ?? this.src.length;
  }

  private isOp(v: string, k = 0): boolean {
    const t = this.peek(k);
    return t?.t === 'op' && t.v === v;
  }

  private isCmd(v: string, k = 0): boolean {
    const t = this.peek(k);
    return t?.t === 'cmd' && t.v === v;
  }

  private expectOp(v: string): void {
    if (!this.isOp(v)) throw new CasSyntaxError(`${v} expected`, this.at());
    this.i++;
  }

  parse(): Expr {
    if (!this.toks.length) throw new CasSyntaxError('empty expression', 0);
    const e = this.list();
    if (this.i < this.toks.length) throw new CasSyntaxError(`unexpected ${this.describe(this.peek()!)}`, this.at());
    return e;
  }

  private describe(t: Tok): string {
    return t.t === 'd' ? 'd' : t.t === 'cmd' ? `\\${t.v}` : t.v;
  }

  private list(): Expr {
    const items = [this.assign()];
    while (this.isOp(',') || this.isOp(';')) {
      this.i++;
      items.push(this.assign());
    }
    return items.length === 1 ? items[0]! : { k: 'list', items };
  }

  private assign(): Expr {
    const left = this.relation();
    const t = this.peek();
    if ((t?.t === 'op' && t.v === ':=') || (t?.t === 'cmd' && ASSIGNS.has(t.v))) {
      this.i++;
      const value = this.relation();
      return { k: 'assign', target: this.target(left), value };
    }
    return left;
  }

  /** What `:=` defines: a name, or a function and its parameters (`F(x)` read as a product too). */
  private target(e: Expr): { k: 'sym'; name: string } | { k: 'call'; name: string; args: Expr[] } {
    if (e.k === 'sym') return e;
    if (e.k === 'call' && e.args.every((a) => a.k === 'sym')) return e;
    if (e.k === 'mul' && e.args.length === 2 && e.args[0]!.k === 'sym' && e.args[1]!.k === 'paren') {
      const inner = e.args[1].arg;
      const args = inner.k === 'list' ? inner.items : [inner];
      if (args.every((a) => a.k === 'sym')) return { k: 'call', name: e.args[0].name, args };
    }
    throw new CasSyntaxError('a name or a function of names is defined with :=', 0);
  }

  private relation(): Expr {
    let left = this.additive();
    for (;;) {
      const t = this.peek();
      let op: Rel | undefined;
      if (t?.t === 'op' && ['=', '<', '>', '<=', '>=', '!='].includes(t.v)) op = t.v as Rel;
      else if (t?.t === 'cmd' && RELS[t.v]) op = RELS[t.v];
      if (!op) return left;
      this.i++;
      const right = this.additive();
      left = { k: 'rel', op, left, right };
    }
  }

  private additive(): Expr {
    const args: Expr[] = [];
    let sign = 1;
    while (this.isOp('+') || this.isOp('-')) {
      if (this.isOp('-')) sign = -sign;
      this.i++;
    }
    const first = this.term();
    args.push(sign < 0 ? { k: 'neg', arg: first } : first);
    while (!this.integral?.v && (this.isOp('+') || this.isOp('-') || this.isCmd('pm'))) {
      const minus = this.isOp('-');
      this.i++;
      const t = this.term();
      args.push(minus ? { k: 'neg', arg: t } : t);
    }
    return args.length === 1 ? args[0]! : { k: 'add', args };
  }

  /** A product: explicit `\cdot`, `\times`, `*`, `/`, `\div`, or juxtaposition. */
  private term(): Expr {
    let e = this.unary();
    for (;;) {
      if (this.integral && !this.integral.v && this.differential()) break;
      if (this.integral?.v) break;
      const t = this.peek();
      if (!t) break;
      if ((t.t === 'op' && t.v === '*') || (t.t === 'cmd' && TIMES.has(t.v))) {
        this.i++;
        e = mul(e, this.unary());
      } else if ((t.t === 'op' && t.v === '/') || (t.t === 'cmd' && t.v === 'div')) {
        this.i++;
        e = { k: 'div', num: e, den: this.unary() };
      } else if (this.startsFactor()) e = mul(e, this.power());
      else break;
    }
    return e;
  }

  /** At `dx` closing an integral: reads it. */
  private differential(): boolean {
    const t = this.peek();
    const next = this.peek(1);
    const isD = t?.t === 'd' || (t?.t === 'letter' && t.v === 'd');
    if (!isD || !next) return false;
    const v = next.t === 'letter' ? next.v : next.t === 'cmd' && GREEK.has(next.v) ? next.v : undefined;
    if (!v) return false;
    this.i += 2;
    this.integral!.v = v;
    return true;
  }

  private unary(): Expr {
    if (this.isOp('-')) {
      this.i++;
      return { k: 'neg', arg: this.unary() };
    }
    if (this.isOp('+')) {
      this.i++;
      return this.unary();
    }
    return this.power();
  }

  private startsFactor(): boolean {
    const t = this.peek();
    if (!t) return false;
    if (t.t === 'num' || t.t === 'letter' || t.t === 'word' || t.t === 'd') return true;
    if (t.t === 'op') return t.v === '(' || t.v === '[' || t.v === '{' || (t.v === '|' && this.abs === 0);
    return t.v === 'frac' || t.v === 'dfrac' || t.v === 'tfrac' || t.v === 'sqrt' || t.v === 'binom' || t.v === 'pi' || t.v === 'infty' || t.v === 'int' || t.v === 'sum' || t.v === 'prod' || t.v === 'lim' || GREEK.has(t.v) || !!FUNCS[t.v] || t.v.startsWith('begin:');
  }

  private power(): Expr {
    let base = this.postfix(this.primary());
    if (this.isOp('^')) {
      this.i++;
      const exp = this.script();
      base = this.postfix({ k: 'pow', base, exp });
    }
    return base;
  }

  /** Factorials and primes after a factor. */
  private postfix(e: Expr): Expr {
    let out = e;
    while (this.isOp('!')) {
      this.i++;
      out = { k: 'fact', arg: out };
    }
    return out;
  }

  /** The argument of `^` or `_`: a braced group, or one token. */
  private script(): Expr {
    // 0^+ and 0^{-}: the side of a limit, read by the limit.
    for (const side of ['+', '-']) {
      if (this.isOp('{') && this.isOp(side, 1) && this.isOp('}', 2)) {
        this.i += 3;
        return { k: 'sym', name: side };
      }
      if (this.isOp(side) && (!this.peek(1) || this.isOp('}', 1))) {
        this.i++;
        return { k: 'sym', name: side };
      }
    }
    if (this.isOp('{')) {
      this.i++;
      const e = this.list();
      this.expectOp('}');
      return e;
    }
    const t = this.peek();
    if (!t) throw new CasSyntaxError('missing exponent', this.at());
    if (t.t === 'num') {
      // `x^23` is x^2·3 in TeX, but a math field writes `x^{23}`: one digit is taken.
      this.i++;
      if (t.v.length > 1 && /^\d+$/.test(t.v)) {
        this.toks.splice(this.i, 0, { t: 'num', v: t.v.slice(1), at: t.at + 1 });
        return { k: 'num', v: t.v[0]! };
      }
      return { k: 'num', v: t.v };
    }
    if (t.t === 'op' && t.v === '-') {
      this.i++;
      return { k: 'neg', arg: this.script() };
    }
    return this.primary();
  }

  /** The text of a subscript, for a name (`x_1`, `v_{max}`). */
  private subscriptName(): string {
    if (!this.isOp('_')) return '';
    this.i++;
    const parts: string[] = [];
    const take = (t: Tok): void => void parts.push(t.t === 'd' ? 'd' : t.t === 'cmd' ? t.v : t.v);
    if (this.isOp('{')) {
      this.i++;
      while (this.peek() && !this.isOp('}')) take(this.toks[this.i++]!);
      this.expectOp('}');
    } else {
      const t = this.peek();
      if (!t) throw new CasSyntaxError('missing subscript', this.at());
      this.i++;
      take(t);
    }
    const name = parts.join('').replace(/[^\w]/g, '');
    if (!name) throw new CasSyntaxError('empty subscript', this.at());
    return `_${name}`;
  }

  private group(close: string): Expr {
    const saved = this.abs;
    this.abs = 0;
    const savedIntegral = this.integral;
    this.integral = undefined;
    const e = this.list();
    this.abs = saved;
    this.integral = savedIntegral;
    this.expectOp(close);
    return e;
  }

  private primary(): Expr {
    const t = this.peek();
    if (!t) throw new CasSyntaxError('missing operand', this.at());
    this.i++;
    switch (t.t) {
      case 'num':
        return { k: 'num', v: t.v };
      case 'd':
        // A `d` outside an integral or a derivative: the letter.
        return this.symbol('d');
      case 'letter':
        return this.symbol(t.v);
      case 'word': {
        const name = WORDS[t.v] ?? t.v;
        return this.applyFunction(name, !!WORDS[t.v] || !/^[a-zA-Z]\w*$/.test(t.v) ? false : true);
      }
      case 'op':
        if (t.v === '(') return { k: 'paren', arg: this.group(')') };
        if (t.v === '[') return { k: 'paren', arg: this.group(']') };
        if (t.v === '{') return this.group('}');
        if (t.v === '|') {
          this.abs++;
          const arg = this.additive();
          this.abs--;
          this.expectOp('|');
          return { k: 'abs', arg };
        }
        throw new CasSyntaxError(`unexpected ${t.v}`, t.at);
      case 'cmd':
        return this.command(t);
    }
  }

  /** A letter or a Greek letter, with its subscript; a call when it names a function. */
  private symbol(letter: string): Expr {
    const name = letter + this.subscriptName();
    // f'(x), f''(x): derivatives of a function of the user.
    let primes = 0;
    while (this.isOp("'")) {
      this.i++;
      primes++;
    }
    if (this.functions.has(name) && this.isOp('(')) {
      this.i++;
      const inner = this.group(')');
      const args = inner.k === 'list' ? inner.items : [inner];
      const call: Expr = { k: 'call', name, args };
      if (!primes) return call;
      const v = args[0]?.k === 'sym' ? args[0].name : 'x';
      return { k: 'diff', body: call, v, n: primes };
    }
    if (primes) throw new CasSyntaxError(`${name}' is the derivative of a function: write ${name}'(x)`, this.at());
    return { k: 'sym', name };
  }

  /** `\sin x`, `\sin^2 x`, `\log_2 x`, `\operatorname{solve}(…)`. */
  private applyFunction(name: string, operation: boolean): Expr {
    let exp: Expr | undefined;
    let base: Expr | undefined;
    for (;;) {
      if (this.isOp('^')) {
        this.i++;
        exp = this.script();
      } else if (this.isOp('_')) {
        this.i++;
        base = this.script();
      } else break;
    }
    let args: Expr[];
    if (this.isOp('(')) {
      this.i++;
      const inner = this.group(')');
      args = inner.k === 'list' ? inner.items : [inner];
    } else if (operation) throw new CasSyntaxError(`( expected after ${name}`, this.at());
    else args = [this.functionArgument()];
    if (base && name === 'ln') args = [args[0]!, base];
    let e: Expr = { k: 'fn', name: base && name === 'ln' ? 'log' : name, args };
    // sin^{-1} x is arcsin x.
    if (exp && exp.k === 'neg' && exp.arg.k === 'num' && exp.arg.v === '1' && INVERSES[name]) e = { k: 'fn', name: INVERSES[name], args };
    else if (exp) e = { k: 'pow', base: e, exp };
    return e;
  }

  /** The argument of `\sin` without parentheses: a product of numbers, symbols and powers (`\sin 2x`). */
  private functionArgument(): Expr {
    let e = this.power();
    for (;;) {
      const t = this.peek();
      if (!t || this.integral?.v) break;
      if (this.integral && this.differential()) break;
      if (t.t === 'num' || t.t === 'letter' || (t.t === 'cmd' && (GREEK.has(t.v) || t.v === 'pi'))) e = mul(e, this.power());
      else break;
    }
    return e;
  }

  private command(t: Extract<Tok, { t: 'cmd' }>): Expr {
    const v = t.v;
    if (v === 'pi') return { k: 'const', name: 'pi' };
    if (v === 'infty') return { k: 'const', name: 'oo' };
    if (GREEK.has(v)) return this.symbol(v);
    if (FUNCS[v]) return this.applyFunction(FUNCS[v], false);
    if (v === 'frac' || v === 'dfrac' || v === 'tfrac') return this.fraction();
    if (v === 'sqrt') {
      let index: Expr | undefined;
      if (this.isOp('[')) {
        this.i++;
        index = this.group(']');
      }
      const arg = this.script();
      return index ? { k: 'fn', name: 'root', args: [arg, index] } : { k: 'fn', name: 'sqrt', args: [arg] };
    }
    if (v === 'binom') {
      const n = this.script();
      const k = this.script();
      return { k: 'fn', name: 'binomial', args: [n, k] };
    }
    if (v === 'int') return this.integralOf();
    if (v === 'sum' || v === 'prod') return this.bigOperator(v);
    if (v === 'lim') return this.limit();
    if (v.startsWith('begin:')) return this.matrix(v.slice('begin:'.length));
    throw new CasSyntaxError(`\\${v} is not understood`, t.at);
  }

  private fraction(): Expr {
    // d/dx, d^2/dx^2: a derivative of what follows.
    const derivative = this.derivativeOperator();
    if (derivative) {
      const body = this.isOp('(') ? this.power() : this.term();
      return { k: 'diff', body, v: derivative.v, n: derivative.n };
    }
    const num = this.script();
    const den = this.script();
    return { k: 'div', num, den };
  }

  /** `{d}{dx}`, `{d^2}{dx^2}`, `{\partial}{\partial x}`, `{dy}{dx}`: the variable and the order. */
  private derivativeOperator(): { v: string; n: number } | undefined {
    const start = this.i;
    const isD = (t: Tok | undefined): boolean => t?.t === 'd' || (t?.t === 'letter' && t.v === 'd');
    const order = (): number => {
      if (!this.isOp('^')) return 1;
      this.i++;
      const braced = this.isOp('{');
      if (braced) this.i++;
      const t = this.peek();
      if (t?.t !== 'num') return 0;
      this.i++;
      if (braced) {
        if (!this.isOp('}')) return 0;
        this.i++;
      }
      return Number(t.v);
    };
    const fail = (): undefined => {
      this.i = start;
      return undefined;
    };
    if (!this.isOp('{')) return fail();
    this.i++;
    if (!isD(this.peek())) return fail();
    this.i++;
    const n = order();
    let fnName: string | undefined;
    if (this.peek()?.t === 'letter' && !this.isOp('}')) {
      // dy/dx: the derivative of y, a function.
      fnName = (this.peek() as { v: string }).v;
      this.i++;
    }
    if (!this.isOp('}') || !n) return fail();
    this.i++;
    if (!this.isOp('{')) return fail();
    this.i++;
    if (!isD(this.peek())) return fail();
    this.i++;
    const vt = this.peek();
    const v = vt?.t === 'letter' ? vt.v : vt?.t === 'cmd' && GREEK.has(vt.v) ? vt.v : undefined;
    if (!v) return fail();
    this.i++;
    const m = order();
    if (m !== n || !this.isOp('}')) return fail();
    this.i++;
    if (fnName) {
      // Put back `y(x)` as what follows.
      this.toks.splice(this.i, 0, { t: 'op', v: '(', at: vt!.at }, { t: 'letter', v: fnName, at: vt!.at }, { t: 'op', v: '(', at: vt!.at }, { t: 'letter', v, at: vt!.at }, { t: 'op', v: ')', at: vt!.at }, { t: 'op', v: ')', at: vt!.at });
      this.functions.add(fnName);
    }
    return { v, n };
  }

  private integralOf(): Expr {
    let from: Expr | undefined;
    let to: Expr | undefined;
    for (;;) {
      if (this.isOp('_')) {
        this.i++;
        from = this.script();
      } else if (this.isOp('^')) {
        this.i++;
        to = this.script();
      } else break;
    }
    const saved = this.integral;
    const state: { v?: string } = {};
    this.integral = state;
    const body = this.additive();
    this.integral = saved;
    if (!state.v) throw new CasSyntaxError('the variable of the integral is missing: end it with dx', this.at());
    return { k: 'int', body, v: state.v, ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }

  private bigOperator(kind: 'sum' | 'prod'): Expr {
    let lower: Expr | undefined;
    let upper: Expr | undefined;
    for (;;) {
      if (this.isOp('_')) {
        this.i++;
        lower = this.script();
      } else if (this.isOp('^')) {
        this.i++;
        upper = this.script();
      } else break;
    }
    if (!lower || lower.k !== 'rel' || lower.op !== '=' || lower.left.k !== 'sym' || !upper) throw new CasSyntaxError(`write the bounds of the ${kind === 'sum' ? 'sum' : 'product'}: _{n=1}^{N}`, this.at());
    const body = this.term();
    return { k: kind, body, v: lower.left.name, from: lower.right, to: upper };
  }

  private limit(): Expr {
    if (!this.isOp('_')) throw new CasSyntaxError('write the limit as \\lim_{x\\to a}', this.at());
    this.i++;
    const close = this.isOp('{');
    if (close) this.i++;
    const vt = this.peek();
    const v = vt?.t === 'letter' ? vt.v : vt?.t === 'cmd' && GREEK.has(vt.v) ? vt.v : undefined;
    if (!v) throw new CasSyntaxError('the variable of the limit is missing', this.at());
    this.i++;
    const arrow = this.peek();
    if (!(arrow?.t === 'cmd' && ['to', 'rightarrow', 'longrightarrow'].includes(arrow.v))) throw new CasSyntaxError('\\to expected in the limit', this.at());
    this.i++;
    let dir: '+' | '-' | undefined;
    let to = this.additive();
    // 0^+, 0^-: from one side.
    if (to.k === 'pow' && to.exp.k === 'sym' && (to.exp.name === '+' || to.exp.name === '-')) {
      dir = to.exp.name;
      to = to.base;
    }
    if (close) this.expectOp('}');
    const body = this.isOp('(') ? this.power() : this.term();
    return { k: 'lim', body, v, to, ...(dir ? { dir } : {}) };
  }

  private matrix(env: string): Expr {
    if (!/^(p|b|B|v|V|small)?matrix\*?$|^array$/.test(env)) throw new CasSyntaxError(`\\begin{${env}} is not understood`, this.at());
    // The column specification of an array.
    if (env === 'array' && this.isOp('{')) {
      while (this.peek() && !this.isOp('}')) this.i++;
      this.i++;
    }
    const rows: Expr[][] = [[]];
    for (;;) {
      const t = this.peek();
      if (!t) throw new CasSyntaxError(`\\end{${env}} expected`, this.at());
      if (t.t === 'cmd' && t.v === `end:${env}`) {
        this.i++;
        break;
      }
      if (t.t === 'op' && t.v === '&') {
        this.i++;
        continue;
      }
      if (t.t === 'cmd' && t.v === '\\') {
        this.i++;
        rows.push([]);
        continue;
      }
      rows[rows.length - 1]!.push(this.relation());
    }
    const full = rows.filter((r) => r.length);
    if (!full.length || full.some((r) => r.length !== full[0]!.length)) throw new CasSyntaxError('the rows of the matrix have different lengths', this.at());
    return env.startsWith('v') ? { k: 'fn', name: 'det', args: [{ k: 'matrix', rows: full }] } : { k: 'matrix', rows: full };
  }
}

const INVERSES: Record<string, string> = { sin: 'asin', cos: 'acos', tan: 'atan', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh' };

function mul(a: Expr, b: Expr): Expr {
  return a.k === 'mul' ? { k: 'mul', args: [...a.args, b] } : { k: 'mul', args: [a, b] };
}

/** Read the LaTeX of a math field. */
export function parseLatex(src: string, opts: ParseOptions = {}): Expr {
  return new Parser(tokenize(src), src, opts.functions ?? []).parse();
}

export interface MathDeps {
  /** Names the cell defines (`a := …`, `f(x) := …`). */
  defs: string[];
  /** Names it uses that are not bound in it (integration variables, parameters…), sorted. */
  refs: string[];
  /** Functions it defines. */
  functions: string[];
}

/** CAS-004: what a cell defines and uses. `e` and `i` are the constants unless bound. */
export function mathDeps(e: Expr): MathDeps {
  const refs = new Set<string>();
  const walk = (x: Expr, bound: Set<string>): void => {
    const sub = (y: Expr, extra?: string | string[]): void => walk(y, extra ? new Set([...bound, ...(Array.isArray(extra) ? extra : [extra])]) : bound);
    switch (x.k) {
      case 'num':
      case 'const':
        return;
      case 'sym':
        if (!bound.has(x.name) && x.name !== 'e' && x.name !== 'i') refs.add(x.name);
        return;
      case 'add':
      case 'mul':
        x.args.forEach((a) => sub(a));
        return;
      case 'neg':
      case 'paren':
      case 'fact':
      case 'abs':
        sub(x.arg);
        return;
      case 'div':
        sub(x.num);
        sub(x.den);
        return;
      case 'pow':
        sub(x.base);
        sub(x.exp);
        return;
      case 'fn':
        if (x.name === 'solve' || x.name === 'series' || x.name === 'diff' || x.name === 'integrate' || x.name === 'limit') {
          const vars = x.args.slice(1).filter((a): a is { k: 'sym'; name: string } => a.k === 'sym').map((a) => a.name);
          x.args.forEach((a, i) => (i === 0 ? sub(a, vars) : a.k === 'sym' ? undefined : sub(a)));
        } else x.args.forEach((a) => sub(a));
        return;
      case 'call':
        if (!bound.has(x.name)) refs.add(x.name);
        x.args.forEach((a) => sub(a));
        return;
      case 'int':
        sub(x.body, x.v);
        if (x.from) sub(x.from);
        if (x.to) sub(x.to);
        return;
      case 'sum':
      case 'prod':
        sub(x.body, x.v);
        sub(x.from);
        sub(x.to);
        return;
      case 'lim':
        sub(x.body, x.v);
        sub(x.to);
        return;
      case 'diff':
        sub(x.body, x.v);
        return;
      case 'rel':
        sub(x.left);
        sub(x.right);
        return;
      case 'assign':
        sub(x.value, x.target.k === 'call' ? x.target.args.map((a) => (a as { name: string }).name) : undefined);
        return;
      case 'list':
        x.items.forEach((a) => sub(a));
        return;
      case 'matrix':
        x.rows.flat().forEach((a) => sub(a));
        return;
    }
  };
  walk(e, new Set());
  const defs = e.k === 'assign' ? [e.target.name] : [];
  for (const d of defs) refs.delete(d);
  return { defs, refs: [...refs].sort(), functions: e.k === 'assign' && e.target.k === 'call' ? [e.target.name] : [] };
}
