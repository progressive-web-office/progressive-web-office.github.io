/**
 * PSEUDO-032: limits for the untrusted files given to the pseudonymisation
 * (docs/design/pseudonymisation.md §11.1).
 */
export const LIMITS = {
  /** A file to pseudonymise. */
  inputBytes: 50 * 1024 * 1024,
  /** The list of people (CSV). */
  listBytes: 1024 * 1024,
  listLines: 5000,
  /** Entries of a package. */
  entries: 10_000,
  /** Uncompressed bytes of a package, nested packages included. */
  totalBytes: 300 * 1024 * 1024,
  /** Uncompressed bytes of one entry. */
  entryBytes: 100 * 1024 * 1024,
  /** Compression ratio of one entry (checked above `ratioFrom` bytes). */
  ratio: 100,
  ratioFrom: 1024 * 1024,
  /** Packages inside packages. */
  depth: 2,
  /** Characters of one XML part. */
  xmlChars: 50 * 1024 * 1024,
  /** Pages of a PDF file. */
  pdfPages: 2000,
} as const;

export type RefusalCode =
  | 'too-large'
  | 'not-a-package'
  | 'too-many-entries'
  | 'too-large-uncompressed'
  | 'entry-too-large'
  | 'ratio'
  | 'size-mismatch'
  | 'encrypted'
  | 'duplicate'
  | 'unsafe-name'
  | 'unsupported-compression'
  | 'doctype'
  | 'xml-too-large'
  | 'xml-invalid'
  | 'too-deep'
  | 'too-many-pages'
  | 'unsupported-format';

/** A file the pseudonymisation refuses: no output is written for it. */
export class Refusal extends Error {
  constructor(
    readonly code: RefusalCode,
    readonly detail = '',
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'Refusal';
  }
}
