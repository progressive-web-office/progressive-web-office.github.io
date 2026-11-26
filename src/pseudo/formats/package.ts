/**
 * PSEUDO-018..PSEUDO-021, PSEUDO-025, PSEUDO-033: Office Open XML and
 * OpenDocument packages, processed as packages (never through the document
 * model, which would lose what it does not hold). Every XML part is read: the
 * text of its paragraphs, its other texts and its attribute values become
 * units; parts not known by name get the same treatment (fail-safe). Binary
 * parts are listed to check visually; thumbnails, signatures and printer
 * settings are removed.
 */
import type { TextUnit, UnitRole } from '../engine';
import { LIMITS } from '../limits';
import { decodeXml, looksLikeXml, parseXmlPart, serializeXmlPart, type XmlPart } from '../package/xml';
import { isZip, readPackage, writePackage, type PackageEntry } from '../package/zip';
import { openText } from './text';
import type { OpenedDocument, OpenOptions, UnitEdit, VisualCheck } from './types';

const NS = {
  W: 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
  A: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  SML: 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  REL: 'http://schemas.openxmlformats.org/package/2006/relationships',
  CT: 'http://schemas.openxmlformats.org/package/2006/content-types',
  TEXT: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  TABLE: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  CONFIG: 'urn:oasis:names:tc:opendocument:xmlns:config:1.0',
  MANIFEST: 'urn:oasis:names:tc:opendocument:xmlns:manifest:1.0',
  XML: 'http://www.w3.org/XML/1998/namespace',
} as const;

/** ODF namespaces whose elements, inside a paragraph, hold texts of their own (frames, annotations, metadata). */
const ODF_ISOLATING = new Set([
  'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  'http://purl.org/dc/elements/1.1/',
  'urn:oasis:names:tc:opendocument:xmlns:meta:1.0',
  NS.TABLE,
  'urn:oasis:names:tc:opendocument:xmlns:presentation:1.0',
  'urn:oasis:names:tc:opendocument:xmlns:chart:1.0',
  'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
]);

