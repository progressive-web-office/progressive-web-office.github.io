/**
 * PSEUDO-042: the file of the mapping table. Where the browser can write
 * files (File System Access API), a new table gets its file when it is
 * created, and the table is written there again after each run; an opened
 * table is updated in its own file once the user has allowed writing to it.
 * Elsewhere the table is downloaded after each run.
 */

export interface TableFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<Blob>;
  createWritable(): Promise<{ write(data: Blob | Uint8Array): Promise<void>; close(): Promise<void> }>;
  queryPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(opts: { mode: 'readwrite' }): Promise<PermissionState>;
}

interface PickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
  id?: string;
}

export interface FilePickers {
  showSaveFilePicker?(opts: PickerOptions): Promise<TableFileHandle>;
  showOpenFilePicker?(opts: PickerOptions): Promise<TableFileHandle[]>;
}

const TYPES = [{ description: 'KDBX', accept: { 'application/x-keepass2': ['.kdbx'] } }];
const pickers = (): FilePickers => window as unknown as FilePickers;

/** Whether a new table can get its file when it is created. */
export const canWriteFiles = (w: FilePickers = pickers()): boolean => typeof w.showSaveFilePicker === 'function';

const cancelled = (e: unknown): boolean => (e as { name?: string })?.name === 'AbortError';

/** The file of a new table, chosen by the user; null if they cancelled or the browser cannot. */
export async function chooseNewTableFile(suggestedName: string, w: FilePickers = pickers()): Promise<TableFileHandle | null> {
  if (!w.showSaveFilePicker) return null;
  try {
    return await w.showSaveFilePicker({ suggestedName, types: TYPES, id: 'pwo-pseudo-table' });
  } catch (e) {
    if (cancelled(e)) return null;
    throw e;
  }
}

/** A table file to open: its handle where the browser gives one (so it can be updated), else only its bytes. */
export async function chooseTableToOpen(
  fallback: () => Promise<File | undefined>,
  w: FilePickers = pickers(),
): Promise<{ name: string; bytes: Uint8Array; handle?: TableFileHandle } | null> {
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: TYPES, id: 'pwo-pseudo-table' });
      if (!handle) return null;
      return { name: handle.name, bytes: new Uint8Array(await (await handle.getFile()).arrayBuffer()), handle };
    } catch (e) {
      if (cancelled(e)) return null;
      throw e;
    }
  }
  const file = await fallback();
  return file ? { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) } : null;
}

/** Ask to write to the file (call it from a click: the browser may ask the user). */
export async function allowWriting(handle: TableFileHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!handle.requestPermission) return false;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

/** Write the table to its file, without asking: false when writing is not allowed or fails. */
export async function writeTableFile(handle: TableFileHandle, bytes: Uint8Array): Promise<boolean> {
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    const w = await handle.createWritable();
    await w.write(bytes);
    await w.close();
    return true;
  } catch {
    return false;
  }
}
