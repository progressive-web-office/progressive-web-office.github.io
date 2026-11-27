// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { FsError, listFiles, readText } from '../src/fs';
import { ArchiveProvider, archiveBytes } from '../src/archive/provider';
import { detectFormat, isArchive } from '../src/core/format';
import { writeZip } from '../src/core/zip';

const sample = (): Uint8Array =>
  zipSync({
    'Group A/Alice_123/report.docx': strToU8('not really a docx'),
    'Group A/Alice_123/main.c': strToU8('int main(void) { return 0; }\n'),
    'Group A/Bob_456/solution.py': strToU8('print("hello")\n'),
    'Group A/Bob_456/': new Uint8Array(),
    'readme.txt': strToU8('Read me'),
    '__MACOSX/._readme.txt': strToU8('junk'),
    '../evil.txt': strToU8('outside'),
    '/abs.txt': strToU8('absolute'),
  });

describe('FILE-021 archives as folders', () => {
  it('lists the folders and files of an archive, without junk or paths leaving the root', async () => {
    const zip = new ArchiveProvider(sample(), 'work.zip');
    expect(zip.label).toBe('work.zip');
    expect(zip.capabilities).toEqual({ write: true, persistentAccess: false });
    expect((await zip.list('')).map((e) => `${e.kind}:${e.name}`)).toEqual(['directory:Group A', 'file:abs.txt', 'file:readme.txt']);
    expect((await zip.list('Group A')).map((e) => e.name)).toEqual(['Alice_123', 'Bob_456']);
    expect(await listFiles(zip)).toEqual(['Group A/Alice_123/main.c', 'Group A/Alice_123/report.docx', 'Group A/Bob_456/solution.py', 'abs.txt', 'readme.txt']);
    const entry = (await zip.list('Group A/Bob_456'))[0]!;
    expect(entry.size).toBe(15);
  });

  it('reads files on demand and keeps changes in memory', async () => {
    const zip = new ArchiveProvider(sample(), 'work.zip');
    expect(await readText(zip, 'Group A/Bob_456/solution.py')).toBe('print("hello")\n');
    await expect(zip.read('nope.txt')).rejects.toBeInstanceOf(FsError);
    expect(zip.modified).toBe(false);
    await zip.write('Group A/Bob_456/solution.py', new Blob(['print("bye")\n']));
    await zip.move('readme.txt', 'docs/readme.txt');
    await zip.remove('Group A/Alice_123', { recursive: true });
    expect(zip.modified).toBe(true);
    const back = unzipSync(await archiveBytes(zip));
    expect(Object.keys(back).sort()).toEqual(['Group A/Bob_456/solution.py', 'abs.txt', 'docs/readme.txt']);
    expect(new TextDecoder().decode(back['Group A/Bob_456/solution.py'])).toBe('print("bye")\n');
  });

  it('shows archives inside the archive as folders, and writes their changes back', async () => {
    const innermost = zipSync({ 'deep.txt': strToU8('deep') });
    const inner = zipSync({ 'Bob/solution.py': strToU8('print(1)\n'), 'more.zip': innermost });
    const outer = zipSync({ 'Group A/Bob_456_submission.zip': inner, 'readme.txt': strToU8('r') });
    const zip = new ArchiveProvider(outer, 'all.zip');
    const top = await zip.list('Group A');
    expect(top.map((e) => `${e.kind}:${e.name}`)).toEqual(['directory:Bob_456_submission.zip']);
    expect((await zip.list('Group A/Bob_456_submission.zip')).map((e) => e.path)).toEqual(['Group A/Bob_456_submission.zip/Bob', 'Group A/Bob_456_submission.zip/more.zip']);
    expect(await readText(zip, 'Group A/Bob_456_submission.zip/Bob/solution.py')).toBe('print(1)\n');
    expect(await readText(zip, 'Group A/Bob_456_submission.zip/more.zip/deep.txt')).toBe('deep');
    expect((await listFiles(zip)).sort()).toEqual(['Group A/Bob_456_submission.zip/Bob/solution.py', 'Group A/Bob_456_submission.zip/more.zip/deep.txt', 'readme.txt']);
    await zip.write('Group A/Bob_456_submission.zip/more.zip/deep.txt', new Blob(['deeper']));
    await zip.write('Group A/Bob_456_submission.zip/Bob/notes.md', new Blob(['# ok']));
    await expect(zip.move('readme.txt', 'Group A/Bob_456_submission.zip/readme.txt')).rejects.toThrow(/archive/);
    expect(zip.modified).toBe(true);
    const back = unzipSync(await archiveBytes(zip));
    const back2 = unzipSync(back['Group A/Bob_456_submission.zip']!);
    expect(Object.keys(back2).sort()).toEqual(['Bob/notes.md', 'Bob/solution.py', 'more.zip']);
    expect(new TextDecoder().decode(unzipSync(back2['more.zip']!)['deep.txt'])).toBe('deeper');
  });

  it('refuses entries announcing more than the size limit', async () => {
    const zip = new ArchiveProvider(sample(), 'work.zip', { maxFileSize: 10 });
    await expect(zip.read('Group A/Bob_456/solution.py')).rejects.toThrow(/too large/i);
  });

  it('tells plain archives from documents and projects', () => {
    expect(isArchive(sample())).toBe(true);
    expect(detectFormat('work.zip', sample())).toBeNull();
    // A LaTeX project and a ZIP holding one Markdown file keep opening as one document; several notes are a folder (FILE-033).
    const tex = writeZip([{ path: 'main.tex', data: '\\documentclass{article}\\begin{document}x\\end{document}' }, { path: 'fig.png', data: new Uint8Array([1]) }, { path: 'refs.bib', data: '' }]);
    expect(isArchive(tex)).toBe(false);
    expect(detectFormat('p.zip', tex)).toBe('texzip');
    const notes = writeZip([{ path: 'a.md', data: '# A' }, { path: 'img/b.png', data: new Uint8Array([1]) }]);
    expect(isArchive(notes)).toBe(false);
    expect(isArchive(writeZip([{ path: 'a.md', data: '# A' }, { path: 'b.md', data: '# B' }]))).toBe(true);
    // Several LaTeX projects, or LaTeX next to other documents: an archive.
    const many = writeZip([{ path: 'a/main.tex', data: '\\documentclass{article}' }, { path: 'b/main.tex', data: '\\documentclass{article}' }]);
    expect(isArchive(many)).toBe(true);
    const mixed = writeZip([{ path: 'a.md', data: '# A' }, { path: 'b.docx', data: new Uint8Array([1]) }, { path: 'c.py', data: 'x = 1' }]);
    expect(isArchive(mixed)).toBe(true);
    expect(isArchive(strToU8('plain text'))).toBe(false);
  });
});