const PICTURE = /\.(png|jpe?g|gif|bmp|tiff?|emf|wmf|webp|avif|ico|heic)$/i;
const TEXT_ENTRY = /\.(md|markdown|txt|csv|tsv|tex|bib|json|ya?ml|html?)$/i;
const REMOVED = [/^docProps\/thumbnail\./i, /^Thumbnails\//, /^_xmlsignatures\//, /^META-INF\/(documentsignatures|macrosignatures)\.xml$/, /^layout-cache$/];
const BLANK_PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='), (c) => c.charCodeAt(0));

/** Attributes that never hold text written by a person. */
const SKIP_ATTRS = new Set(['Id', 'Type', 'TargetMode', 'PartName', 'ContentType', 'Extension', 'space', 'Ignorable', 'Requires', 'type', 'id', 'embed', 'link', 'idx', 'val:numeric']);
const AUTHOR_ATTRS = new Set(['author', 'initials', 'userId', 'userName', 'creator']);
const AUTHOR_LEAVES = new Set(['creator', 'initial-creator', 'lastModifiedBy', 'author', 'printed-by', 'creator-initials', 'sender-initials', 'Manager', 'Company', 'displayName', 'userName']);
const ALT_ATTRS = new Set(['descr', 'title', 'name', 'alt']);

interface Seg {
  start: number;
  end: number;
  /** Writes the new text of a text segment. */
  set?: (text: string) => void;
  /** A fixed segment (tab, spaces): removed when all of it is replaced. */
  fixed?: Element;
}

type Ref =
  | { kind: 'para'; segs: Seg[] }
  | { kind: 'attr'; attr: Attr; transform?: (value: string) => string }
  | { kind: 'leaf'; node: Text };

interface XmlState {
  kind: 'xml';
  entry: PackageEntry;
  part: XmlPart;
  first: number;
  refs: Ref[];
}

interface SubState {
  kind: 'sub';
  entry: PackageEntry;
  doc: OpenedDocument;
  first: number;
  count: number;
}

const isEl = (n: Node): n is Element => n.nodeType === 1;
const isText = (n: Node): n is Text => n.nodeType === 3;
const is = (el: Element, ns: string, ...names: string[]): boolean => el.namespaceURI === ns && names.includes(el.localName);

function roleOfPart(name: string): UnitRole {
  if (/header|style/i.test(name)) return 'header';
  if (/footer/i.test(name)) return 'footer';
  if (/(foot|end)notes/i.test(name)) return 'note';
  if (/comment/i.test(name)) return 'comment';
  if (/docProps|meta\.xml|settings/i.test(name)) return 'meta';
  return 'body';
}

/** Where a relationship points, as a part name. */
function resolveTarget(relsName: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const dir = relsName.replace(/_rels\/[^/]*$/, '');
  const parts = (dir + target).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  return out.join('/');
}

/** PSEUDO-018: AUTHOR, USERNAME and USERINITIALS fields become plain text, so that Word does not fill them again. */
function unwrapAuthorFields(doc: Document): void {
  const FIELD = /^\s*(AUTHOR|USERNAME|USERINITIALS)\b/i;
  for (const f of Array.from(doc.getElementsByTagNameNS(NS.W, 'fldSimple'))) {
    if (!FIELD.test(f.getAttributeNS(NS.W, 'instr') ?? '')) continue;
    while (f.firstChild) f.parentNode!.insertBefore(f.firstChild, f);
    f.remove();
  }
  for (const p of Array.from(doc.getElementsByTagNameNS(NS.W, 'p'))) {
    const runs = Array.from(p.children).filter((c) => is(c, NS.W, 'r'));
    for (let i = 0; i < runs.length; i++) {
      const begin = runs[i]!.getElementsByTagNameNS(NS.W, 'fldChar')[0];
      if (begin?.getAttributeNS(NS.W, 'fldCharType') !== 'begin') continue;
      let instr = '';
      let sep = -1;
      let end = -1;
      for (let j = i + 1; j < runs.length; j++) {
        const fc = runs[j]!.getElementsByTagNameNS(NS.W, 'fldChar')[0]?.getAttributeNS(NS.W, 'fldCharType');
        for (const it of Array.from(runs[j]!.getElementsByTagNameNS(NS.W, 'instrText'))) instr += it.textContent ?? '';
        if (fc === 'separate' && sep < 0) sep = j;
        if (fc === 'end') {
          end = j;
          break;
        }
        if (fc === 'begin') break; // nested fields are left as they are
      }
      if (end < 0 || sep < 0 || !FIELD.test(instr)) continue;
      for (let j = i; j <= sep; j++) runs[j]!.remove();
      runs[end]!.remove();
      i = end;
    }
  }
}

/** PSEUDO-033: Word revision identifiers link the documents edited with the same installation. */
function removeRsids(doc: Document): boolean {
  let removed = false;
  const all = doc.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    for (const a of Array.from(el.attributes)) {
      if (a.namespaceURI === NS.W && a.localName.startsWith('rsid')) {
        el.removeAttributeNode(a);
        removed = true;
      }
    }
  }
  for (const r of Array.from(doc.getElementsByTagNameNS(NS.W, 'rsids'))) {
    r.remove();
    removed = true;
  }
  return removed;
}

