/**
 * PSEUDO-032: a ZIP reader for untrusted packages. The central directory is
 * read first (entry count, names, flags), then each entry is inflated in
 * chunks while its real size is counted, so that a zip bomb or a lying header
 * is refused before it fills the memory.
 */
import { Inflate, zipSync, type Zippable } from 'fflate';
import { LIMITS, Refusal } from '../limits';

export interface PackageEntry {
  name: string;
  data: Uint8Array;
  /** Stored without compression in the source (kept so for `mimetype`). */
  stored: boolean;
}

/** Bytes counted across a package and the packages inside it. */
export interface Budget {
  used: number;
}

interface CentralEntry {
  name: string;
  flags: number;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const CHUNK = 64 * 1024;

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** An entry name that stays inside the package. */
export function safeEntryName(name: string): boolean {
  if (!name || name.includes('\0') || name.includes('\\')) return false;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  return !name.split('/').some((seg) => seg === '..');
}

function centralDirectory(bytes: Uint8Array): CentralEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end of central directory record is in the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Refusal('not-a-package', 'no end of central directory');
  const count = view.getUint16(eocd + 10, true);
  const offset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || offset === 0xffffffff) throw new Refusal('not-a-package', 'ZIP64 is not supported');
  if (count > LIMITS.entries) throw new Refusal('too-many-entries', String(count));
  const entries: CentralEntry[] = [];
  const decoder = new TextDecoder();
  let at = offset;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) throw new Refusal('not-a-package', 'bad central directory');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw new Refusal('not-a-package', 'ZIP64 is not supported');
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    entries.push({ name, flags, method, compressedSize, size, localOffset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function inflateCounted(data: Uint8Array, name: string, declared: number, budget: Budget): Uint8Array {
  const chunks: Uint8Array[] = [];
  let total = 0;
  const inflate = new Inflate((chunk) => {
    total += chunk.length;
    budget.used += chunk.length;
    if (total > LIMITS.entryBytes) throw new Refusal('entry-too-large', name);
    if (budget.used > LIMITS.totalBytes) throw new Refusal('too-large-uncompressed', name);
    if (total > declared) throw new Refusal('size-mismatch', name);
    if (total > LIMITS.ratioFrom && total > LIMITS.ratio * Math.max(1, data.length)) throw new Refusal('ratio', name);
    chunks.push(chunk);
  });
  for (let i = 0; i < data.length; i += CHUNK) inflate.push(data.subarray(i, i + CHUNK), i + CHUNK >= data.length);
  if (data.length === 0) inflate.push(new Uint8Array(0), true);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Read a package, refusing it (Refusal) when it breaks a limit of PSEUDO-032. */
export function readPackage(bytes: Uint8Array, budget: Budget = { used: 0 }): PackageEntry[] {
  if (!isZip(bytes)) throw new Refusal('not-a-package');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const seen = new Set<string>();
  const out: PackageEntry[] = [];
  for (const e of centralDirectory(bytes)) {
    if (!safeEntryName(e.name)) throw new Refusal('unsafe-name', e.name);
    if (seen.has(e.name)) throw new Refusal('duplicate', e.name);
    seen.add(e.name);
    if (e.flags & 1) throw new Refusal('encrypted', e.name);
    if (e.name.endsWith('/')) continue;
    if (e.size > LIMITS.entryBytes) throw new Refusal('entry-too-large', e.name);
    const at = e.localOffset;
    if (at + 30 > bytes.length || view.getUint32(at, true) !== LOCAL) throw new Refusal('not-a-package', `bad local header for ${e.name}`);
    if (view.getUint16(at + 6, true) & 1) throw new Refusal('encrypted', e.name);
    const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
    const raw = bytes.subarray(start, start + e.compressedSize);
    if (raw.length !== e.compressedSize) throw new Refusal('not-a-package', `truncated ${e.name}`);
    let data: Uint8Array;
    if (e.method === 0) {
      if (e.compressedSize !== e.size) throw new Refusal('size-mismatch', e.name);
      budget.used += e.size;
      if (budget.used > LIMITS.totalBytes) throw new Refusal('too-large-uncompressed', e.name);
      data = raw.slice();
    } else if (e.method === 8) {
      data = inflateCounted(raw, e.name, e.size, budget);
      if (data.length !== e.size) throw new Refusal('size-mismatch', e.name);
    } else {
      throw new Refusal('unsupported-compression', e.name);
    }
    out.push({ name: e.name, data, stored: e.method === 0 });
  }
  return out;
}

/** Write a package, entries in the given order (`mimetype` first and stored for ODF). */
export function writePackage(entries: readonly PackageEntry[]): Uint8Array {
  const files: Zippable = {};
  for (const e of entries) files[e.name] = [e.data, { level: e.stored ? 0 : 6 }];
  return zipSync(files);
}
