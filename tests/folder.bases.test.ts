import { describe, expect, it } from 'vitest';
import { MemoryProvider } from '../src/fs';
import { NoteIndex } from '../src/folder/note-index';
import { parseYaml } from '../src/folder/base-yaml';
import { DateValue, evaluateText, parseDuration, show, Unsupported, type FileValue, type NoteScope, type Value } from '../src/folder/base-expr';
import { baseNotes, columnLabel, readBase, runView, withSort } from '../src/folder/bases';

// NOTE-004..NOTE-006: `.base` files, views of the notes of the folder.

const NOW = new Date(2026, 10, 27, 15, 30).getTime();

function scope(props: Record<string, Value>, file: Partial<FileValue> = {}, formulas: Record<string, string> = {}): NoteScope {
  return {
    file: { kind: 'file', name: 'Engine.md', basename: 'Engine', path: 'Projects/Engine.md', folder: 'Projects', ext: 'md', size: 120, ctime: null, mtime: new DateValue(new Date(2026, 10, 20).getTime()), tags: ['project', 'area/mech'], links: ['People/Ada Lovelace.md', 'Loom'], properties: new Set(Object.keys(props)), ...file },
    props: new Map(Object.entries(props).map(([k, v]) => [k.toLowerCase(), v])),
    formulas: new Map(Object.entries(formulas)),
    now: NOW,
  };
}
const ev = (src: string, props: Record<string, Value> = {}, formulas: Record<string, string> = {}): Value => evaluateText(src, scope(props, {}, formulas));

describe('NOTE-004 the YAML of .base files', () => {
  it('reads mappings, sequences, flow lists, quoted and block scalars, comments', () => {
    const doc = parseYaml(`# a base
filters:
  and:
    - file.hasTag("project")   # tagged
    - 'status != "done"'
formulas:
  late: if(due < today(), "late", "")
  long: |
    price * 2
properties:
  formula.late:
    displayName: "Late?"
views:
  - type: table
    name: All
    order: [file.name, status, "formula.late"]
    limit: 10
`);
    expect(doc.value).toEqual({
      filters: { and: ['file.hasTag("project")', 'status != "done"'] },
      formulas: { late: 'if(due < today(), "late", "")', long: 'price * 2\n' },
      properties: { 'formula.late': { displayName: 'Late?' } },
      views: [{ type: 'table', name: 'All', order: ['file.name', 'status', 'formula.late'], limit: 10 }],
    });
  });
  it('says where it cannot read', () => {
    expect(() => parseYaml('views:\n\t- a')).toThrow(/line 2/);
  });
});