/** Units of one XML part. */
function collectUnits(part: XmlPart, name: string, odf: boolean, units: TextUnit[], refs: Ref[], cellOf: Map<number, TextUnit['cell']>, sharedStrings: number[]): void {
  const role = roleOfPart(name);
  let tableId = 0;
  type Cell = NonNullable<TextUnit['cell']>;
  const add = (text: string, ref: Ref, r: UnitRole, cell?: Cell): void => {
    units.push({ text, where: name, role: r, ...(cell ? { cell } : {}) });
    refs.push(ref);
  };
  const attrUnits = (el: Element): void => {
    for (const a of Array.from(el.attributes)) {
      if (a.name === 'xmlns' || a.prefix === 'xmlns' || SKIP_ATTRS.has(a.localName)) continue;
      const v = a.value;
      if (v.length < 2 || !/[\p{L}]/u.test(v) && !/\d{7,}/.test(v)) continue;
      if (/^rId\d+$/.test(v)) continue;
      const r: UnitRole = AUTHOR_ATTRS.has(a.localName) || (a.localName === 'displayName' && el.localName === 'person') ? 'author' : ALT_ATTRS.has(a.localName) ? 'alt' : a.localName === 'Target' ? 'link' : 'meta';
      let transform: ((value: string) => string) | undefined;
      // Names that must stay valid identifiers (PSEUDO-020).
      if (el.namespaceURI === NS.SML && el.localName === 'table' && (a.localName === 'name' || a.localName === 'displayName')) transform = (s) => s.replace(/[^\p{L}\p{N}_.\\]/gu, '_');
      if (el.namespaceURI === NS.SML && el.localName === 'sheet' && a.localName === 'name') transform = (s) => s.replace(/[[\]:*?/\\]/g, '').slice(0, 31) || 'Sheet';
      add(v, { kind: 'attr', attr: a, ...(transform ? { transform } : {}) }, r);
    }
  };

  // The cell a paragraph is in, kept while walking.
  const walk = (el: Element, cell: Cell | undefined, table: { id: string; row: number; col: number } | undefined): void => {
    attrUnits(el);
    let nextCell = cell;
    let nextTable = table;
    if (is(el, NS.W, 'tbl') || is(el, NS.A, 'tbl') || is(el, NS.TABLE, 'table')) nextTable = { id: `${name}#${tableId++}`, row: -1, col: -1 };
    else if ((is(el, NS.W, 'tr') || is(el, NS.A, 'tr') || is(el, NS.TABLE, 'table-row')) && table) {
      table.row++;
      table.col = -1;
    } else if ((is(el, NS.W, 'tc') || is(el, NS.A, 'tc') || is(el, NS.TABLE, 'table-cell', 'covered-table-cell')) && table) {
      table.col++;
      nextCell = { table: table.id, row: table.row, col: table.col };
    } else if (is(el, NS.SML, 'c')) {
      const m = /^([A-Z]+)(\d+)$/.exec(el.getAttribute('r') ?? '');
      if (m) {
        const col = [...m[1]!].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
        nextCell = { table: name, row: Number(m[2]) - 1, col };
        if (el.getAttribute('t') === 's') {
          const v = el.getElementsByTagNameNS(NS.SML, 'v')[0]?.textContent;
          if (v && /^\d+$/.test(v)) {
            const unit = sharedStrings[Number(v)];
            if (unit !== undefined && !cellOf.has(unit)) cellOf.set(unit, nextCell);
          }
        }
      }
    }
    if (isPara(el)) {
      paragraph(el, nextCell);
      return;
    }
    for (const c of Array.from(el.childNodes)) {
      if (isEl(c)) walk(c, nextCell, nextTable);
      else if (isText(c) && c.data.trim()) leaf(c);
    }
  };

  const isPara = (el: Element): boolean =>
    is(el, NS.W, 'p') || is(el, NS.A, 'p') || is(el, NS.TEXT, 'p', 'h') || is(el, NS.SML, 'si', 'is') || (is(el, NS.SML, 'text') && el.parentElement?.localName === 'comment');

  const leaf = (node: Text): void => {
    const parent = node.parentElement;
    const r: UnitRole = parent && AUTHOR_LEAVES.has(parent.localName) ? 'author' : role === 'meta' ? 'meta' : 'other';
    add(node.data, { kind: 'leaf', node }, r);
  };

  const paragraph = (p: Element, cell: Cell | undefined): void => {
    const segs: Seg[] = [];
    let text = '';
    const push = (s: string, seg: Omit<Seg, 'start' | 'end'>): void => {
      segs.push({ start: text.length, end: text.length + s.length, ...seg });
      text += s;
    };
    const inside = (el: Element): void => {
      for (const c of Array.from(el.childNodes)) {
        if (isText(c)) {
          if (odf && c.parentElement?.namespaceURI === NS.TEXT) push(c.data, { set: (s) => (c.data = s) });
          continue;
        }
        if (!isEl(c)) continue;
        if (isPara(c) || (odf && ODF_ISOLATING.has(c.namespaceURI ?? ''))) {
          push('\n', {});
          walk(c, undefined, undefined);
          continue;
        }
        attrUnits(c);
        if (is(c, NS.W, 't', 'delText') || is(c, NS.A, 't') || is(c, NS.SML, 't')) {
          push(c.textContent ?? '', {
            set: (s) => {
              c.textContent = s;
              if (c.namespaceURI === NS.W) c.setAttributeNS(NS.XML, 'xml:space', 'preserve');
            },
          });
        } else if (is(c, NS.W, 'instrText')) {
          push('\n', {});
          push(c.textContent ?? '', { set: (s) => (c.textContent = s) });
          push('\n', {});
        } else if (is(c, NS.W, 'tab') || is(c, NS.TEXT, 'tab')) push('\t', { fixed: c });
        else if (is(c, NS.W, 'br', 'cr') || is(c, NS.TEXT, 'line-break')) push('\n', { fixed: c });
        else if (is(c, NS.W, 'noBreakHyphen')) push('-', { fixed: c });
        else if (is(c, NS.TEXT, 's')) push(' '.repeat(Math.max(1, Number(c.getAttributeNS(NS.TEXT, 'c') ?? 1) || 1)), { fixed: c });
        else inside(c);
      }
    };
    attrUnits(p);
    const at = units.length;
    // The unit is pushed first so that the units of nested parts come after it.
    add('', { kind: 'para', segs }, role, cell);
    inside(p);
    units[at]!.text = text;
  };

  walk(part.doc.documentElement, undefined, undefined);
}

