/**
 * NOTE-005: the expressions of `.base` files — read by a small tokenizer and
 * a precedence-climbing parser, evaluated on a note, never run as code. What
 * is not supported (an unknown function, method or field, a syntax error) is
 * reported as such (`Unsupported`), so that the view can say it instead of
 * silently leaving something out.
 */

export class Unsupported extends Error {
  constructor(readonly what: string) {
    super(what);
    this.name = 'Unsupported';
  }
}

// ---------------------------------------------------------------- values

/** A date (time in milliseconds), kept apart from numbers. */
export class DateValue {
  constructor(readonly ms: number) {}
  /** `2026-11-30`, with the time when it is not midnight. */
  toString(): string {
    const d = new Date(this.ms);
    const p = (n: number): string => String(n).padStart(2, '0');
    const day = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    return d.getHours() || d.getMinutes() || d.getSeconds() ? `${day} ${p(d.getHours())}:${p(d.getMinutes())}` : day;
  }
}

export type Value = string | number | boolean | null | DateValue | Value[] | FileValue;

/** The `file` of a note: its fields and methods. */
export interface FileValue {
  kind: 'file';
  name: string;
  basename: string;
  path: string;
  folder: string;
  ext: string;
  size: number | null;
  ctime: DateValue | null;
  mtime: DateValue | null;
  tags: string[];
  links: string[];
  properties: Set<string>;
}

const isFile = (v: Value): v is FileValue => typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof DateValue) && (v as FileValue).kind === 'file';

// ---------------------------------------------------------------- tokens

type Tok = { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string } | { t: 'op'; v: string };

const OPS = ['==', '!=', '>=', '<=', '&&', '||', '>', '<', '!', '+', '-', '*', '/', '%', '(', ')', '[', ']', ',', '.'];

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const m = /^\d*\.?\d+(?:[eE][-+]?\d+)?/.exec(src.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      for (; j < src.length && src[j] !== c; j++) {
        if (src[j] === '\\' && j + 1 < src.length) {
          j++;
          s += { n: '\n', t: '\t', r: '\r' }[src[j]!] ?? src[j];
        } else s += src[j];
      }
      if (j >= src.length) throw new Unsupported(`unterminated string in ${src}`);
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[\p{L}_$]/u.test(c)) {
      const m = /^[\p{L}\p{N}_$]+/u.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new Unsupported(`unexpected "${c}" in ${src}`);
    out.push({ t: 'op', v: op });
    i += op.length;
  }
  return out;
}

// ---------------------------------------------------------------- syntax

export type Expr =
  | { k: 'lit'; v: Value }
  | { k: 'list'; items: Expr[] }
  | { k: 'id'; name: string }
  | { k: 'member'; obj: Expr; name: string }
  | { k: 'index'; obj: Expr; index: Expr }
  | { k: 'call'; fn: Expr; args: Expr[] }
  | { k: 'unary'; op: string; arg: Expr }
  | { k: 'binary'; op: string; left: Expr; right: Expr };

const BINARY: Record<string, number> = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };

export function parseExpr(src: string): Expr {
  const toks = tokenize(src);
  let i = 0;
  const peek = (): Tok | undefined => toks[i];
  const isOp = (v: string): boolean => peek()?.t === 'op' && peek()!.v === v;
  const expect = (v: string): void => {
    if (!isOp(v)) throw new Unsupported(`expected "${v}" in ${src}`);
    i++;
  };
  const args = (close: string): Expr[] => {
    const out: Expr[] = [];
    if (isOp(close)) return i++, out;
    for (;;) {
      out.push(expr(0));
      if (isOp(',')) i++;
      else return expect(close), out;
    }
  };
  const primary = (): Expr => {
    const tok = toks[i++];
    if (!tok) throw new Unsupported(`unexpected end of ${src}`);
    if (tok.t === 'num') return { k: 'lit', v: tok.v };
    if (tok.t === 'str') return { k: 'lit', v: tok.v };
    if (tok.t === 'id') {
      if (tok.v === 'true' || tok.v === 'false') return { k: 'lit', v: tok.v === 'true' };
      if (tok.v === 'null') return { k: 'lit', v: null };
      return { k: 'id', name: tok.v };
    }
    if (tok.v === '(') {
      const e = expr(0);
      expect(')');
      return e;
    }
    if (tok.v === '[') return { k: 'list', items: args(']') };
    if (tok.v === '!' || tok.v === '-') return { k: 'unary', op: tok.v, arg: postfix(primary()) };
    throw new Unsupported(`unexpected "${tok.v}" in ${src}`);
  };
  const postfix = (e: Expr): Expr => {
    for (;;) {
      if (isOp('.')) {
        i++;
        const name = toks[i++];
        if (name?.t !== 'id') throw new Unsupported(`expected a name after "." in ${src}`);
        e = { k: 'member', obj: e, name: name.v };
      } else if (isOp('(')) {
        i++;
        e = { k: 'call', fn: e, args: args(')') };
      } else if (isOp('[')) {
        i++;
        const index = expr(0);
        expect(']');
        e = { k: 'index', obj: e, index };
      } else return e;
    }
  };
  const expr = (min: number): Expr => {
    let left = postfix(primary());
    for (;;) {
      const tok = peek();
      if (tok?.t !== 'op') return left;
      const prec = BINARY[tok.v];
      if (prec === undefined || prec < min) return left;
      i++;
      const right = expr(prec + 1);
      left = { k: 'binary', op: tok.v, left, right };
    }
  };
  const e = expr(0);
  if (i < toks.length) throw new Unsupported(`unexpected "${(toks[i] as { v: unknown }).v}" in ${src}`);
  return e;
}

// ---------------------------------------------------------------- evaluation

export interface NoteScope {
  file: FileValue;
  /** Property values by lower-case key: one value, or a list. */
  props: Map<string, Value>;
  /** Formula names to their expressions (source text). */
  formulas: Map<string, string>;
  now: number;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** A date written as text (`2026-11-30`, `2026-11-30T10:00`), else null. */
export function toDate(v: Value): DateValue | null {
  if (v instanceof DateValue) return v;
  if (typeof v !== 'string') return null;
  const m = DATE_RE.exec(v.trim());
  if (!m) return null;
  return new DateValue(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)).getTime());
}

const UNITS: Record<string, string> = {
  y: 'y', yr: 'y', yrs: 'y', year: 'y', years: 'y',
  M: 'M', mo: 'M', month: 'M', months: 'M',
  w: 'w', wk: 'w', wks: 'w', week: 'w', weeks: 'w',
  d: 'd', day: 'd', days: 'd',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  m: 'm', min: 'm', mins: 'm', minute: 'm', minutes: 'm',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's',
};

/** A duration written as text (`7d`, `-1 week`, `2 months 3 days`), as its parts; null when it is not one. */
export function parseDuration(s: string): [string, number][] | null {
  const parts: [string, number][] = [];
  const re = /\s*([-+]?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*/gy;
  let m: RegExpExecArray | null;
  let at = 0;
  const text = s.trim();
  if (!text) return null;
  while ((m = re.exec(text))) {
    const unit = UNITS[m[2]!] ?? UNITS[m[2]!.toLowerCase()];
    if (!unit || (m[2]!.length === 1 && m[2] !== m[2]!.toLowerCase() && m[2] !== 'M')) return null;
    parts.push([m[2] === 'M' ? 'M' : unit, Number(m[1])]);
    at = re.lastIndex;
  }
  return at === text.length && parts.length ? parts : null;
}

function addDuration(d: DateValue, parts: [string, number][], sign: number): DateValue {
  const t = new Date(d.ms);
  for (const [u, n] of parts) {
    const k = n * sign;
    if (u === 'y') t.setFullYear(t.getFullYear() + k);
    else if (u === 'M') t.setMonth(t.getMonth() + k);
    else if (u === 'w') t.setDate(t.getDate() + 7 * k);
    else if (u === 'd') t.setDate(t.getDate() + k);
    else if (u === 'h') t.setTime(t.getTime() + k * 3600e3);
    else if (u === 'm') t.setTime(t.getTime() + k * 60e3);
    else if (u === 's') t.setTime(t.getTime() + k * 1e3);
  }
  return new DateValue(t.getTime());
}

export function truthy(v: Value): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== false && v !== '' && v !== 0;
}

