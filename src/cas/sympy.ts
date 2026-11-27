/**
 * CAS-001, CAS-002: a math cell in the language of SymPy, run by the Python
 * of the code cells (Pyodide). Numbers are exact (`Integer`, never Python's
 * integer division); the names of the math cells live in a namespace of
 * their own (`_pwo_cas`), apart from those of Python cells (CAS-004); each
 * result is printed as LaTeX after a marker.
 */
import { parseLatex, type Expr, type ParseOptions } from './latex';

/** Starts each line of a result. */
export const RESULT_MARK = '\x1e';

/** Defined before every math cell (cheap: kept by the interpreter). */
export const SYMPY_PRELUDE = [
  'import sympy as _sp',
  "_cas = globals().setdefault('_pwo_cas', {})",
  'def _v(n, d=None):',
  '    return _cas[n] if n in _cas else (_sp.Symbol(n) if d is None else d)',
  'def _f(n):',
  '    return _cas[n] if n in _cas else _sp.Function(n)',
  'def _show(r):',
  '    if hasattr(r, "doit") and not isinstance(r, _sp.Lambda):',
  '        r = r.doit()',
  `    print(${JSON.stringify(RESULT_MARK)} + _sp.latex(r))`,
].join('\n');

const py = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const symbol = (name: string): string => `_sp.Symbol(${py(name)})`;

/** Functions of SymPy by the names of the reader. */
const FUNCTIONS: Record<string, string> = {
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc', asin: 'asin', acos: 'acos', atan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh', coth: 'coth', asinh: 'asinh', acosh: 'acosh', atanh: 'atanh',
  exp: 'exp', sqrt: 'sqrt', ln: 'log', log: 'log', floor: 'floor', ceil: 'ceiling', sign: 'sign', conjugate: 'conjugate',
  re: 're', im: 'im', arg: 'arg', det: 'det', gcd: 'gcd', lcm: 'lcm', binomial: 'binomial', max: 'Max', min: 'Min', abs: 'Abs',
  simplify: 'simplify', expand: 'expand', factor: 'factor', N: 'N', numeric: 'N',
};

const RELATIONS = { '=': 'Eq', '<': 'Lt', '>': 'Gt', '<=': 'Le', '>=': 'Ge', '!=': 'Ne' } as const;

function emit(e: Expr, bound: ReadonlySet<string>): string {
  const sub = (x: Expr, extra?: string[]): string => emit(x, extra ? new Set([...bound, ...extra]) : bound);
  const p = (x: Expr): string => `(${sub(x)})`;
  switch (e.k) {
    case 'num':
      return /^\d+$/.test(e.v) ? `_sp.Integer(${e.v})` : `_sp.Float(${py(e.v)})`;
    case 'sym':
      if (bound.has(e.name)) return symbol(e.name);
      if (e.name === 'e') return `_v('e', _sp.E)`;
      if (e.name === 'i') return `_v('i', _sp.I)`;
      return `_v(${py(e.name)})`;
    case 'const':
      return e.name === 'pi' ? '_sp.pi' : '_sp.oo';
    case 'add':
      return `(${e.args.map(p).join(' + ')})`;
    case 'neg':
      return `(-${p(e.arg)})`;
    case 'mul':
      return `(${e.args.map(p).join('*')})`;
    case 'div':
      return `(${p(e.num)}/${p(e.den)})`;
    case 'pow':
      return `(${p(e.base)}**${p(e.exp)})`;
    case 'paren':
      return e.arg.k === 'list' ? `_sp.Tuple(${e.arg.items.map((x) => sub(x)).join(', ')})` : sub(e.arg);
    case 'fact':
      return `_sp.factorial(${sub(e.arg)})`;
    case 'abs':
      return `_sp.Abs(${sub(e.arg)})`;
    case 'fn':
      return fn(e.name, e.args, bound);
    case 'call':
      return `_f(${py(e.name)})(${e.args.map((x) => sub(x)).join(', ')})`;
    case 'int': {
      const body = sub(e.body, [e.v]);
      return e.from && e.to ? `_sp.integrate(${body}, (${symbol(e.v)}, ${sub(e.from)}, ${sub(e.to)}))` : `_sp.integrate(${body}, ${symbol(e.v)})`;
    }
    case 'sum':
    case 'prod':
      return `_sp.${e.k === 'sum' ? 'summation' : 'product'}(${sub(e.body, [e.v])}, (${symbol(e.v)}, ${sub(e.from)}, ${sub(e.to)}))`;
    case 'lim':
      return `_sp.limit(${sub(e.body, [e.v])}, ${symbol(e.v)}, ${sub(e.to)}, ${py(e.dir ?? '+-')})`;
    case 'diff':
      return `_sp.diff(${sub(e.body, [e.v])}, ${symbol(e.v)}, ${e.n})`;
    case 'rel':
      return `_sp.${RELATIONS[e.op]}(${sub(e.left)}, ${sub(e.right)})`;
    case 'list':
      return `[${e.items.map((x) => sub(x)).join(', ')}]`;
    case 'matrix':
      return `_sp.Matrix([${e.rows.map((r) => `[${r.map((x) => sub(x)).join(', ')}]`).join(', ')}])`;
    case 'assign':
      throw new Error('a definition inside an expression');
  }
}

