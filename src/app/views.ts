/** Editor views: one per document kind, loaded lazily to keep startup fast. */
import type { AgentTool } from '../ai/tools';
import type { PrintSettings } from '../print/settings';
import { t } from '../i18n';
import type { DocumentFormat, DocumentKind } from '../core/format';

/** An extra "Save as" entry that writes a copy without changing the open document (e.g. a flattened PDF). */
export interface SaveVariant {
  id: string;
  label: string;
  format: DocumentFormat;
  /** Appended to the file name, before the extension. */
  suffix: string;
  save(): Promise<Uint8Array>;
}

export interface EditorView {
  /** Root element mounted by the shell. */
  readonly element: HTMLElement;
  /** Serialise the current content (undefined for read-only views). */
  save?(format: DocumentFormat): Uint8Array | Promise<Uint8Array>;
  /** Short status text (word count, selection...). */
  status?(): string;
  /** What is shown, in place of the format, in the status bar (a calendar). */
  formatLabel?(): string;
  /** Called by the shell once the element is in the DOM. */
  mounted?(): void;
  focus?(): void;
  /** Optional print hook (default: window.print()). */
  print?(): void;
  /** Printable content for the print preview (PRINT-001). */
  printContent?(settings: PrintSettings): HTMLElement | Promise<HTMLElement>;
  /** Page orientation that suits the content, used by default when printing (PRES-013). */
  printOrientation?(): 'portrait' | 'landscape';
  /** DOC-046: the paper and margins of a text document, in millimetres. */
  printPage?(): { width: number; height: number; top: number; right: number; bottom: number; left: number };
  /** Extra "Save as" entries writing copies (PDF-010). */
  saveVariants?(): SaveVariant[];
  /** Real-time collaboration on this document (COLLAB-002). */
  collab?(): import('../collab/parts').CollabAdapter;
  /** Offline synchronisation of this document through QR codes (COLLAB-008). */
  syncable?(): SyncableDocument;
  /** Tools for AI agents working on this document (AI-001, AI-006). */
  agentTools?(): AgentTool[];
  /** Show the document without allowing changes (FILE-017). */
  setReadOnly?(readOnly: boolean): void;
  /** Show the first match of a search (FOLDER-002). */
  find?(query: string): void;
  /** Commands of the view for the command palette, shown or not on screen (UI-018). */
  commands?(): import('./palette').PaletteCommand[];
  /** The document with its sub-documents as `include` blocks, to assemble (DOC-028). */
  masterDocument?(): import('../document/model').RichDocument | undefined;
  /** FILE-029: where the document comes from, kept in its metadata (text documents, presentations). */
  origin?(): string | undefined;
  /** FILE-029: set or clear where the document comes from (not a change of the content). */
  setOrigin?(url: string | undefined): void;
  /** The colours of the folder's tags changed (FOLDER-023). */
  tagsChanged?(): void;
  /** FOLDER-026: show this under the page (the backlinks of a note); `null` removes it. */
  pageBottom?(el: HTMLElement | null): void;
  destroy(): void;
}

/** A text document that can be read and replaced by the offline synchronisation (COLLAB-008). */
export interface SyncableDocument {
  read(): import('../document/model').RichDocument;
  /** Replace the content (properties, images, blocks) with a synchronised one. */
  write(doc: import('../document/model').RichDocument): void;
}

/** CODE-019: the open folder, seen from a file run with its project. */
export interface ProjectSource {
  /** The file's path in the folder. */
  path: string;
  /** Names of the entries of a folder. */
  children(dir: string): Promise<string[]>;
  /** Files under a folder, with their sizes when known. */
  walk(dir: string): Promise<{ path: string; size?: number }[]>;
  read(path: string): Promise<Uint8Array>;
}

export interface ViewContext {
  /** Notify the shell that content changed (sets the modified flag). */
  changed(): void;
  /** Ask the shell to refresh the status bar. */
  statusChanged(): void;
  /** Ask the user to pick one option; resolves to null when cancelled. */
  choose(title: string, message: string, options: string[], preselected: string): Promise<string | null>;
  /** Open a link relative to the document from its folder; false when it is not such a link (FOLDER-003). */
  openLink?(href: string): boolean;
  /** Documents of the open folder, relative to this document (DOC-028). */
  folderDocuments?(): Promise<string[]> | undefined;
  /** Notes to link to or tags of the open folder, for completion in a note (FOLDER-021). */
  completions?(kind: 'link' | 'tag'): Promise<string[]> | undefined;
  /** Colour of a tag of the open folder (FOLDER-023); null when the document is not a note of the folder. */
  tagColour?(tag: string): string | undefined | null;
  /** DOC-036: data files of the open folder (CSV, TSV, workbooks), relative to this document. */
  folderDataFiles?(): string[] | undefined;
  /** MD-027, MD-028: find and read the note or file an embed points to (a name, a path from the note or the folder). */
  embedFile?(target: string): Promise<{ path: string; bytes: Uint8Array } | undefined>;
  /** DOC-036: read a file of the open folder, relative to this document. */
  readFolderFile?(path: string): Promise<Uint8Array>;
  /** DOC-036: write a file into the open folder, relative to this document; undefined when it cannot be written. */
  writeFolderFile?(path: string, bytes: Uint8Array): Promise<void>;
  /** DOC-037: the snippets of the open folder (its `Snippets` folder). */
  folderSnippets?(): Promise<import('../document/snippets').Snippet[]>;
  /** DOC-036: a folder is open and can be written. */
  folderWritable?(): boolean;
  /** NOTE-003: the notes of the open folder, for a view of notes of the folder. */
  noteStore?(): import('../folder/notes-view').NoteStore | undefined;
  /** NOTE-002: the notes of the open folder as tables of SQL, for the SQL code of a file of the folder. */
  noteTables?(): Promise<import('../code/note-tables').NoteTables> | undefined;
  /** CODE-019: the files of the open folder and the path of this file in it, to run it with its project. */
  folderProject?(): ProjectSource | undefined;
  /** What the view offers in the header changed (e.g. its save variants). */
  headerChanged?(): void;
  /** Show a short message to the user. */
  notify?(message: string): void;
  /** UI-019: run a long task with the application's spinner. */
  busy?<T>(task: () => Promise<T>): Promise<T>;
  /** DOC-041: the name of the file, shown by its fields. */
  fileName?(): string | undefined;
  /** DRAW-013: the file changes its name (a picture that becomes a layered .ora). */
  rename?(name: string): void;
}

