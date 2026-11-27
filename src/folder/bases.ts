/**
 * NOTE-004..NOTE-006: `.base` files — views of the notes of the folder
 * described in YAML: filters (`and`, `or`, `not`, expressions), formulas, the
 * display names of properties, and views (a table or cards, with their
 * columns, sort, grouping and limit). Pure: no DOM.
 *
 * What is not supported is never silently left out: an expression the system
 * cannot evaluate keeps the notes it would have filtered (a filter) or shows
 * "not supported" in its cells (a formula), and every such part is listed so
 * that the view can say it. Saving changes only what the user changed (the
 * sort of a view) in the text of the file; the rest is kept as written.
 */
import type { NoteTables } from '../code/note-tables';
import { DateValue, compareValues, evaluateText, show, truthy, Unsupported, type FileValue, type NoteScope, type Value } from './base-expr';
import { parseYaml, yamlString, YamlError, type YamlNode, type YamlValue } from './base-yaml';

export type FilterNode = string | { and: FilterNode[] } | { or: FilterNode[] } | { not: FilterNode[] };

export interface BaseSort {
  property: string;
  direction: 'ASC' | 'DESC';
}

export interface BaseView {
  type: string;
  name: string;
  filters?: FilterNode;
  /** The columns, as property ids (`file.name`, `status`, `note.status`, `formula.x`). */
  order: string[];
  sort: BaseSort[];
  groupBy?: BaseSort;
  limit?: number;
}

export interface BaseSpec {
  filters?: FilterNode;
  formulas: Map<string, string>;
  /** Display names by property id. */
  displayNames: Map<string, string>;
  views: BaseView[];
  /** Parts of the file the system does not understand (shown, never dropped). */
  problems: string[];
}

export const VIEW_TYPES = ['table', 'cards'] as const;

const isMap = (v: YamlValue | undefined): v is Record<string, YamlValue> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: YamlValue | undefined): string => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function readFilter(v: YamlValue | undefined, problems: string[]): FilterNode | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return { and: v.map((x) => readFilter(x, problems)).filter((x): x is FilterNode => x !== undefined) };
  const keys = Object.keys(v);
  for (const k of ['and', 'or', 'not'] as const) {
    if (k in v) {
      const list = Array.isArray(v[k]) ? (v[k] as YamlValue[]) : [v[k]!];
      if (keys.length > 1) problems.push(`filters: ${keys.filter((x) => x !== k).join(', ')}`);
      const items = list.map((x) => readFilter(x, problems)).filter((x): x is FilterNode => x !== undefined);
      return k === 'and' ? { and: items } : k === 'or' ? { or: items } : { not: items };
    }
  }
  problems.push(`filters: ${keys.join(', ') || '{}'}`);
  return undefined;
}

const sortOf = (v: YamlValue | undefined): BaseSort | undefined => {
  if (typeof v === 'string') return { property: v, direction: 'ASC' };
  if (!isMap(v) || typeof v.property !== 'string') return undefined;
  return { property: v.property, direction: String(v.direction ?? 'ASC').toUpperCase() === 'DESC' ? 'DESC' : 'ASC' };
};

const VIEW_KEYS = new Set(['type', 'name', 'filters', 'order', 'sort', 'groupBy', 'limit']);

/** What a `.base` file describes. A file that cannot be read gives one table and says why. */
export function readBase(source: string): BaseSpec {
  const problems: string[] = [];
  let root: YamlValue = null;
  try {
    root = parseYaml(source).value;
  } catch (err) {
    problems.push(err instanceof YamlError ? `YAML: ${err.message}` : String(err));
  }
  const top = isMap(root) ? root : {};
  if (root !== null && !isMap(root)) problems.push('YAML: not a mapping');
  for (const k of Object.keys(top)) if (!['filters', 'formulas', 'properties', 'views'].includes(k)) problems.push(k);
  const formulas = new Map<string, string>();
  if (isMap(top.formulas)) for (const [k, v] of Object.entries(top.formulas)) formulas.set(k, text(v));
  const displayNames = new Map<string, string>();
  if (isMap(top.properties)) {
    for (const [k, v] of Object.entries(top.properties)) if (isMap(v) && typeof v.displayName === 'string') displayNames.set(k, v.displayName);
  }
  const views: BaseView[] = [];
  const list = Array.isArray(top.views) ? top.views : [];
  list.forEach((raw, i) => {
    if (!isMap(raw)) return void problems.push(`views[${i}]`);
    for (const k of Object.keys(raw)) if (!VIEW_KEYS.has(k)) problems.push(`views[${i}].${k}`);
    const type = text(raw.type) || 'table';
    const sort = (Array.isArray(raw.sort) ? raw.sort : raw.sort ? [raw.sort] : []).map(sortOf).filter((s): s is BaseSort => !!s);
    const groupBy = sortOf(raw.groupBy);
    const limit = typeof raw.limit === 'number' && raw.limit > 0 ? Math.floor(raw.limit) : undefined;
    const filters = readFilter(raw.filters, problems);
    views.push({
      type,
      name: text(raw.name) || `${type} ${i + 1}`,
      ...(filters !== undefined ? { filters } : {}),
      order: (Array.isArray(raw.order) ? raw.order : []).map(text).filter(Boolean),
      sort,
      ...(groupBy ? { groupBy } : {}),
      ...(limit ? { limit } : {}),
    });
  });
  if (!views.length) views.push({ type: 'table', name: 'Table', order: [], sort: [] });
  const filters = readFilter(top.filters, problems);
  return { ...(filters !== undefined ? { filters } : {}), formulas, displayNames, views, problems };
}

