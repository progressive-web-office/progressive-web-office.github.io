/** Document format detection (FILE-003, FILE-004). */
import { strFromU8, unzipSync } from 'fflate';
import { readZipText, type ZipEntries } from './zip';
import { isMarimo } from '../document/marimo-detect';

const EMPTY = new Uint8Array();
import { t } from '../i18n';

export type DocumentFormat = 'docx' | 'odt' | 'md' | 'mdz' | 'tex' | 'texzip' | 'jl' | 'marimo' | 'xlsx' | 'ods' | 'csv' | 'pptx' | 'odp' | 'pdf' | 'text' | 'image' | 'sqlite' | 'kdbx';
/** `file`: text and source files (FILE-022) and pictures (FILE-023), which keep their own name and extension. */
export type DocumentKind = 'document' | 'spreadsheet' | 'presentation' | 'pdf' | 'file';

/** Maximum accepted file size (FILE-012). */
export const MAX_FILE_SIZE = 200 * 1024 * 1024;
/** Maximum size of a ZIP archive opened as a folder (FILE-021); its files are read one at a time. */
export const MAX_ARCHIVE_SIZE = 1024 * 1024 * 1024;

export const MIME_TYPES: Record<DocumentFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  md: 'text/markdown',
  mdz: 'application/x-mdz',
  tex: 'application/x-tex',
  jl: 'text/x-julia',
  marimo: 'text/x-python',
  texzip: 'application/zip',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  pdf: 'application/pdf',
  text: 'text/plain',
  image: 'application/octet-stream',
  sqlite: 'application/vnd.sqlite3',
  kdbx: 'application/x-keepass2',
};

/** Human-readable, translated format name. */
export function formatLabel(format: DocumentFormat): string {
  return t(`format.${format}`);
}


/** File extensions accepted by the open dialog. */
export const ACCEPTED_EXTENSIONS = ['.docx', '.odt', '.md', '.markdown', '.mdz', '.textpack', '.tex', '.jl', '.zip', '.xlsx', '.ods', '.csv', '.tsv', '.pptx', '.odp', '.pdf', '.ott', '.ots', '.otp', '.dotx', '.xltx', '.potx', '.txt', '.c', '.h', '.cpp', '.hpp', '.py', '.java', '.js', '.ts', '.json', '.html', '.css', '.mcd', '.sqlite', '.sqlite3', '.db', '.kdbx', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ora'];

export function formatKind(format: DocumentFormat): DocumentKind {
  switch (format) {
    case 'docx':
    case 'odt':
    case 'md':
    case 'mdz':
    case 'tex':
    case 'texzip':
    case 'jl':
    case 'marimo':
      return 'document';
    case 'xlsx':
    case 'ods':
    case 'csv':
      return 'spreadsheet';
    case 'pptx':
    case 'odp':
      return 'presentation';
    case 'pdf':
      return 'pdf';
    case 'text':
    case 'image':
    case 'sqlite':
    case 'kdbx':
      return 'file';
  }
}

/** Formats a document of the given kind can be saved to. */
/** Formats a document can be saved in, the preferred family first (FILE-016). */
export function saveFormatsFor(kind: DocumentKind, family: 'open' | 'microsoft' = 'open'): DocumentFormat[] {
  const pair = (open: DocumentFormat, ms: DocumentFormat): DocumentFormat[] => (family === 'open' ? [open, ms] : [ms, open]);
  if (kind === 'document') return [...pair('odt', 'docx'), 'md', 'mdz', 'tex', 'texzip', 'jl', 'marimo'];
  if (kind === 'spreadsheet') return [...pair('ods', 'xlsx'), 'csv'];
  if (kind === 'presentation') return pair('odp', 'pptx');
  if (kind === 'file') return [];
  return ['pdf'];
}

const startsWith = (bytes: Uint8Array, sig: number[]): boolean =>
  sig.every((b, i) => bytes[i] === b);

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
};

/** File extension used when saving a format. */
export function fileExtension(format: DocumentFormat): string {
  return format === 'texzip' ? 'zip' : format === 'text' ? 'txt' : format === 'image' ? 'png' : format === 'marimo' ? 'py' : format;
}

/**
 * Detect a document format from its content, falling back to the file
 * extension for plain-text formats. Returns `null` when unsupported/corrupt.
 */
