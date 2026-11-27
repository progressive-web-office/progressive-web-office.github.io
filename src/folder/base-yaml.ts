/**
 * NOTE-004: the YAML of `.base` files — block mappings and sequences, flow
 * lists and maps, plain and quoted scalars, block scalars (`|`, `>`),
 * comments. Each node keeps the lines it spans, so that a change (the sort of
 * a view) is written back into the text without touching anything else.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

export interface YamlNode {
  value: YamlValue;
  /** First and last line (0-based, inclusive) of the node in the text. */
  start: number;
  end: number;
  /** Column of the keys (mappings) or dashes (sequences). */
  indent: number;
  /** Children with their own lines: mapping keys or sequence items. */
  entries?: { key: string | number; keyLine: number; node: YamlNode }[];
}

export class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`${message} (line ${line + 1})`);
    this.name = 'YamlError';
  }
}

interface Line {
  n: number;
  indent: number;
  text: string;
}

/** The content of a line without its comment (a `#` after a space, outside quotes). */
function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === q && !(q === '"' && s[i - 1] === '\\')) q = null;
      else if (q === "'" && c === "'" && s[i + 1] === "'") i++;
    } else if (c === '"' || c === "'") {
      if (i === 0 || /[\s:[{,-]/.test(s[i - 1]!)) q = c;
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i).trimEnd();
  }
  return s.trimEnd();
}

/** Where a mapping key ends (`key: …`), outside quotes and brackets; -1 if none. */
function keyColon(s: string): number {
  let q: string | null = null;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) {
      if (c === q) q = null;
    } else if ((c === '"' || c === "'") && i === 0) q = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ':' && depth === 0 && (i + 1 === s.length || s[i + 1] === ' ')) return i;
  }
  return -1;
}

const unquote = (s: string): string => {
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) return JSON.parse(s.replace(/\t/g, '\\t')) as string;
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};

/** A plain or quoted scalar. */
export function scalar(raw: string): YamlValue {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s.startsWith('"') || s.startsWith("'")) return unquote(s);
  if (/^(true|True|TRUE)$/.test(s)) return true;
  if (/^(false|False|FALSE)$/.test(s)) return false;
  if (/^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/** A flow collection or scalar: `[a, "b, c", {x: 1}]`. */
function flow(src: string, line: number): YamlValue {
  let i = 0;
  const ws = (): void => {
    while (i < src.length && /\s/.test(src[i]!)) i++;
  };
  const item = (stop: string): YamlValue => {
    ws();
    const c = src[i];
    if (c === '[') {
      i++;
      const out: YamlValue[] = [];
      ws();
      if (src[i] === ']') return i++, out;
      for (;;) {
        out.push(item(',]'));
        ws();
        if (src[i] === ',') i++;
        else if (src[i] === ']') return i++, out;
        else throw new YamlError('expected , or ]', line);
      }
    }
    if (c === '{') {
      i++;
      const out: Record<string, YamlValue> = {};
      ws();
      if (src[i] === '}') return i++, out;
      for (;;) {
        const k = item(':,}');
        ws();
        let v: YamlValue = null;
        if (src[i] === ':') {
          i++;
          v = item(',}');
          ws();
        }
        out[String(k)] = v;
        if (src[i] === ',') i++;
        else if (src[i] === '}') return i++, out;
        else throw new YamlError('expected , or }', line);
      }
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < src.length; j++) {
        if (src[j] === '\\' && c === '"') j++;
        else if (src[j] === c) {
          if (c === "'" && src[j + 1] === "'") j++;
          else break;
        }
      }
      const s = src.slice(i, j + 1);
      i = j + 1;
      return unquote(s);
    }
    let j = i;
    while (j < src.length && !stop.includes(src[j]!)) j++;
    const s = src.slice(i, j);
    i = j;
    return scalar(s);
  };
  const v = item('');
  ws();
  if (i < src.length) throw new YamlError('unexpected text', line);
  return v;
}

/** The value written after `key:` or `- ` on one line. */
function inline(s: string, line: number): YamlValue {
  const t = s.trim();
  if (t.startsWith('[') || t.startsWith('{')) return flow(t, line);
  return scalar(t);
}