/** Create a view for existing file bytes. */
export async function openView(
  format: DocumentFormat,
  bytes: Uint8Array,
  ctx: ViewContext,
  fileName = 'document',
  /** Pictures referenced by a Markdown note, read from its folder (FOLDER-005). */
  resolveImage?: import('../document/markdown-reader').MarkdownReadOptions['resolveImage'],
  /** Keep the relative links of the note's pictures (it is saved back into its folder, MD-018). */
  keepImageLinks = false,
): Promise<EditorView> {
  switch (format) {
    case 'docx':
    case 'odt':
    case 'md':
    case 'mdz':
    case 'tex':
    case 'texzip':
    case 'jl':
    case 'marimo': {
      const [{ DocumentEditor }, { readDocument }] = await Promise.all([import('../document/editor'), import('../document/io')]);
      const doc = await readDocument(format, bytes, {
        chooseEntry: (candidates, preselected) =>
          ctx.choose(t('mdz.chooseTitle'), t('mdz.chooseMessage'), candidates, preselected),
        ...(resolveImage ? { resolveImage } : {}),
        keepImageLinks,
      });
      return new DocumentEditor(doc, ctx);
    }
    case 'xlsx':
    case 'ods':
    case 'csv': {
      const [{ SheetEditor }, { readWorkbook }] = await Promise.all([import('../sheet/grid'), import('../sheet/io')]);
      return new SheetEditor(readWorkbook(format, bytes, fileName), ctx, format);
    }
    case 'pptx':
    case 'odp': {
      const [{ SlideEditor }, { readPresentation }] = await Promise.all([import('../slides/editor'), import('../slides/io')]);
      return new SlideEditor(readPresentation(format, bytes), ctx, format);
    }
    case 'pdf': {
      const { createPdfViewer } = await import('../pdf/viewer');
      return createPdfViewer(bytes, ctx);
    }
    case 'text': {
      // DB-002: a data model, at its three levels.
      if (/\.mcd$/i.test(fileName)) {
        const { DataModelView } = await import('../datamodel/view');
        return new DataModelView(bytes, ctx, fileName);
      }
      // CANVAS-001: a canvas (JSON Canvas).
      if (/\.canvas$/i.test(fileName)) {
        const { CanvasView } = await import('../canvas/view');
        return new CanvasView(bytes, ctx, fileName);
      }
      // NOTE-003: a view of the notes of the folder.
      if (/\.view\.ya?ml$/i.test(fileName)) {
        const { NotesView } = await import('../folder/notes-view');
        return new NotesView(bytes, ctx, fileName);
      }
      // NOTE-004: a `.base` file, views of the notes of the folder.
      if (/\.base$/i.test(fileName)) {
        const { BasesView } = await import('../folder/bases-view');
        return new BasesView(bytes, ctx, fileName);
      }
      const { TextView } = await import('../files/text-view');
      return new TextView(bytes, ctx, fileName);
    }
    case 'kdbx': {
      const { VaultView } = await import('../vault/view');
      return new VaultView(bytes, ctx, fileName);
    }
    case 'sqlite': {
      const { SqliteView } = await import('../sqlite/view');
      return new SqliteView(bytes, ctx, fileName);
    }
    case 'image': {
      const { ImageView } = await import('../files/image-view');
      return new ImageView(bytes, ctx, fileName);
    }
    default:
      throw new Error(`Editing ${format} files is not available yet.`);
  }
}

/** Create a view for a new document of the given kind: empty, or with the content of a template (FILE-018). */
export async function newView(kind: DocumentKind, ctx: ViewContext, format?: DocumentFormat, content?: import('../templates/catalog').Built): Promise<EditorView> {
  switch (kind) {
    case 'document': {
      const [{ DocumentEditor }, { emptyDocument }] = await Promise.all([import('../document/editor'), import('../document/model')]);
      return new DocumentEditor(content?.kind === 'document' ? content.doc : emptyDocument(), ctx);
    }
    case 'spreadsheet': {
      const [{ SheetEditor }, { newWorkbook }] = await Promise.all([import('../sheet/grid'), import('../sheet/model')]);
      return new SheetEditor(content?.kind === 'spreadsheet' ? content.wb : newWorkbook(), ctx, format === 'xlsx' ? 'xlsx' : 'ods');
    }
    case 'presentation': {
      const [{ SlideEditor }, { emptyPresentation }] = await Promise.all([import('../slides/editor'), import('../slides/model')]);
      return new SlideEditor(content?.kind === 'presentation' ? content.pres : emptyPresentation(), ctx, format === 'pptx' ? 'pptx' : 'odp');
    }
    default:
      throw new Error(`Creating a ${kind} is not available yet.`);
  }
}