export function detectFormat(name: string, bytes: Uint8Array): DocumentFormat | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return detectZipFormat(bytes);
  if (isPicture(bytes)) return 'image';
  // VAULT-001: a vault of passwords in the KDBX format (its two signatures).
  if (bytes.length >= 12 && new DataView(bytes.buffer, bytes.byteOffset, 8).getUint32(0, true) === 0x9aa2d903 && new DataView(bytes.buffer, bytes.byteOffset, 8).getUint32(4, true) === 0xb54bfb67) return 'kdbx';
  // DB-001: a SQLite database ("SQLite format 3" and a zero byte).
  if (bytes.length >= 16 && new TextDecoder().decode(bytes.subarray(0, 16)) === 'SQLite format 3\0') return 'sqlite';
  const ext = extensionOf(name);
  if (!looksLikeText(bytes)) return null;
  if (ext === 'csv' || ext === 'tsv') return 'csv';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'tex' || ext === 'latex' || ext === 'ltx') return 'tex';
  // DOC-038: a Julia file made of `#%%` cells is a KaimonSlate notebook; other Julia files are source files.
  if (ext === 'jl' && /^\s*#%%/.test(new TextDecoder().decode(bytes.subarray(0, 4096)))) return 'jl';
  // DOC-039: a marimo notebook (cells as `@app.cell` functions); other Python files are source files.
  if (ext === 'py' && isMarimo(new TextDecoder().decode(bytes))) return 'marimo';
  if (ext === 'svg' && /<svg[\s>]/.test(new TextDecoder().decode(bytes.subarray(0, 4096)))) return 'image';
  if (TEXT_EXTENSIONS.has(ext) || TEXT_NAMES.test(baseName(name))) return 'text';
  return null;
}

/** Text and source files (FILE-022), by extension. */
const TEXT_EXTENSIONS = new Set(
  ('txt text log nfo mcd c h cpp cc cxx c++ hpp hh hxx ino py pyw pyi ipynb java kt kts scala groovy gradle js mjs cjs ts mts cts tsx jsx vue svelte ' +
    'json jsonc json5 geojson xml xsd xsl xslt html htm xhtml css scss sass less sh bash zsh fish ps1 psm1 bat cmd r rmd qmd m mat jl rs go rb php pl pm lua ' +
    'swift dart hs lhs ml mli fs fsi fsx cs vb sql yaml yml toml ini cfg conf properties env bib bbl sty cls bst dtx ins asm s v sv vhd vhdl ' +
    'f f77 f90 f95 f03 for pas pp adb ads lisp lsp scm ss rkt clj cljs el erl hrl ex exs elm nim zig cmake mk mak diff patch srt vtt rst adoc asciidoc org ' +
    'gitignore gitattributes editorconfig dockerignore tf hcl proto graphql gql sol cu cuh glsl hlsl wgsl coffee awk sed tcl lean agda idr pro P sage gp maxima mpl')
    .toLowerCase()
    .split(/\s+/),
);
const TEXT_NAMES = /^(makefile|gnumakefile|dockerfile|containerfile|readme|license|licence|copying|authors|changelog|install|news|todo|vagrantfile|gemfile|rakefile|procfile|jenkinsfile)$/i;
/** Whether a file name is the one of a text or source file (FILE-022). */
export const isTextName = (name: string): boolean => TEXT_EXTENSIONS.has(extensionOf(name)) || TEXT_NAMES.test(baseName(name));
const baseName = (name: string): string => name.slice(name.replace(/\\/g, '/').lastIndexOf('/') + 1);

/** Pictures shown by browsers (FILE-023), by signature. */
function isPicture(bytes: Uint8Array): boolean {
  const ascii = (from: number, text: string): boolean => [...text].every((ch, i) => bytes[from + i] === ch.charCodeAt(0));
  return (
    startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) || // PNG
    startsWith(bytes, [0xff, 0xd8, 0xff]) || // JPEG
    ascii(0, 'GIF87a') ||
    ascii(0, 'GIF89a') ||
    (ascii(0, 'RIFF') && ascii(8, 'WEBP')) ||
    (ascii(0, 'BM') && bytes.length > 26) ||
    (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) ||
    startsWith(bytes, [0x00, 0x00, 0x01, 0x00]) || // ICO
    // DRAW-013: an OpenRaster picture (a ZIP whose first entry says so).
    (ascii(0, 'PK') && ascii(30, 'mimetypeimage/openraster'))
  );
}

