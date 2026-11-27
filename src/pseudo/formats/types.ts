/**
 * Format adapters (docs/design/pseudonymisation.md §6): a file is opened into
 * text units, the units of the whole document are scanned at once (so that
 * attribution sees everything), then the file is written back with the edits.
 */
import type { TextUnit } from '../engine';
import type { Budget } from '../package/zip';

/** A replacement in one unit. */
export interface UnitEdit {
  unit: number;
  start: number;
  end: number;
  replacement: string;
}

/** PSEUDO-025: what the user must look at, since it was not analysed. */
export interface VisualCheck {
  kind: 'picture' | 'object' | 'macro' | 'binary' | 'scanned-page' | 'attachment';
  /** Part of the package, page of a PDF. */
  where: string;
  /** Alternative text or name, when there is one. */
  label?: string;
  /** Picture bytes of the output, to show a thumbnail (pictures only). */
  bytes?: Uint8Array;
  mime?: string;
}

export interface OpenOptions {
  /** Replace pictures by a blank one and empty embedded objects. */
  removePictures?: boolean;
  /** PSEUDO-033: remove identifiers linking documents to one another or to a computer (default true). */
  removeLinkable?: boolean;
  /** Nesting depth of this package (0 for the file itself). */
  depth?: number;
  budget?: Budget;
  /** Give the interface a moment between parts. */
  yieldNow?: () => Promise<void>;
  signal?: AbortSignal;
}

export interface OpenedDocument {
  units: TextUnit[];
  toCheck: VisualCheck[];
  /** Parts removed (thumbnail, signatures, printer settings…). */
  removed: string[];
  /** Extension of the output (".docx", ".txt" for a PDF). */
  outputExtension: string;
  write(edits: readonly UnitEdit[]): Promise<Uint8Array>;
}