// ---------------------------------------------------------------- the notes

export interface BaseNote {
  path: string;
  name: string;
  folder: string;
  size: number | null;
  modified?: string;
  /** Values of the properties, by lower-case key, as written. */
  props: Map<string, (string | number)[]>;
  /** The keys as written, by lower-case key. */
  keys: Map<string, string>;
  tags: string[];
  links: string[];
}

export function baseNotes(tables: NoteTables): BaseNote[] {
  const byPath = new Map<string, BaseNote>();
  for (const [path, name, folder, size, modified] of tables.notes) byPath.set(path, { path, name, folder, size, ...(modified ? { modified } : {}), props: new Map(), keys: new Map(), tags: [], links: [] });
  for (const [path, key, , value] of tables.props) {
    const r = byPath.get(path);
    if (!r || value === null) continue;
    const k = key.toLowerCase();
    r.props.set(k, [...(r.props.get(k) ?? []), value]);
    if (!r.keys.has(k)) r.keys.set(k, key);
  }
  for (const [path, tag] of tables.tags) byPath.get(path)?.tags.push(tag);
  for (const [source, target] of tables.links) byPath.get(source)?.links.push(target);
  return [...byPath.values()];
}

/** The tags of a note: those of its front matter and those of its text. */
const tagsOf = (n: BaseNote): string[] => [...new Set([...(n.props.get('tags') ?? []).map((t) => String(t).replace(/^#/, '')), ...n.tags])];

function scopeOf(n: BaseNote, spec: BaseSpec, now: number): NoteScope {
  const base = n.path.split('/').pop() ?? n.path;
  const dot = base.lastIndexOf('.');
  const mtime = n.modified ? new DateValue(Date.parse(n.modified)) : null;
  const file: FileValue = {
    kind: 'file',
    name: base,
    basename: dot > 0 ? base.slice(0, dot) : base,
    path: n.path,
    folder: n.folder,
    ext: dot > 0 ? base.slice(dot + 1) : '',
    size: n.size,
    // Browsers do not give the creation time of a file: the time of its last change stands for it.
    ctime: mtime,
    mtime,
    tags: tagsOf(n),
    links: n.links,
    properties: new Set(n.props.keys()),
  };
  const props = new Map<string, Value>();
  for (const [k, vs] of n.props) props.set(k, k === 'tags' ? file.tags : vs.length === 1 ? vs[0]! : vs);
  return { file, props, formulas: spec.formulas, now };
}

// ---------------------------------------------------------------- a view

export type Cell = { value: Value } | { unsupported: string };

export interface BaseRow {
  note: BaseNote;
  cells: Map<string, Cell>;
}

export interface BaseResult {
  view: BaseView;
  columns: string[];
  rows: BaseRow[];
  /** Sections by the value of `groupBy`, in its direction. */
  groups: { value: string; rows: BaseRow[] }[] | null;
  /** Notes passing the filters, before the limit. */
  total: number;
  /** What could not be evaluated or read, each once. */
  unsupported: string[];
}

/** `note.status` → `status`; other ids as written. */
export const plainKey = (id: string): string => id.replace(/^note\./, '');

/** The value of a column for a note. */
function cellOf(id: string, scope: NoteScope): Cell {
  try {
    if (id.startsWith('formula.') || id.startsWith('file.')) return { value: evaluateText(id, scope) };
    return { value: scope.props.get(plainKey(id).toLowerCase()) ?? null };
  } catch (err) {
    return { unsupported: err instanceof Unsupported ? err.what : String(err) };
  }
}

type Outcome = boolean | 'unsupported';

function filterOutcome(node: FilterNode, scope: NoteScope, report: (what: string) => void): Outcome {
  if (typeof node === 'string') {
    try {
      return truthy(evaluateText(node, scope));
    } catch (err) {
      report(`${node} — ${err instanceof Unsupported ? err.what : String(err)}`);
      return 'unsupported';
    }
  }
  if ('and' in node) {
    const outs = node.and.map((n) => filterOutcome(n, scope, report));
    return outs.includes(false) ? false : true;
  }
  if ('or' in node) {
    if (!node.or.length) return true;
    const outs = node.or.map((n) => filterOutcome(n, scope, report));
    return outs.includes(true) || outs.includes('unsupported');
  }
  const outs = node.not.map((n) => filterOutcome(n, scope, report));
  return !outs.includes(true);
}

/** Order of two cells: values in order, empty and unsupported ones last whatever the direction. */
function compareCells(a: Cell | undefined, b: Cell | undefined, dir: number): number {
  const va = a && 'value' in a ? a.value : null;
  const vb = b && 'value' in b ? b.value : null;
  const ea = va === null || (Array.isArray(va) && !va.length);
  const eb = vb === null || (Array.isArray(vb) && !vb.length);
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  const x = Array.isArray(va) ? va[0]! : va;
  const y = Array.isArray(vb) ? vb[0]! : vb;
  return (compareValues(x, y) ?? show(x).localeCompare(show(y))) * dir;
}

export function runView(spec: BaseSpec, index: number, notes: BaseNote[], now: number, basePath?: string): BaseResult {
  const view = spec.views[index] ?? spec.views[0]!;
  const unsupported = new Set<string>(spec.problems.map((p) => `${p} — not read`));
  if (!(VIEW_TYPES as readonly string[]).includes(view.type)) unsupported.add(`type: ${view.type} — shown as a table`);
  const columns = view.order.length ? view.order : ['file.name'];
  const needed = [...new Set([...columns, ...view.sort.map((s) => s.property), ...(view.groupBy ? [view.groupBy.property] : [])])];
  const kept: BaseRow[] = [];
  for (const n of notes) {
    if (n.path === basePath) continue;
    const scope = scopeOf(n, spec, now);
    const report = (what: string): void => void unsupported.add(`filter ${what}`);
    if (spec.filters !== undefined && filterOutcome(spec.filters, scope, report) === false) continue;
    if (view.filters !== undefined && filterOutcome(view.filters, scope, report) === false) continue;
    const cells = new Map<string, Cell>();
    for (const id of needed) {
      const c = cellOf(id, scope);
      if ('unsupported' in c) unsupported.add(`${id} — ${c.unsupported}`);
      cells.set(id, c);
    }
    kept.push({ note: n, cells });
  }
  const sorts = view.sort.length ? view.sort : [{ property: 'file.name', direction: 'ASC' as const }];
  for (const s of sorts) {
    if (kept.length && !kept[0]!.cells.has(s.property)) for (const r of kept) r.cells.set(s.property, cellOf(s.property, scopeOf(r.note, spec, now)));
  }
  kept.sort((a, b) => {
    if (view.groupBy) {
      const g = compareCells(a.cells.get(view.groupBy.property), b.cells.get(view.groupBy.property), view.groupBy.direction === 'DESC' ? -1 : 1);
      if (g) return g;
    }
    for (const s of sorts) {
      const c = compareCells(a.cells.get(s.property), b.cells.get(s.property), s.direction === 'DESC' ? -1 : 1);
      if (c) return c;
    }
    return a.note.path.localeCompare(b.note.path);
  });
  const total = kept.length;
  const rows = view.limit ? kept.slice(0, view.limit) : kept;
  let groups: BaseResult['groups'] = null;
  if (view.groupBy) {
    groups = [];
    for (const r of rows) {
      const c = r.cells.get(view.groupBy.property);
      const value = c && 'value' in c ? show(c.value) : '';
      const last = groups[groups.length - 1];
      if (last && last.value === value) last.rows.push(r);
      else groups.push({ value, rows: [r] });
    }
  }
  return { view, columns, rows, groups, total, unsupported: [...unsupported] };
}

/** The header of a column: its display name, else its id without `note.`. */
export function columnLabel(spec: BaseSpec, id: string): string {
  return spec.displayNames.get(id) ?? spec.displayNames.get(plainKey(id)) ?? spec.displayNames.get(`note.${plainKey(id)}`) ?? plainKey(id);
}

/** Whether a column is a property of the note, that a cell can change. */
export const editableColumn = (id: string): boolean => !id.startsWith('file.') && !id.startsWith('formula.') && !id.startsWith('this.');

// ---------------------------------------------------------------- writing back

/** The `.base` text with the sort of a view changed; everything else kept as written. */
export function withSort(source: string, index: number, sort: BaseSort[]): string {
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  const block = (indent: number): string[] => {
    const pad = ' '.repeat(indent);
    return [`${pad}sort:`, ...sort.flatMap((s) => [`${pad}  - property: ${yamlString(s.property)}`, `${pad}    direction: ${s.direction}`])];
  };
  let root: YamlNode | undefined;
  try {
    root = parseYaml(source);
  } catch {
    root = undefined;
  }
  const views = root?.entries?.find((e) => e.key === 'views')?.node;
  const view = views?.entries?.[index]?.node;
  if (!root || !view || !view.entries) {
    // No such view in the file: a view is added, with the sort.
    const body = [`views:`, `  - type: table`, `    name: Table`, ...block(4)];
    const trimmed = source.replace(/\s*$/, '');
    if (!views) return `${trimmed}${trimmed ? eol : ''}${body.join(eol)}${eol}`;
    return source;
  }
  const entry = view.entries.find((e) => e.key === 'sort');
  if (entry) {
    lines.splice(entry.keyLine, entry.node.end - entry.keyLine + 1, ...block(view.indent));
  } else {
    lines.splice(view.end + 1, 0, ...block(view.indent));
  }
  return lines.join(eol);
}
