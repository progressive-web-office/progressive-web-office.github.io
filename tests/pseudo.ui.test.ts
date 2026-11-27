import { describe, expect, it, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { zh } from '../src/i18n/zh';
import { acknowledgeNotice, loadOptions, noticeAcknowledged, NOTICE_VERSION, parseList, rememberColumns, rememberedColumns, saveOptions } from '../src/pseudo/settings';
import { excludedInput, folderFiles, folderProblem, MARKER, type FileEntryHandle, type FolderHandle } from '../src/pseudo/folders';
import { forgetTable, rememberedTable, rememberTable } from '../src/pseudo/table';
import { DEFAULT_OPTIONS } from '../src/pseudo/pipeline';

describe('PSEUDO-001 vocabulary', () => {
  it('never calls the feature anonymous, in any language (search keywords aside)', () => {
    for (const catalog of [en, fr, zh] as Record<string, string>[]) {
      for (const [key, value] of Object.entries(catalog)) {
        if (!key.startsWith('pseudo.') || key === 'pseudo.keywords') continue;
        expect(value, key).not.toMatch(/anonym|匿名/i);
      }
    }
  });
  it('the guide page does not either', () => {
    const guide = readFileSync('docs/guide/pseudonymisation.md', 'utf8');
    expect(guide).toMatch(/pseudonymis/);
    expect(guide).not.toMatch(/anonym|匿名/i);
  });
});

describe('PSEUDO-002 the notice', () => {
  beforeEach(() => localStorage.clear());
  it('is acknowledged once per version', () => {
    expect(noticeAcknowledged()).toBe(false);
    acknowledgeNotice();
    expect(noticeAcknowledged()).toBe(true);
    localStorage.setItem('pwo.pseudo.notice', JSON.stringify({ version: NOTICE_VERSION - 1 }));
    expect(noticeAcknowledged()).toBe(false);
  });
  it('keeps the options and the lists of the user, nothing personal', () => {
    saveOptions({ ...DEFAULT_OPTIONS, firstNameAlone: true, exclusions: parseList('Carnot, Watt\nOhm') });
    expect(loadOptions()).toMatchObject({ firstNameAlone: true, exclusions: ['Carnot', 'Watt', 'Ohm'] });
    expect(Object.keys(JSON.parse(localStorage.getItem('pwo.pseudo')!))).toEqual(Object.keys(DEFAULT_OPTIONS));
  });
});

describe('PSEUDO-016 no copy of the table in clear', () => {
  beforeEach(() => localStorage.clear());
  it('keeps nothing in this browser without the application lock', async () => {
    expect(await rememberTable(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(localStorage.getItem('pwo.pseudo.table')).toBeNull();
  });
  it('drops a copy that is not sealed', async () => {
    localStorage.setItem('pwo.pseudo.table', btoa('clear'));
    expect(await rememberedTable()).toBeNull();
    expect(localStorage.getItem('pwo.pseudo.table')).toBeNull();
    forgetTable();
  });
});

/** An in-memory folder tree with the File System Access methods the guard uses. */
function tree(paths: Record<string, string>, root = ''): FolderHandle {
  const dirs = new Map<string, FolderHandle>();
  const make = (prefix: string, name: string): FolderHandle => {
    const existing = dirs.get(prefix);
    if (existing) return existing;
    const handle: FolderHandle = {
      kind: 'directory',
      name,
      async isSameEntry(other) {
        return other === handle;
      },
      async resolve(other) {
        for (const [p, d] of dirs) if (d === other && p.startsWith(prefix) && p !== prefix) return p.slice(prefix.length).split('/').filter(Boolean);
        return other === handle ? [] : null;
      },
      async *values() {
        const seen = new Set<string>();
        for (const path of Object.keys(paths)) {
          if (!path.startsWith(prefix)) continue;
          const head = path.slice(prefix.length).split('/')[0]!;
          if (seen.has(head)) continue;
          seen.add(head);
          if (path.slice(prefix.length).includes('/')) yield make(`${prefix}${head}/`, head);
          else yield { kind: 'file', name: head, getFile: async () => new Blob([paths[path]!]), createWritable: async () => ({ write: async () => {}, close: async () => {} }) } satisfies FileEntryHandle;
        }
      },
      async getFileHandle() {
        throw new Error('not used');
      },
      async getDirectoryHandle(n) {
        return make(`${prefix}${n}/`, n);
      },
    };
    dirs.set(prefix, handle);
    return handle;
  };
  return make(root, 'root');
}

describe('PSEUDO-029 input and output folders', () => {
  it('refuses the same folder, an output inside the input, an input inside the output, and a folder that is not empty', async () => {
    const root = tree({ 'in/a.docx': 'x', 'in/out/old.txt': 'y' });
    const input = await root.getDirectoryHandle('in');
    const inner = await input.getDirectoryHandle('out');
    expect(await folderProblem(input, input)).toBe('same');
    expect(await folderProblem(input, inner)).toBe('inside');
    expect(await folderProblem(inner, input)).toBe('contains');
    const other = tree({ 'b/x.txt': 'z', 'c/.pwo-pseudonymised': '' });
    expect(await folderProblem(input, await other.getDirectoryHandle('b'))).toBe('not-empty');
    expect(await folderProblem(input, await other.getDirectoryHandle('c'))).toBeNull();
    expect(await folderProblem({ ...input, resolve: undefined }, inner)).toBe('unknown');
  });
  it('leaves out the list, the tables, the outputs of a run and hidden files', async () => {
    const root = tree({ 'a.docx': '', 'sub/b.odt': '', 'liste.csv': '', 'table.kdbx': '', 'ETU-012.docx': '', 'ETU-012_ETU-047.odt': '', 'copy-003.pdf': '', '.hidden.docx': '', '~$a.docx': '', [MARKER]: '' });
    const files = await folderFiles(root, (p) => excludedInput(p, 'liste.csv', 'ETU-'));
    expect(files.map((f) => f.path)).toEqual(['a.docx', 'sub/b.odt']);
  });
});

describe('PSEUDO-038 columns remembered for the same headers', () => {
  beforeEach(() => localStorage.clear());
  it('proposes again the columns chosen for lists with the same headers, keeping only the headers', () => {
    const headers = ['N° étudiant', 'NOM Prénom', 'Courriel'];
    expect(rememberedColumns(headers)).toBeUndefined();
    rememberColumns(headers, { header: 2, fullName: 1, order: 'last-first', email: 2, number: 0 });
    expect(rememberedColumns(['n° ETUDIANT', 'nom prénom ', 'courriel'])).toEqual({ fullName: 1, order: 'last-first', email: 2, number: 0 });
    expect(rememberedColumns(['Nom', 'Prénom'])).toBeUndefined();
    expect(localStorage.getItem('pwo.pseudo.columns')).not.toMatch(/Martin|Léa/);
  });
});