const num = (v: Value): number | null => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && /^\s*[-+]?(\d+(\.\d*)?|\.\d+)\s*$/.test(v)) return Number(v);
  return null;
};

/** `[[Ada Lovelace|Ada]]` → `ada lovelace`; other text lower-cased. */
const linkName = (v: string): string => v.replace(/^\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]$/, '$1').replace(/\.md$/i, '').trim().toLowerCase();

/** Order of two values; null when they cannot be compared. */
export function compareValues(a: Value, b: Value): number | null {
  if (a === null || b === null || isFile(a) || isFile(b)) return null;
  const da = toDate(a);
  const db = toDate(b);
  if (da && db) return da.ms - db.ms;
  const na = num(a);
  const nb = num(b);
  if (na !== null && nb !== null) return na - nb;
  if (Array.isArray(a) || Array.isArray(b)) return null;
  return linkName(String(a)).localeCompare(linkName(String(b)), undefined, { numeric: true });
}

export function equalValues(a: Value, b: Value): boolean {
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => equalValues(x, b[i]!));
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b) && (typeof a === typeof b || num(a) !== null || num(b) !== null);
  return compareValues(a, b) === 0;
}

/** Text of a value, as shown. */
export function show(v: Value): string {
  if (v === null) return '';
  if (Array.isArray(v)) return v.map(show).join(', ');
  if (isFile(v)) return v.path;
  return String(v);
}

const str = (v: Value): string => (v === null ? '' : show(v));

function stringMethod(s: string, name: string, args: Value[]): Value {
  switch (name) {
    case 'contains':
      return s.toLowerCase().includes(str(args[0] ?? '').toLowerCase());
    case 'startsWith':
      return s.toLowerCase().startsWith(str(args[0] ?? '').toLowerCase());
    case 'endsWith':
      return s.toLowerCase().endsWith(str(args[0] ?? '').toLowerCase());
    case 'lower':
      return s.toLowerCase();
    case 'upper':
      return s.toUpperCase();
    case 'isEmpty':
      return s.length === 0;
    case 'trim':
      return s.trim();
  }
  throw new Unsupported(`text method ${name}()`);
}

function listMethod(l: Value[], name: string, args: Value[]): Value {
  switch (name) {
    case 'contains':
      return l.some((x) => equalValues(x, args[0] ?? null) || (typeof x === 'string' && typeof args[0] === 'string' && linkName(x) === linkName(args[0])));
    case 'isEmpty':
      return l.length === 0;
  }
  throw new Unsupported(`list method ${name}()`);
}