/** Extensions that make a ZIP a collection of files rather than one LaTeX or Markdown project (FILE-021). */
const FOREIGN_TO_PROJECTS = /\.(docx?|odt|odm|xlsx?|ods|pptx?|odp|ott|ots|otp|dotx|xltx|potx|rtf|zip|7z|rar|ipynb|c|h|cpp|cc|cxx|hpp|py|java|js|ts|rs|go|rb|php|cs|m|jl|sql|html?|mp4|mp3|exe)$/i;

/**
 * A ZIP archive that is no document (OpenDocument, Office Open XML, MDZ, a
 * LaTeX project, a ZIP of Markdown notes): opened as a folder (FILE-021).
 */
export function isArchive(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) && !startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return false;
  try {
    zipNames(bytes);
  } catch {
    return false;
  }
  return detectZipFormat(bytes) === null;
}

/** Names of the entries of a ZIP, without decompressing them. */
function zipNames(bytes: Uint8Array): string[] {
  const names: string[] = [];
  unzipSync(bytes, {
    filter: (f) => {
      names.push(f.name);
      return false;
    },
  });
  return names;
}

/** Decompress only the entries needed to recognize a format (archives can be large). */
function readZipFor(bytes: Uint8Array, keep: (name: string, size: number) => boolean): ZipEntries {
  return unzipSync(bytes, { filter: (f) => keep(f.name, f.originalSize) });
}

function detectZipFormat(bytes: Uint8Array): DocumentFormat | null {
  let zip: ZipEntries;
  let names: string[];
  try {
    names = zipNames(bytes);
    const small = (size: number): boolean => size < 4 * 1024 * 1024;
    zip = readZipFor(bytes, (name, size) => (name === 'mimetype' || name === '[Content_Types].xml' || name === 'manifest.json' || /\.tex$/i.test(name)) && small(size));
    for (const name of names) if (!(name in zip)) zip[name] = EMPTY;
  } catch {
    return null;
  }
  const mimetype = readZipText(zip, 'mimetype')?.trim();
  // An OpenDocument master document (.odm) is a text document with linked sections (DOC-028);
  // templates (.ott, .ots, .otp) are opened as their documents (FILE-020).
  if (mimetype === MIME_TYPES.odt || mimetype === 'application/vnd.oasis.opendocument.text-master' || mimetype === `${MIME_TYPES.odt}-template`) return 'odt';
  if (mimetype === MIME_TYPES.ods || mimetype === `${MIME_TYPES.ods}-template`) return 'ods';
  if (mimetype === MIME_TYPES.odp || mimetype === `${MIME_TYPES.odp}-template`) return 'odp';
  if (mimetype === MIME_TYPES.mdz) return 'mdz';
  if (zip['index.md'] && zip['manifest.json']) return 'mdz';
  const types = readZipText(zip, '[Content_Types].xml') ?? '';
  if (types.includes('wordprocessingml.document.main') || zip['word/document.xml']) return 'docx';
  if (types.includes('spreadsheetml.sheet.main') || zip['xl/workbook.xml']) return 'xlsx';
  if (types.includes('presentationml.presentation.main') || zip['ppt/presentation.xml']) return 'pptx';
  if (types) return null;
  const files = names.filter((n) => !n.endsWith('/') && !/(^|\/)__MACOSX\//.test(n));
  const foreign = files.some((p) => FOREIGN_TO_PROJECTS.test(p));
  // TEX-003: a ZIP holding one LaTeX project.
  const tex = files.filter((p) => /\.tex$/i.test(p));
  const mains = tex.filter((p) => /\\documentclass/.test(strFromU8(zip[p] ?? EMPTY)));
  if (tex.length && mains.length <= 1 && !foreign && !files.some((p) => /\.(md|markdown)$/i.test(p))) return 'texzip';
  // MD-014: a plain ZIP holding a single Markdown file (and assets) is imported as MDZ;
  // several notes, or an Obsidian vault, are a folder (FILE-033).
  // MD-011: a TextBundle (`text.md` next to `info.json`) is one document, whatever its assets hold.
  if (files.some((p) => /^([^/]+\.textbundle\/)?text\.(md|markdown)$/i.test(p)) && files.some((p) => /^([^/]+\.textbundle\/)?info\.json$/i.test(p))) return 'mdz';
  const notes = files.filter((p) => /\.(md|markdown)$/i.test(p) && !/(^|\/)\.[^/]+\//.test(p));
  const vault = files.some((p) => /(^|\/)\.obsidian\//.test(p));
  if (notes.length === 1 && !vault && !foreign && !tex.length) return 'mdz';
  return null;
}

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 4096);
  for (const b of sample) if (b === 0) return false;
  return true;
}
