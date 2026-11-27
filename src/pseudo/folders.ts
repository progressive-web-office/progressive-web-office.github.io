/**
 * PSEUDO-029: a folder to an output folder. The output folder must be neither
 * the input folder, nor inside it, nor contain it, and be empty (or hold the
 * outputs of an earlier run); the list, the mapping tables and earlier
 * outputs are never taken as inputs.
 */
export interface FolderHandle {
  kind: 'directory';
  name: string;
  isSameEntry?(other: unknown): Promise<boolean>;
  resolve?(possibleDescendant: unknown): Promise<string[] | null>;
  values(): AsyncIterable<FolderHandle | FileEntryHandle>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileEntryHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FolderHandle>;
}

export interface FileEntryHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<Blob>;
  createWritable(): Promise<{ write(data: Blob | Uint8Array): Promise<void>; close(): Promise<void> }>;
}

/** A file holding no personal data, that marks a folder as an output of the pseudonymisation. */
export const MARKER = '.pwo-pseudonymised';

export type FolderProblem = 'same' | 'inside' | 'contains' | 'unknown' | 'not-empty';

/** Why the output folder cannot be used with this input folder, or null. */
export async function folderProblem(input: FolderHandle, output: FolderHandle): Promise<FolderProblem | null> {
  if (!input.isSameEntry || !input.resolve || !output.resolve) return 'unknown';
  if (await input.isSameEntry(output)) return 'same';
  if ((await input.resolve(output)) !== null) return 'inside';
  if ((await output.resolve(input)) !== null) return 'contains';
  for await (const e of output.values()) if (e.name !== MARKER) return 'not-empty';
  return null;
}

/** PSEUDO-044: an output folder for inputs that are not on the disk: it must be empty (or hold an earlier run). */
export async function outputProblem(output: FolderHandle): Promise<FolderProblem | null> {
  for await (const e of output.values()) if (e.name !== MARKER) return 'not-empty';
  return null;
}

export interface FolderFile {
  path: string;
  file: FileEntryHandle;
}

/** The files of a folder, depth first, leaving out what must never be an input. */
export async function folderFiles(dir: FolderHandle, exclude: (path: string) => boolean, prefix = '', depth = 0): Promise<FolderFile[]> {
  const out: FolderFile[] = [];
  if (depth > 16) return out;
  for await (const e of dir.values()) {
    if (e.name.startsWith('.') || e.name.startsWith('~$')) continue;
    const path = prefix + e.name;
    if (e.kind === 'directory') out.push(...(await folderFiles(e, exclude, `${path}/`, depth + 1)));
    else if (!exclude(path)) out.push({ path, file: e });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** Inputs never taken: mapping tables, the list of people, outputs of a run. */
export function excludedInput(path: string, listName: string | undefined, prefix: string): boolean {
  const name = path.split('/').pop() ?? path;
  if (/\.kdbx$/i.test(name) || name === MARKER) return true;
  if (listName && name === listName) return true;
  const p = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:${p}\\d{3,5}(?:_${p}\\d{3,5})*|copy-\\d{3})(?:-\\d+)?\\.[a-z0-9]+$`, 'i').test(name);
}

export async function writeOutput(dir: FolderHandle, name: string, bytes: Uint8Array): Promise<void> {
  const file = await dir.getFileHandle(name, { create: true });
  const w = await file.createWritable();
  await w.write(bytes);
  await w.close();
}
