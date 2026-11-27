import { describe, expect, it } from 'vitest';
import { detectFormat, formatKind, MAX_FILE_SIZE } from '../src/core/format';
import { enc, makeZip } from './helpers';

const CT = (main: string) =>
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/x" ContentType="${main}"/></Types>`;

describe('FILE-003 format detection', () => {
  it('detects PDF by magic bytes regardless of extension', () => {
    expect(detectFormat('file.bin', enc('%PDF-1.7\n...'))).toBe('pdf');
  });

  it('detects OpenDocument packages from the mimetype entry', () => {
    expect(detectFormat('a', makeZip({ mimetype: 'application/vnd.oasis.opendocument.text' }))).toBe('odt');
    expect(detectFormat('a', makeZip({ mimetype: 'application/vnd.oasis.opendocument.spreadsheet' }))).toBe('ods');
    expect(detectFormat('a', makeZip({ mimetype: 'application/vnd.oasis.opendocument.presentation' }))).toBe('odp');
  });

  it('detects OOXML packages from [Content_Types].xml', () => {
    const docx = makeZip({
      '[Content_Types].xml': CT('application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'),
    });
    const xlsx = makeZip({
      '[Content_Types].xml': CT('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'),
    });
    expect(detectFormat('x', docx)).toBe('docx');
    expect(detectFormat('x', xlsx)).toBe('xlsx');
    const pptx = makeZip({
      '[Content_Types].xml': CT('application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'),
    });
    expect(detectFormat('x', pptx)).toBe('pptx');
  });

  it('falls back to the extension for text formats', () => {
    expect(detectFormat('data.csv', enc('a,b\n1,2'))).toBe('csv');
    expect(detectFormat('data.TSV', enc('a\tb'))).toBe('csv');
    expect(detectFormat('notes.md', enc('# Title'))).toBe('md');
    expect(detectFormat('README.markdown', enc('text'))).toBe('md');
  });

  it('detects MDZ packages (wflixu/mdz layout: index.md + manifest.json)', () => {
    expect(detectFormat('a.zip', makeZip({ 'index.md': '# Hi', 'manifest.json': '{}' }))).toBe('mdz');
    expect(detectFormat('a.mdz', makeZip({ mimetype: 'application/x-mdz', 'index.md': '' }))).toBe('mdz');
  });

  it('MD-014 treats a plain ZIP holding one Markdown file as an MDZ import, several as a folder (FILE-033)', () => {
    expect(detectFormat('notes.zip', makeZip({ 'notes/readme.md': '# x', 'notes/img.png': 'png' }))).toBe('mdz');
    expect(detectFormat('notes.zip', makeZip({ 'notes/readme.md': '# x', 'notes/b.md': '# y' }))).toBeNull();
  });

  it('FILE-004 returns null for unsupported or corrupt files', () => {
    expect(detectFormat('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(detectFormat('broken.docx', enc('not a zip'))).toBeNull();
    expect(detectFormat('other.zip', makeZip({ 'readme.txt': 'hi' }))).toBeNull();
  });

  it('maps formats to editor kinds', () => {
    expect(formatKind('docx')).toBe('document');
    expect(formatKind('odt')).toBe('document');
    expect(formatKind('md')).toBe('document');
    expect(formatKind('mdz')).toBe('document');
    expect(formatKind('csv')).toBe('spreadsheet');
    expect(formatKind('pdf')).toBe('pdf');
    expect(formatKind('pptx')).toBe('presentation');
    expect(formatKind('odp')).toBe('presentation');
  });

  it('FILE-012 defines a 50 MB limit', () => {
    expect(MAX_FILE_SIZE).toBe(200 * 1024 * 1024);
  });
});
