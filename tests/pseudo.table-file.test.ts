import { describe, expect, it } from 'vitest';
import { allowWriting, canWriteFiles, chooseNewTableFile, chooseTableToOpen, writeTableFile, type FilePickers, type TableFileHandle } from '../src/pseudo/table-file';

function handle(name: string, permission: PermissionState = 'granted', answer: PermissionState = 'granted'): TableFileHandle & { data: Uint8Array; asked: number } {
  const h = {
    kind: 'file' as const,
    name,
    data: new Uint8Array([7]) as Uint8Array,
    asked: 0,
    getFile: async () => new Blob([h.data as BlobPart]),
    createWritable: async () => ({
      write: async (d: Blob | Uint8Array) => void (h.data = d instanceof Uint8Array ? d : new Uint8Array(await d.arrayBuffer())),
      close: async () => {},
    }),
    queryPermission: async () => permission,
    requestPermission: async () => {
      h.asked++;
      permission = answer;
      return answer;
    },
  };
  return h;
}

const abort = (): never => {
  throw Object.assign(new Error('cancelled'), { name: 'AbortError' });
};

describe('PSEUDO-042 the file of the mapping table', () => {
  it('lets the user choose the file of a new table where the browser can write files', async () => {
    const file = handle('classe.kdbx');
    const w: FilePickers = { showSaveFilePicker: async (o) => (expect(o.suggestedName).toBe('table.kdbx'), file) };
    expect(canWriteFiles(w)).toBe(true);
    expect(await chooseNewTableFile('table.kdbx', w)).toBe(file);
    expect(await chooseNewTableFile('table.kdbx', { showSaveFilePicker: async () => abort() })).toBeNull();
    expect(canWriteFiles({})).toBe(false);
    expect(await chooseNewTableFile('table.kdbx', {})).toBeNull();
  });
  it('opens a table with its handle, or only its bytes elsewhere', async () => {
    const file = handle('t.kdbx');
    const opened = await chooseTableToOpen(async () => undefined, { showOpenFilePicker: async () => [file] });
    expect(opened).toMatchObject({ name: 't.kdbx', handle: file });
    expect([...opened!.bytes]).toEqual([7]);
    const plain = await chooseTableToOpen(async () => new File([new Uint8Array([1, 2])], 'u.kdbx'), {});
    expect(plain).toEqual({ name: 'u.kdbx', bytes: new Uint8Array([1, 2]) });
    expect(await chooseTableToOpen(async () => undefined, { showOpenFilePicker: async () => abort() })).toBeNull();
  });
  it('writes the table again without asking once writing is allowed', async () => {
    const file = handle('t.kdbx');
    expect(await writeTableFile(file, new Uint8Array([1, 2, 3]))).toBe(true);
    expect([...file.data]).toEqual([1, 2, 3]);
    expect(file.asked).toBe(0);
  });
  it('asks to write to an opened table, and never writes when it is refused', async () => {
    const refused = handle('t.kdbx', 'prompt', 'denied');
    expect(await writeTableFile(refused, new Uint8Array([9]))).toBe(false);
    expect(await allowWriting(refused)).toBe(false);
    expect(refused.asked).toBe(1);
    expect([...refused.data]).toEqual([7]);
    const allowed = handle('t.kdbx', 'prompt', 'granted');
    expect(await allowWriting(allowed)).toBe(true);
    expect(await writeTableFile(allowed, new Uint8Array([4]))).toBe(true);
  });
});