function writePara(ref: Extract<Ref, { kind: 'para' }>, text: string, edits: readonly UnitEdit[]): void {
  if (!edits.length) return;
  const chars = Array.from({ length: text.length }, (_, i) => text[i]!);
  const writable = (i: number): boolean => ref.segs.some((s) => s.set && s.start <= i && i < s.end);
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    // The replacement goes to the first character of the match that is in a text segment.
    let start = e.start;
    while (start < e.end && !writable(start)) start++;
    if (start >= e.end) continue;
    for (let i = e.start; i < e.end; i++) if (writable(i) || ref.segs.some((s) => s.fixed && s.start <= i && i < s.end)) chars[i] = '';
    chars[start] = e.replacement;
  }
  for (const seg of ref.segs) {
    const next = chars.slice(seg.start, seg.end).join('');
    if (seg.set) {
      if (next !== text.slice(seg.start, seg.end)) seg.set(next);
    } else if (seg.fixed && seg.end > seg.start && next === '') seg.fixed.remove();
  }
}

function applyEdits(text: string, edits: readonly UnitEdit[]): string {
  let out = '';
  let at = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    if (e.start < at) continue;
    out += text.slice(at, e.start) + e.replacement;
    at = e.end;
  }
  return out + text.slice(at);
}

export async function openPackage(bytes: Uint8Array, name: string, opts: OpenOptions = {}): Promise<OpenedDocument> {
  const depth = opts.depth ?? 0;
  const budget = opts.budget ?? { used: 0 };
  const removeLinkable = opts.removeLinkable ?? true;
  const entries = readPackage(bytes, budget);
  const names = new Set(entries.map((e) => e.name));
  const ooxml = names.has('[Content_Types].xml');
  const odf = names.has('mimetype');
  const units: TextUnit[] = [];
  const toCheck: VisualCheck[] = [];
  const removed: string[] = [];
  const states: (XmlState | SubState | { kind: 'keep'; entry: PackageEntry })[] = [];
  const cellOf = new Map<number, TextUnit['cell']>();
  const sharedStrings: number[] = [];
  const prefix = depth ? `${name}!` : '';

  // Shared strings first, so that sheet cells can point at them.
  const ordered = [...entries].sort((a, b) => Number(b.name === 'xl/sharedStrings.xml') - Number(a.name === 'xl/sharedStrings.xml'));
  for (const entry of ordered) {
    await opts.yieldNow?.();
    if (opts.signal?.aborted) throw opts.signal.reason ?? new DOMException('Aborted', 'AbortError');
    const where = prefix + entry.name;
    if (REMOVED.some((re) => re.test(entry.name))) {
      removed.push(where);
      continue;
    }
    if (entry.name === 'mimetype') {
      states.push({ kind: 'keep', entry });
      continue;
    }
    if (looksLikeXml(entry.name, entry.data) || /\.svg$/i.test(entry.name)) {
      const part = parseXmlPart(decodeXml(entry.data), where);
      if (ooxml) unwrapAuthorFields(part.doc);
      if (removeLinkable && ooxml && removeRsids(part.doc) && !removed.includes(`${prefix}rsid`)) removed.push(`${prefix}rsid`);
      if (odf && entry.name === 'settings.xml') {
        for (const item of Array.from(part.doc.getElementsByTagNameNS(NS.CONFIG, 'config-item'))) {
          const n = item.getAttributeNS(NS.CONFIG, 'name');
          if (n === 'PrinterName' || n === 'PrinterSetup' || (removeLinkable && n === 'PrinterPaperFromSetup')) {
            item.remove();
            removed.push(`${where}:${n}`);
          }
        }
      }
      const first = units.length;
      const refs: Ref[] = [];
      collectUnits(part, where, odf, units, refs, cellOf, sharedStrings);
      // The units of the `si` elements, in order: sheet cells point at them by index.
      if (entry.name === 'xl/sharedStrings.xml') refs.forEach((r, k) => r.kind === 'para' && sharedStrings.push(first + k));
      states.push({ kind: 'xml', entry, part, first, refs });
      continue;
    }
    if (isZip(entry.data) && (opts.depth ?? 0) < LIMITS.depth) {
      const sub = await openPackage(entry.data, where, { ...opts, depth: depth + 1, budget });
      const first = units.length;
      units.push(...sub.units);
      toCheck.push(...sub.toCheck);
      removed.push(...sub.removed);
      states.push({ kind: 'sub', entry, doc: sub, first, count: sub.units.length });
      continue;
    }
    if (TEXT_ENTRY.test(entry.name)) {
      const sub = openText(entry.data, entry.name);
      const first = units.length;
      units.push(...sub.units.map((u) => ({ ...u, where })));
      states.push({ kind: 'sub', entry, doc: sub, first, count: sub.units.length });
      continue;
    }
    if (PICTURE.test(entry.name)) {
      if (opts.removePictures) {
        states.push({ kind: 'keep', entry: { ...entry, data: BLANK_PNG } });
        removed.push(`${where} (picture replaced)`);
      } else {
        states.push({ kind: 'keep', entry });
        toCheck.push({ kind: 'picture', where, bytes: entry.data, mime: mimeOf(entry.name) });
      }
      continue;
    }
    const macro = /vbaProject|macros?\//i.test(entry.name);
    if (opts.removePictures && macro) {
      // Removed with its relationship and content type (see write()).
      removed.push(where);
      continue;
    }
    if (opts.removePictures && entry.data.length) {
      states.push({ kind: 'keep', entry: { ...entry, data: new Uint8Array(0) } });
      removed.push(`${where} (object emptied)`);
      continue;
    }
    states.push({ kind: 'keep', entry });
    if (entry.data.length) toCheck.push({ kind: macro ? 'macro' : /embeddings|Object|ObjectReplacements|\.bin$/i.test(entry.name) ? 'object' : 'binary', where });
  }
  for (const [unit, cell] of cellOf) if (!units[unit]!.cell && cell) units[unit]!.cell = cell;

  // Labels of pictures for the report: the alternative texts are in the units already.
  const removedParts = new Set(removed.filter((r) => !r.includes(' (') && !r.includes(':')).map((r) => r.slice(prefix.length)));

  return {
    units,
    toCheck,
    removed,
    outputExtension: name.includes('.') ? `.${name.split('.').pop()}` : '',
    async write(edits) {
      const byUnit = new Map<number, UnitEdit[]>();
      for (const e of edits) byUnit.set(e.unit, [...(byUnit.get(e.unit) ?? []), e]);
      const renames = new Map<string, string>();
      const out: PackageEntry[] = [];
      // 1. Edits.
      for (const s of states) {
        if (s.kind !== 'xml') continue;
        s.refs.forEach((ref, k) => {
          const i = s.first + k;
          const e = byUnit.get(i);
          if (!e?.length) return;
          const text = units[i]!.text;
          if (ref.kind === 'para') writePara(ref, text, e);
          else if (ref.kind === 'leaf') ref.node.data = applyEdits(text, e);
          else {
            const written = applyEdits(text, e);
            const value = ref.transform ? ref.transform(written) : written;
            if (value !== written) renames.set(written, value);
            ref.attr.value = value;
          }
        });
      }
      // 2. References to removed parts and renamed identifiers.
      for (const s of states) {
        if (s.kind !== 'xml') continue;
        const doc = s.part.doc;
        if (s.entry.name === '[Content_Types].xml') {
          for (const o of Array.from(doc.getElementsByTagNameNS(NS.CT, 'Override'))) if (removedParts.has((o.getAttribute('PartName') ?? '').replace(/^\//, ''))) o.remove();
        } else if (s.entry.name.endsWith('.rels')) {
          for (const r of Array.from(doc.getElementsByTagNameNS(NS.REL, 'Relationship'))) {
            if (r.getAttribute('TargetMode') === 'External') continue;
            if (removedParts.has(resolveTarget(s.entry.name, r.getAttribute('Target') ?? ''))) r.remove();
          }
        } else if (s.entry.name === 'META-INF/manifest.xml') {
          for (const f of Array.from(doc.getElementsByTagNameNS(NS.MANIFEST, 'file-entry'))) if (removedParts.has(f.getAttributeNS(NS.MANIFEST, 'full-path') ?? '')) f.remove();
        }
        if (renames.size && s.entry.name.startsWith('xl/')) {
          const fix = (v: string): string => {
            let r = v;
            for (const [from, to] of renames) r = r.split(from).join(to);
            return r;
          };
          for (const tag of ['f', 'definedName']) for (const el of Array.from(doc.getElementsByTagNameNS(NS.SML, tag))) el.textContent = fix(el.textContent ?? '');
          for (const el of Array.from(doc.getElementsByTagNameNS(NS.SML, 'worksheetSource'))) {
            const sheet = el.getAttribute('sheet');
            if (sheet) el.setAttribute('sheet', fix(sheet));
          }
        }
      }
      // 3. Serialise, in the order of the source.
      const done = new Map<string, PackageEntry>();
      for (const s of states) {
        await opts.yieldNow?.();
        if (s.kind === 'keep') done.set(s.entry.name, s.entry);
        else if (s.kind === 'xml') done.set(s.entry.name, { ...s.entry, data: new TextEncoder().encode(serializeXmlPart(s.part)) });
        else {
          const subEdits = edits.filter((e) => e.unit >= s.first && e.unit < s.first + s.count).map((e) => ({ ...e, unit: e.unit - s.first }));
          done.set(s.entry.name, { ...s.entry, data: await s.doc.write(subEdits) });
        }
      }
      for (const e of entries) {
        const d = done.get(e.name);
        if (d) out.push(d);
      }
      return writePackage(out);
    },
  };
}

function mimeOf(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
}