describe('FILE-022 text and source files, FILE-023 pictures', () => {
  const text = (s: string): Uint8Array => strToU8(s);
  it('detects text and source code by extension, pictures by signature', () => {
    for (const name of ['a.txt', 'main.c', 'x.h', 'p.cpp', 'q.hpp', 's.py', 'Main.java', 'app.js', 'm.ts', 'data.json', 'page.html', 'style.css', 'run.sh', 'stats.r', 'calc.m', 'lib.rs', 'go.go', 'q.sql', 'conf.yaml', 'notes.log', 'refs.bib', 'Makefile', 'Dockerfile']) {
      expect(detectFormat(name, text('content\n')), name).toBe('text');
    }
    expect(detectFormat('readme.md', text('# x'))).toBe('md');
    expect(detectFormat('data.csv', text('a,b'))).toBe('csv');
    expect(detectFormat('binary.c', new Uint8Array([0, 1, 2]))).toBeNull();
    expect(detectFormat('a.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image');
    expect(detectFormat('a.jpg', new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image');
    expect(detectFormat('a.gif', strToU8('GIF89a...'))).toBe('image');
    expect(detectFormat('a.webp', strToU8('RIFF\0\0\0\0WEBPVP8 '))).toBe('image');
    expect(detectFormat('a.svg', text('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image');
    expect(detectFormat('blob.bin', new Uint8Array([0, 1, 2]))).toBeNull();
  });
});

describe('FILE-022 text files: encoding and colouring', async () => {
  const { decodeText, encodeText } = await import('../src/files/text-view');
  const { languageOf } = await import('../src/files/languages');
  it('keeps the BOM and the line ends, reads Windows-1252 files', () => {
    const crlf = decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...strToU8('a\r\nb\r\n')]));
    expect(crlf).toEqual({ text: 'a\nb\n', encoding: 'utf-8', bom: true, crlf: true });
    expect(Array.from(encodeText('a\nc\n', crlf))).toEqual([0xef, 0xbb, 0xbf, ...strToU8('a\r\nc\r\n')]);
    expect(decodeText(new Uint8Array([0x63, 0x61, 0x66, 0xe9])).text).toBe('café');
  });
  it('finds the language of a file by its name', async () => {
    expect(languageOf('main.c')?.name).toBe('C');
    expect(languageOf('solution.py')?.name).toBe('Python');
    expect(languageOf('Makefile')?.name).toBe('Makefile');
    expect(languageOf('Main.java')?.name).toBe('Java');
    expect(languageOf('script.m')?.name).toBe('MATLAB / Octave');
    expect(languageOf('notes.txt')).toBeUndefined();
    expect(await languageOf('main.c')!.load()).toBeTruthy();
    expect(await languageOf('stats.r')!.load()).toBeTruthy();
  });
});

describe('FILE-024 review comments in source files', async () => {
  const { reviewComments, reviewLine } = await import('../src/files/review');
  it('writes a comment of the language and reads it back', () => {
    expect(reviewLine({ line: '#' }, 'Ann (prof)', 'Use a loop\nhere', '    ')).toBe('    # REVIEW(Ann prof): Use a loop here');
    expect(reviewLine({ block: { open: '/*', close: '*/' } }, 'Bob', 'Free this')).toBe('/* REVIEW(Bob): Free this */');
    expect(reviewLine({ block: { open: '<!--', close: '-->' } }, 'Bob', 'Alt text')).toBe('<!-- REVIEW(Bob): Alt text -->');
    const code = 'int main() {\n  // REVIEW(Ann): Check argc\n  /* REVIEW(Bob): Free this */\n  return 0;\n}\n<!-- REVIEW(Cy): Fine -->';
    expect(reviewComments(code)).toEqual([
      { line: 2, author: 'Ann', text: 'Check argc' },
      { line: 3, author: 'Bob', text: 'Free this' },
      { line: 6, author: 'Cy', text: 'Fine' },
    ]);
  });
});