describe('NOTE-005 expressions', () => {
  it('reads properties, note.x, note["x y"], file fields and literals', () => {
    expect(ev('status', { status: 'doing' })).toBe('doing');
    expect(ev('note.status', { status: 'doing' })).toBe('doing');
    expect(ev('note["last contact"]', { 'last contact': '2026-01-02' })).toBe('2026-01-02');
    expect(ev('missing')).toBeNull();
    expect(ev('file.name')).toBe('Engine.md');
    expect(ev('file.basename')).toBe('Engine');
    expect(ev('file.path')).toBe('Projects/Engine.md');
    expect(ev('file.folder')).toBe('Projects');
    expect(ev('file.ext')).toBe('md');
    expect(ev('file.size')).toBe(120);
    expect(ev('file.tags')).toEqual(['project', 'area/mech']);
    expect(ev('[1, "a", true, null]')).toEqual([1, 'a', true, null]);
  });
  it('computes with operators and their precedence', () => {
    expect(ev('1 + 2 * 3')).toBe(7);
    expect(ev('(1 + 2) * 3')).toBe(9);
    expect(ev('7 % 4 - 10 / 4')).toBe(0.5);
    expect(ev('-price', { price: 3 })).toBe(-3);
    expect(ev('price * 1.2', { price: '10' })).toBe(12);
    expect(ev('"a" + "b"')).toBe('ab');
    expect(ev('1 / 0')).toBeNull();
    expect(ev('2 > 1 && !(3 < 2) || false')).toBe(true);
    expect(ev('status == "Doing"', { status: 'doing' })).toBe(true);
    expect(ev('status != "done"', { status: 'doing' })).toBe(true);
    expect(ev('priority >= 2', { priority: 2 })).toBe(true);
    expect(ev('priority < 2', { priority: 3 })).toBe(false);
    expect(ev('lead == "Ada Lovelace"', { lead: '[[Ada Lovelace]]' })).toBe(true);
    expect(ev('missing > 3')).toBe(false);
  });
  it('has functions: if, now, today, date, number, link, min, max', () => {
    expect(ev('if(price > 5, "dear", "cheap")', { price: 6 })).toBe('dear');
    expect(ev('if(false, 1)')).toBeNull();
    expect((ev('now()') as DateValue).ms).toBe(NOW);
    expect(show(ev('today()'))).toBe('2026-11-27');
    expect(show(ev('date("2026-12-01")'))).toBe('2026-12-01');
    expect(ev('number("4.5") + 1')).toBe(5.5);
    expect(ev('link("People/Ada Lovelace.md", "Ada")')).toBe('[[People/Ada Lovelace|Ada]]');
    expect(ev('max(3, 9, 4)')).toBe(9);
    expect(ev('min([3, 9, 4])')).toBe(3);
  });
  it('has the methods of text, lists and the file', () => {
    expect(ev('title.contains("ENG")', { title: 'Engine' })).toBe(true);
    expect(ev('title.startsWith("en") && title.endsWith("ine")', { title: 'Engine' })).toBe(true);
    expect(ev('title.lower() + title.upper()', { title: 'Ab' })).toBe('abAB');
    expect(ev('title.length', { title: 'Engine' })).toBe(6);
    expect(ev('title.isEmpty()', { title: '' })).toBe(true);
    expect(ev('missing.isEmpty()')).toBe(true);
    expect(ev('aliases.contains("Moteur")', { aliases: ['Moteur', 'Machine'] })).toBe(true);
    expect(ev('aliases.length', { aliases: ['a', 'b'] })).toBe(2);
    expect(ev('file.hasTag("area")')).toBe(true);
    expect(ev('file.hasTag("#project")')).toBe(true);
    expect(ev('file.hasTag("x", "project")')).toBe(true);
    expect(ev('file.hasTag("are")')).toBe(false);
    expect(ev('file.inFolder("Projects")')).toBe(true);
    expect(ev('file.inFolder("Proj")')).toBe(false);
    expect(ev('file.hasLink("Ada Lovelace")')).toBe(true);
    expect(ev('file.hasLink("[[Loom]]")')).toBe(true);
    expect(ev('file.hasProperty("Status")', { status: 'x' })).toBe(true);
  });
  it('adds durations to dates and compares dates', () => {
    expect(parseDuration('7d')).toEqual([['d', 7]]);
    expect(parseDuration('1 week 2 days')).toEqual([['w', 1], ['d', 2]]);
    expect(parseDuration('3M')).toEqual([['M', 3]]);
    expect(parseDuration('5m')).toEqual([['m', 5]]);
    expect(parseDuration('soon')).toBeNull();
    expect(show(ev('today() + "1 month"'))).toBe('2026-12-27');
    expect(show(ev('date("2026-01-31") - "1y"'))).toBe('2025-01-31');
    expect(ev('due < today() + "7d"', { due: '2026-12-01' })).toBe(true);
    expect(ev('due < today() - "7d"', { due: '2026-12-01' })).toBe(false);
    expect(ev('file.mtime > now() - "2 weeks"')).toBe(true);
    expect(ev('file.mtime > now() - "1 week"')).toBe(false);
    expect(ev('(date("2026-11-28") - date("2026-11-27")) / 86400000')).toBe(1);
  });
  it('uses formulas, which may use other formulas, and finds formulas using themselves', () => {
    expect(ev('formula.total * 2', { price: 5 }, { ttc: 'price * 1.2', total: 'formula.ttc + 1' })).toBe(14);
    expect(ev('formula["ttc"]', { price: 5 }, { ttc: 'price * 2' })).toBe(10);
    expect(() => ev('formula.a', {}, { a: 'formula.b', b: 'formula.a' })).toThrow(/uses itself/);
    expect(() => ev('formula.none')).toThrow(/not defined/);
  });
  it('says what it does not support', () => {
    for (const src of ['unknownFn(1)', 'file.weird', 'file.hasFoo("x")', 'title.reverse()', 'this.file', '1 +', 'a ? b : c', '"open']) {
      expect(() => ev(src, { title: 'x' }), src).toThrow(Unsupported);
    }
  });
});

const files: Record<string, string> = {
  'Projects/Engine.md': '---\nstatus: doing\ndue: 2026-12-01\nprice: 10\ntags: [project]\n---\nSee [[Ada Lovelace]].\n',
  'Projects/Loom.md': '---\nstatus: todo\ndue: 2026-11-20\nprice: 4\ntags: [project]\n---\n',
  'Projects/Archive.md': '---\nstatus: done\nprice: 7\ntags: [project]\n---\n',
  'Projects/Mill.md': '---\nstatus: todo\ndue: 2027-01-15\nprice: 30\ntags: [project]\n---\n',
  'Projects/Notes.md': '# Free notes\n',
  'People/Ada Lovelace.md': '---\ntype: Person\n---\n',
};

async function notes() {
  const index = new NoteIndex(new MemoryProvider('m', 'M', files));
  await index.update(Object.keys(files).map((path) => ({ path, size: files[path]!.length, modified: Date.UTC(2026, 10, 1) })));
  return baseNotes(index.tables());
}