/** The variables given to an operation (`solve(…, x)`): symbols, never replaced by a value. */
const variables = (args: Expr[]): string[] => args.filter((a): a is { k: 'sym'; name: string } => a.k === 'sym').map((a) => a.name);

function fn(name: string, args: Expr[], bound: ReadonlySet<string>): string {
  const sub = (x: Expr, extra?: string[]): string => emit(x, extra ? new Set([...bound, ...extra]) : bound);
  const [first, ...rest] = args;
  switch (name) {
    case 'log':
      return `_sp.log(${sub(first!)}, ${sub(args[1]!)})`;
    case 'log10':
      return `_sp.log(${sub(first!)}, 10)`;
    case 'root':
      return `_sp.root(${sub(first!)}, ${sub(args[1]!)})`;
    case 'solve': {
      const vars = variables(rest);
      const what = first?.k === 'list' ? `[${first.items.map((x) => sub(x, vars)).join(', ')}]` : sub(first!, vars);
      return vars.length ? `_sp.solve(${what}, ${vars.length === 1 ? symbol(vars[0]!) : `[${vars.map(symbol).join(', ')}]`})` : `_sp.solve(${what})`;
    }
    case 'series': {
      const [v, at, n] = rest;
      const vars = v?.k === 'sym' ? [v.name] : [];
      return `_sp.series(${sub(first!, vars)}${v ? `, ${symbol(vars[0] ?? 'x')}` : ''}${at ? `, ${sub(at)}` : ''}${n ? `, ${sub(n)}` : ''})`;
    }
    case 'diff':
    case 'integrate':
    case 'limit': {
      const vars = variables(rest.slice(0, 1));
      const v = vars[0] ? symbol(vars[0]) : `_sp.Symbol('x')`;
      const others = rest.slice(1).map((x) => sub(x));
      if (name === 'diff') return `_sp.diff(${sub(first!, vars)}, ${v}${others.length ? `, ${others[0]}` : ''})`;
      if (name === 'integrate') return others.length === 2 ? `_sp.integrate(${sub(first!, vars)}, (${v}, ${others[0]}, ${others[1]}))` : `_sp.integrate(${sub(first!, vars)}, ${v})`;
      return `_sp.limit(${sub(first!, vars)}, ${v}, ${others[0] ?? '0'})`;
    }
  }
  const known = FUNCTIONS[name];
  if (!known && !/^[a-zA-Z]\w*$/.test(name)) throw new Error(`unknown function ${name}`);
  return `_sp.${known ?? name}(${args.map((x) => sub(x)).join(', ')})`;
}

/** One statement: a definition kept in the namespace, or an expression shown. */
function statement(e: Expr): string {
  if (e.k === 'assign') {
    if (e.target.k === 'sym') {
      const name = py(e.target.name);
      return `_cas[${name}] = ${emit(e.value, new Set())}\n_show(_sp.Eq(${symbol(e.target.name)}, _cas[${name}], evaluate=False))`;
    }
    const params = e.target.args.map((a) => (a as { name: string }).name);
    const name = py(e.target.name);
    const syms = params.map(symbol).join(', ');
    return `_cas[${name}] = _sp.Lambda((${syms},), ${emit(e.value, new Set(params))})\n_show(_sp.Eq(_sp.Function(${name})(${syms}), _cas[${name}](${syms}), evaluate=False))`;
  }
  if (e.k === 'list' && e.items.some((x) => x.k === 'assign')) return e.items.map(statement).join('\n');
  return `_show(${emit(e, new Set())})`;
}

/** The Python of a math cell (to run after `SYMPY_PRELUDE`). Throws a `CasSyntaxError` when the LaTeX cannot be read. */
export function sympyCell(latex: string, opts: ParseOptions = {}): string {
  return statement(parseLatex(latex, opts));
}

/** The LaTeX of the results printed by a cell, and the rest of what it printed. */
export function readSympyOutput(text: string): { latex: string[]; text: string } {
  const latex: string[] = [];
  const rest: string[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith(RESULT_MARK)) latex.push(line.slice(RESULT_MARK.length).trim());
    else if (line.trim()) rest.push(line);
  }
  return { latex, text: rest.join('\n') };
}

/** The last line of a Python error: what went wrong, without the traceback. */
export function engineError(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? text;
}