const tagMatch = (tags: string[], want: string): boolean => {
  const w = want.replace(/^#/, '').toLowerCase();
  return tags.some((t) => {
    const x = t.replace(/^#/, '').toLowerCase();
    return x === w || x.startsWith(`${w}/`);
  });
};

function fileMethod(f: FileValue, name: string, args: Value[]): Value {
  const texts = args.flatMap((a) => (Array.isArray(a) ? a : [a])).map(str);
  switch (name) {
    case 'hasTag':
      return texts.some((t) => tagMatch(f.tags, t));
    case 'inFolder':
      return texts.some((t) => {
        const d = t.replace(/^\/+|\/+$/g, '').toLowerCase();
        const folder = f.folder.toLowerCase();
        return d === '' || folder === d || folder.startsWith(`${d}/`);
      });
    case 'hasLink':
      return texts.some((t) => {
        const want = linkName(t);
        return f.links.some((l) => {
          const x = l.replace(/\.md$/i, '').toLowerCase();
          return x === want || x.split('/').pop() === want.split('/').pop();
        });
      });
    case 'hasProperty':
      return texts.some((t) => f.properties.has(t.toLowerCase()));
  }
  throw new Unsupported(`file.${name}()`);
}

function fileField(f: FileValue, name: string): Value {
  switch (name) {
    case 'name':
    case 'basename':
    case 'path':
    case 'folder':
    case 'ext':
    case 'size':
    case 'ctime':
    case 'mtime':
      return f[name];
    case 'tags':
      return f.tags;
    case 'links':
      return f.links;
  }
  throw new Unsupported(`file.${name}`);
}

/** A property of the note, `null` when it has none. */
const prop = (scope: NoteScope, key: string): Value => scope.props.get(key.toLowerCase()) ?? null;

export function evaluate(e: Expr, scope: NoteScope, stack: string[] = []): Value {
  const ev = (x: Expr): Value => evaluate(x, scope, stack);
  switch (e.k) {
    case 'lit':
      return e.v;
    case 'list':
      return e.items.map(ev);
    case 'id':
      if (e.name === 'file') return scope.file;
      if (e.name === 'note' || e.name === 'formula' || e.name === 'this') throw new Unsupported(e.name === 'this' ? 'this' : `${e.name} alone`);
      return prop(scope, e.name);
    case 'member': {
      if (e.obj.k === 'id' && e.obj.name === 'note') return prop(scope, e.name);
      if (e.obj.k === 'id' && e.obj.name === 'formula') return formulaValue(e.name, scope, stack);
      if (e.obj.k === 'id' && e.obj.name === 'this') throw new Unsupported('this');
      const obj = ev(e.obj);
      if (isFile(obj)) return fileField(obj, e.name);
      if (e.name === 'length') {
        if (typeof obj === 'string' || Array.isArray(obj)) return obj.length;
        if (obj === null) return 0;
      }
      if (obj instanceof DateValue) {
        const d = new Date(obj.ms);
        const parts: Record<string, number> = { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds() };
        if (e.name in parts) return parts[e.name]!;
      }
      throw new Unsupported(`.${e.name}`);
    }
    case 'index': {
      if (e.obj.k === 'id' && (e.obj.name === 'note' || e.obj.name === 'formula')) {
        const key = str(ev(e.index));
        return e.obj.name === 'note' ? prop(scope, key) : formulaValue(key, scope, stack);
      }
      const obj = ev(e.obj);
      const i = num(ev(e.index));
      if (Array.isArray(obj) && i !== null) return obj[i < 0 ? obj.length + i : i] ?? null;
      if (typeof obj === 'string' && i !== null) return obj[i] ?? null;
      throw new Unsupported('[ ] on this value');
    }
    case 'unary': {
      const v = ev(e.arg);
      if (e.op === '!') return !truthy(v);
      const n = num(v);
      return n === null ? null : -n;
    }
    case 'binary':
      return binary(e.op, e.left, e.right, ev);
    case 'call':
      return call(e, scope, ev);
  }
}

function binary(op: string, l: Expr, r: Expr, ev: (x: Expr) => Value): Value {
  if (op === '&&') return truthy(ev(l)) ? truthy(ev(r)) : false;
  if (op === '||') return truthy(ev(l)) ? true : truthy(ev(r));
  const a = ev(l);
  const b = ev(r);
  switch (op) {
    case '==':
      return equalValues(a, b);
    case '!=':
      return !equalValues(a, b);
    case '<':
    case '<=':
    case '>':
    case '>=': {
      const c = compareValues(a, b);
      if (c === null) return false;
      return op === '<' ? c < 0 : op === '<=' ? c <= 0 : op === '>' ? c > 0 : c >= 0;
    }
    case '+':
    case '-': {
      const sign = op === '+' ? 1 : -1;
      const da = toDate(a);
      if (da && typeof b === 'string') {
        const parts = parseDuration(b);
        if (parts) return addDuration(da, parts, sign);
      }
      if (da && typeof b === 'number') return new DateValue(da.ms + sign * b);
      if (op === '-' && da) {
        const db = toDate(b);
        if (db) return da.ms - db.ms;
      }
      if (op === '+' && (typeof a === 'string' || typeof b === 'string') && (num(a) === null || num(b) === null)) return `${str(a)}${str(b)}`;
      if (op === '+' && Array.isArray(a)) return [...a, ...(Array.isArray(b) ? b : [b])];
      const x = num(a);
      const y = num(b);
      return x === null || y === null ? null : x + sign * y;
    }
    case '*':
    case '/':
    case '%': {
      const x = num(a);
      const y = num(b);
      if (x === null || y === null) return null;
      if (op === '*') return x * y;
      if (y === 0) return null;
      return op === '/' ? x / y : x % y;
    }
  }
  throw new Unsupported(`operator ${op}`);
}

const midnight = (ms: number): number => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

function call(e: Extract<Expr, { k: 'call' }>, scope: NoteScope, ev: (x: Expr) => Value): Value {
  const fn = e.fn;
  if (fn.k === 'id') {
    switch (fn.name) {
      case 'if':
        if (e.args.length < 2) throw new Unsupported('if() with fewer than two arguments');
        return truthy(ev(e.args[0]!)) ? ev(e.args[1]!) : e.args[2] ? ev(e.args[2]) : null;
      case 'now':
        return new DateValue(scope.now);
      case 'today':
        return new DateValue(midnight(scope.now));
      case 'date': {
        const v = ev(e.args[0] ?? { k: 'lit', v: null });
        return toDate(v);
      }
      case 'number': {
        const v = ev(e.args[0] ?? { k: 'lit', v: null });
        if (v instanceof DateValue) return v.ms;
        return num(v) ?? (typeof v === 'string' ? (Number.isFinite(parseFloat(v)) ? parseFloat(v) : null) : null);
      }
      case 'link': {
        const target = str(ev(e.args[0] ?? { k: 'lit', v: '' }));
        const display = e.args[1] ? str(ev(e.args[1])) : '';
        return `[[${target.replace(/\.md$/i, '')}${display ? `|${display}` : ''}]]`;
      }
      case 'min':
      case 'max': {
        const vs = e.args.map(ev).flatMap((v) => (Array.isArray(v) ? v : [v])).filter((v) => v !== null);
        if (!vs.length) return null;
        return vs.reduce((m, v) => ((compareValues(v, m) ?? 0) * (fn.name === 'min' ? -1 : 1) > 0 ? v : m));
      }
    }
    throw new Unsupported(`${fn.name}()`);
  }
  if (fn.k === 'member') {
    const args = e.args.map(ev);
    const obj = fn.obj.k === 'id' && fn.obj.name === 'note' ? prop(scope, fn.name) : ev(fn.obj);
    if (isFile(obj)) return fileMethod(obj, fn.name, args);
    if (typeof obj === 'string') return stringMethod(obj, fn.name, args);
    if (Array.isArray(obj)) return listMethod(obj, fn.name, args);
    if (obj === null) {
      if (fn.name === 'isEmpty') return true;
      if (['contains', 'startsWith', 'endsWith'].includes(fn.name)) return false;
      if (['lower', 'upper', 'trim'].includes(fn.name)) return null;
    }
    if (typeof obj === 'number') return stringMethod(String(obj), fn.name, args);
    if (obj instanceof DateValue && fn.name === 'isEmpty') return false;
    throw new Unsupported(`${fn.name}()`);
  }
  throw new Unsupported('calling this value');
}

const parsed = new Map<string, Expr | Unsupported>();

/** An expression read once (or why it cannot be). */
export function compile(src: string): Expr {
  let e = parsed.get(src);
  if (!e) {
    try {
      e = parseExpr(src);
    } catch (err) {
      e = err instanceof Unsupported ? err : new Unsupported(String(err));
    }
    parsed.set(src, e);
  }
  if (e instanceof Unsupported) throw e;
  return e;
}

function formulaValue(name: string, scope: NoteScope, stack: string[]): Value {
  const src = scope.formulas.get(name);
  if (src === undefined) throw new Unsupported(`formula.${name} (not defined)`);
  if (stack.includes(name)) throw new Unsupported(`formula.${name} (it uses itself: ${[...stack, name].join(' → ')})`);
  return evaluate(compile(src), scope, [...stack, name]);
}

/** Evaluate an expression written as text. */
export function evaluateText(src: string, scope: NoteScope): Value {
  return evaluate(compile(src), scope);
}