const BASE = `# The projects
filters:
  and:
    - file.hasTag("project")
    - file.inFolder("Projects")
formulas:
  ttc: price * 1.2
  late: if(due < today(), "late", "")
properties:
  formula.ttc:
    displayName: Price incl. tax
  status:
    displayName: Status
views:
  - type: table
    name: Open
    filters:
      not:
        - status == "done"
    order:
      - file.name
      - status
      - formula.ttc
      - formula.late
    sort:
      - property: due
        direction: ASC
  # The board of the statuses
  - type: cards
    name: By status
    groupBy:
      property: status
      direction: DESC
    limit: 3
    myOwnKey: kept
`;

describe('NOTE-004 views of the notes', () => {
  it('reads the filters, formulas, display names and views', () => {
    const spec = readBase(BASE);
    expect(spec.views.map((v) => [v.type, v.name])).toEqual([['table', 'Open'], ['cards', 'By status']]);
    expect(spec.formulas.get('ttc')).toBe('price * 1.2');
    expect(columnLabel(spec, 'formula.ttc')).toBe('Price incl. tax');
    expect(columnLabel(spec, 'note.status')).toBe('Status');
    expect(columnLabel(spec, 'due')).toBe('due');
    expect(spec.problems).toEqual(['views[1].myOwnKey']);
  });
  it('filters (and, not), computes formulas and sorts', async () => {
    const spec = readBase(BASE);
    const r = runView(spec, 0, await notes(), NOW);
    expect(r.rows.map((x) => x.note.name)).toEqual(['Loom', 'Engine', 'Mill']);
    expect(r.columns).toEqual(['file.name', 'status', 'formula.ttc', 'formula.late']);
    const engine = r.rows[1]!;
    expect(engine.cells.get('formula.ttc')).toEqual({ value: 12 });
    expect(r.rows[0]!.cells.get('formula.late')).toEqual({ value: 'late' });
    expect(r.unsupported).toEqual(['views[1].myOwnKey — not read']);
  });
  it('groups in the direction asked, then limits', async () => {
    const r = runView(readBase(BASE), 1, await notes(), NOW);
    expect(r.total).toBe(4);
    expect(r.rows).toHaveLength(3);
    expect(r.groups!.map((g) => [g.value, g.rows.map((x) => x.note.name)])).toEqual([
      ['todo', ['Loom', 'Mill']],
      ['done', ['Archive']],
    ]);
  });
  it('filters with or, and keeps the notes a filter it cannot evaluate would have filtered, saying so', async () => {
    const or = readBase('filters:\n  or:\n    - status == "todo"\n    - price > 9\n');
    expect(runView(or, 0, await notes(), NOW).rows.map((x) => x.note.name)).toEqual(['Engine', 'Loom', 'Mill']);
    const odd = readBase('filters: file.hasFoo("x")\nviews:\n  - type: table\n    order: [file.name, formula.nope]\n');
    const r = runView(odd, 0, await notes(), NOW);
    expect(r.rows).toHaveLength(6);
    expect(r.unsupported).toEqual(['filter file.hasFoo("x") — file.hasFoo()', 'formula.nope — formula.nope (not defined)']);
    expect(r.rows[0]!.cells.get('formula.nope')).toEqual({ unsupported: 'formula.nope (not defined)' });
  });
  it('shows a view of an unknown type as a table, saying so; a file it cannot read as one table', async () => {
    expect(runView(readBase('views:\n  - type: map\n'), 0, await notes(), NOW).unsupported).toEqual(['type: map — shown as a table']);
    const broken = readBase('views: [unclosed\n');
    expect(broken.views).toHaveLength(1);
    expect(broken.problems[0]).toMatch(/^YAML:/);
  });
});

describe('NOTE-006 saving a .base file', () => {
  it('writes the sort of a view back, keeping comments and unknown keys', () => {
    const out = withSort(BASE, 1, [{ property: 'price', direction: 'DESC' }]);
    expect(out).toBe(BASE.replace('    limit: 3\n    myOwnKey: kept\n', '    limit: 3\n    myOwnKey: kept\n    sort:\n      - property: price\n        direction: DESC\n'));
    const again = withSort(out, 0, [{ property: 'formula.ttc', direction: 'DESC' }]);
    expect(again).toContain('    sort:\n      - property: formula.ttc\n        direction: DESC\n  # The board of the statuses\n');
    expect(again).toContain('# The projects\n');
    expect(readBase(again).views[0]!.sort).toEqual([{ property: 'formula.ttc', direction: 'DESC' }]);
    expect(readBase(again).views[1]!.sort).toEqual([{ property: 'price', direction: 'DESC' }]);
  });
  it('adds a view when the file has none', () => {
    expect(withSort('filters: file.hasTag("x")\n', 0, [{ property: 'due', direction: 'ASC' }])).toBe('filters: file.hasTag("x")\nviews:\n  - type: table\n    name: Table\n    sort:\n      - property: due\n        direction: ASC\n');
  });
});