export function parseYaml(text: string): YamlNode {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  const lines: Line[] = [];
  raw.forEach((l, n) => {
    if (/^\s*(#.*)?$/.test(l) || /^(---|\.\.\.)\s*$/.test(l)) return;
    if (/^\t/.test(l)) throw new YamlError('tabs are not allowed for indentation', n);
    lines.push({ n, indent: l.length - l.trimStart().length, text: stripComment(l.trimStart()) });
  });
  let at = 0;

  /** A block scalar (`|`, `>`) whose lines are deeper than `indent`. */
  const blockScalar = (style: string, indent: number, startLine: number): { value: string; end: number } => {
    const out: string[] = [];
    let end = startLine;
    let k = startLine + 1;
    let deep = -1;
    for (; k < raw.length; k++) {
      const l = raw[k]!;
      if (/^\s*$/.test(l)) {
        out.push('');
        continue;
      }
      const ind = l.length - l.trimStart().length;
      if (ind <= indent) break;
      if (deep < 0) deep = ind;
      out.push(l.slice(deep));
      end = k;
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    while (at < lines.length && lines[at]!.n <= end) at++;
    const keep = style.includes('+');
    const body = style.startsWith('>') ? out.join('\n').replace(/([^\n])\n(?=[^\n])/g, '$1 ') : out.join('\n');
    return { value: style.includes('-') ? body : `${body}${keep || body ? '\n' : ''}`, end };
  };

  const node = (indent: number): YamlNode => {
    const first = lines[at];
    if (!first || first.indent < indent) return { value: null, start: first?.n ?? 0, end: first?.n ?? 0, indent };
    const base = first.indent;
    if (first.text.startsWith('- ') || first.text === '-') return sequence(base);
    if (keyColon(first.text) > 0) return mapping(base);
    at++;
    return { value: inline(first.text, first.n), start: first.n, end: first.n, indent: base };
  };

  const valueAfter = (rest: string, lineNo: number, indent: number): YamlNode => {
    const r = rest.trim();
    if (/^[|>][+-]?$/.test(r)) {
      const b = blockScalar(r, indent, lineNo);
      return { value: b.value, start: lineNo, end: b.end, indent };
    }
    if (r) return { value: inline(r, lineNo), start: lineNo, end: lineNo, indent };
    const next = lines[at];
    if (next && (next.indent > indent || (next.indent === indent && (next.text.startsWith('- ') || next.text === '-')))) return node(next.indent);
    return { value: null, start: lineNo, end: lineNo, indent };
  };

  const mapping = (indent: number): YamlNode => {
    const value: Record<string, YamlValue> = {};
    const entries: NonNullable<YamlNode['entries']> = [];
    const start = lines[at]!.n;
    let end = start;
    while (at < lines.length && lines[at]!.indent === indent) {
      const l = lines[at]!;
      const c = keyColon(l.text);
      if (c <= 0 || l.text.startsWith('- ')) break;
      const key = String(unquote(l.text.slice(0, c).trim()));
      at++;
      const child = valueAfter(l.text.slice(c + 1), l.n, indent);
      value[key] = child.value;
      entries.push({ key, keyLine: l.n, node: { ...child, start: l.n } });
      end = Math.max(end, child.end);
    }
    if (at < lines.length && lines[at]!.indent > indent) throw new YamlError('bad indentation', lines[at]!.n);
    return { value, start, end, indent, entries };
  };

  const sequence = (indent: number): YamlNode => {
    const value: YamlValue[] = [];
    const entries: NonNullable<YamlNode['entries']> = [];
    const start = lines[at]!.n;
    let end = start;
    while (at < lines.length && lines[at]!.indent === indent && (lines[at]!.text.startsWith('- ') || lines[at]!.text === '-')) {
      const l = lines[at]!;
      const rest = l.text === '-' ? '' : l.text.slice(2);
      const inner = indent + 2 + (rest.length - rest.trimStart().length);
      let child: YamlNode;
      if (rest.trim() && keyColon(rest.trim()) > 0 && !rest.trim().startsWith('[') && !rest.trim().startsWith('{')) {
        // `- key: value` and the keys under it: a mapping at the column of `key`.
        lines[at] = { n: l.n, indent: inner, text: rest.trim() };
        child = mapping(inner);
      } else if (rest.trim().startsWith('- ')) {
        lines[at] = { n: l.n, indent: inner, text: rest.trim() };
        child = sequence(inner);
      } else {
        at++;
        child = valueAfter(rest, l.n, indent);
      }
      value.push(child.value);
      entries.push({ key: entries.length, keyLine: l.n, node: { ...child, start: l.n } });
      end = Math.max(end, child.end);
    }
    return { value, start, end, indent, entries };
  };

  if (!lines.length) return { value: null, start: 0, end: 0, indent: 0 };
  const root = node(lines[0]!.indent);
  if (at < lines.length) throw new YamlError('unexpected content', lines[at]!.n);
  return root;
}

/** A scalar written so that it reads back as the same string. */
export function yamlString(s: string): string {
  if (s === '' || /^[\s]|[\s]$/.test(s) || /^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /: |\s#/.test(s) || /^(true|false|null|~|yes|no|on|off)$/i.test(s) || /^[-+]?[\d.]+([eE][-+]?\d+)?$/.test(s)) return JSON.stringify(s);
  return s;
}
