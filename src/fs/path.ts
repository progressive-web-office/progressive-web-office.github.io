/** Paths of the file system module: `/`-separated, relative to a provider root. */
import { FsError } from './types';

/** `a//b/./c/../d/` → `a/b/d`; refuses to climb above the root. */
export function normalize(path: string): string {
  const out: string[] = [];
  for (const seg of path.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (!out.length) throw new FsError('Invalid', path, `Path leaves the root: ${path}`);
      out.pop();
    } else out.push(seg);
  }
  return out.join('/');
}

export const join = (...parts: string[]): string => normalize(parts.filter(Boolean).join('/'));
export const dirname = (path: string): string => {
  const p = normalize(path);
  return p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
};
export const basename = (path: string): string => normalize(path).split('/').pop() ?? '';
export const extname = (path: string): string => {
  const b = basename(path);
  const i = b.lastIndexOf('.');
  return i > 0 ? b.slice(i).toLowerCase() : '';
};

/** `target` as written from a file at `from` (`../b/c.md`). */
export function relative(from: string, target: string): string {
  const a = dirname(from).split('/').filter(Boolean);
  const b = normalize(target).split('/');
  let common = 0;
  while (common < a.length && common < b.length - 1 && a[common] === b[common]) common++;
  return [...Array(a.length - common).fill('..'), ...b.slice(common)].join('/');
}

/** A link `href` written in the file at `from`, as a path from the root. */
export const resolve = (from: string, href: string): string => (href.startsWith('/') ? normalize(href) : join(dirname(from), href));

/** How many folders `a` and `b` have in common, from the root. */
function sharedFolders(a: string, b: string): number {
  const x = dirname(a).split('/').filter(Boolean);
  const y = dirname(b).split('/').filter(Boolean);
  let n = 0;
  while (n < x.length && n < y.length && x[n]!.toLowerCase() === y[n]!.toLowerCase()) n++;
  return n;
}

/** The candidate nearest to `from`: most folders in common, then the shallowest, then by name. */
export function nearestPath(candidates: readonly string[], from: string): string | undefined {
  return [...candidates].sort((a, b) => sharedFolders(b, from) - sharedFolders(a, from) || a.split('/').length - b.split('/').length || a.localeCompare(b))[0];
}

/**
 * FOLDER-033: the file a link, an embed, a picture or a canvas names, among
 * `paths` (the files of the folder), seen from the file at `from`. In order:
 * the path relative to `from`; the path from the root of the folder; a file
 * whose path ends with it (a path from the root of notes kept in a folder of
 * an archive); a file of the same name. Several candidates: the nearest to
 * `from`. Names compare without case, encoded or not; `extensions` are tried
 * when the name has none (`.md` for a note).
 */
export function findPath(target: string, from: string, paths: readonly string[], extensions: readonly string[] = []): string | undefined {
  let t = target.trim().replace(/\\/g, '/');
  try {
    t = decodeURI(t);
  } catch {
    /* kept as written */
  }
  if (!t || t === '/') return undefined;
  const lower = new Map<string, string[]>();
  for (const p of paths) {
    const k = p.toLowerCase();
    lower.set(k, [...(lower.get(k) ?? []), p]);
  }
  const last = (p: string): string => p.split('/').pop() ?? '';
  const names = [t, ...(/\.[^./]+$/.test(last(t)) ? [] : extensions.map((e) => t + e))];
  const exact = (path: string): string | undefined => lower.get(path.toLowerCase())?.[0];
  for (const name of names) {
    // 1. Relative to the file naming it (a path from the root when it starts with /).
    let near: string | undefined;
    try {
      near = name.startsWith('/') ? undefined : join(dirname(from), name);
    } catch {
      near = undefined;
    }
    const found = (near && exact(near)) ?? (() => {
      // 2. From the root of the folder.
      try {
        return exact(normalize(name));
      } catch {
        return undefined;
      }
    })();
    if (found) return found;
  }
  for (const name of names) {
    // 3. A file whose path ends with the path named.
    const tail = `/${name.replace(/^\/+/, '').replace(/^(\.\.?\/)+/, '').toLowerCase()}`;
    const ending = paths.filter((p) => `/${p.toLowerCase()}`.endsWith(tail));
    if (ending.length) return nearestPath(ending, from);
  }
  for (const name of names) {
    // 4. A file of the same name.
    const base = last(name).toLowerCase();
    const same = paths.filter((p) => last(p).toLowerCase() === base);
    if (same.length) return nearestPath(same, from);
  }
  return undefined;
}

/** Whether `path` is `dir` or inside it. */
export const isInside = (path: string, dir: string): boolean => !dir || path === dir || path.startsWith(`${dir}/`);

/** Names a file system accepts on every platform. */
export function checkName(name: string): string {
  const n = name.trim();
  if (!n || n === '.' || n === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(n)) throw new FsError('Invalid', name, `Invalid name: ${name}`);
  return n;
}

export const byKindThenName = (a: { kind: string; name: string }, b: { kind: string; name: string }): number =>
  a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.kind === 'directory' ? -1 : 1;
