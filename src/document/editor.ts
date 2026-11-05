/**
 * WYSIWYG editor view for text documents (DOC-003..DOC-010, DOC-013, DOC-015,
 * DOC-018), built on ProseMirror: a structured document with transactions,
 * a reliable undo history and precise collaboration.
 */
import { Fragment, Slice, type Node as PmNode } from 'prosemirror-model';
import { usesNoteTables } from '../code/note-tables';
import { EditorState, NodeSelection, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { EditorView as PmView } from 'prosemirror-view';
import { toggleMark } from 'prosemirror-commands';
import { addColumnAfter, addColumnBefore, addRowAfter, addRowBefore, deleteColumn, deleteRow, deleteTable, isInTable, mergeCells, splitCell, toggleHeaderRow } from 'prosemirror-tables';
import { editCaption, pickReference, seqWord, type ReferenceTarget } from './xref-dialog';
import { manageReferences, pickCitation } from './bib-dialog';
import { citationsOf, type Citations } from './bibliography';
import { redo, undo } from 'prosemirror-history';
import { applyDocumentParts, documentParts, type CollabAdapter, type PeerCursor } from '../collab/parts';
import { documentTools, type AgentTool } from '../ai/tools';
import type { PrintSettings } from '../print/settings';
import { getLocale, t, type MessageKey } from '../i18n';
import { button, h } from '../app/dom';
import { onContextMenu, openContextMenu, tableSizePicker, type MenuAction, type MenuEntry } from '../app/context-menu';
import { sizeInput, type SizeInput } from '../app/size-input';
import type { EditorView, SaveVariant, SyncableDocument, ViewContext } from '../app/views';
import { blocksToDom, domToBlocks, isSafeUrl, markdownInline, sanitizeHtml, type ImageInfo } from './html';
import { writeDocumentAsync, type TextFormat } from './io';
import { isRunLang } from './code-langs';
import { CELL_LANGS as FENCE_LANGS, decodeDataUri, readMarkdown } from './markdown-reader';
import { bytesToBase64, writeMarkdown } from './markdown-writer';
import { SourcePane, sourceLangOf, type SourceLang } from './source-mode';
import { Rulers } from './rulers';
import { loadShowProperties, PropertiesCard, saveShowProperties } from './properties-card';
import { loadPaper, PAPERS, savePaper, type PaperPreference } from '../app/paper';
import { LENGTH_UNITS, loadLengthUnit, loadRulerSides, RULERS_EVENT, saveLengthUnit, saveRulerSides, UNIT_EVENT, type LengthUnit, type RulerSides } from './units';
import { writeLatex } from './latex-writer';
import { readLatex } from './latex-reader';
import { addResource, allParagraphs, cleanPageSetup, defaultGeometry, isFillRun, isLandscape, paperName, textHeight, textWidth, type PageGeometry, FIELD_KINDS, INPUT_KINDS, type InputKind, fieldValue, newAnchor, wordCount, type CodeLang, type FieldContext, type FieldKind, type FieldFormat, type FieldRun, type Run, type Align, type Block, type ParagraphStyle, type RichDocument, type Revision } from './model';
import type { CodeRunner } from '../code/runner';
import { blockToPm, blocksToPm, pmCiteRuns, pmCrossTargets, pmToBlocks, type PmCrossRefs } from './pm/convert';
import { schema } from './pm/schema';
import { linkRange, removeLink } from './pm/commands';
import { columnsAt, columnsOf, setColumns } from './pm/columns';
import { inDisplayEquation, insertBlockAfter, insertCaption, insertCrossReference, numberEquation, insertToc, changeIndent, clearFormatting, currentAlign, currentNamed, currentStyle, inList, insertInline, insertOnOwnLine, insertRule, insertTable, linkAt, markActive, markValue, paragraphAttr, setAlign, setLink, setMarkValue, setParagraphAttrs, setNamedStyle, setStyle, toggleList } from './pm/commands';
import { namedStylesCss, type NamedStyle } from './styles';
import { LINE_SPACINGS } from './paragraph-dialog';
import { basePlugins, peersKey, type PeerMarker } from './pm/plugins';
import { cellHandle, nodeViews } from './pm/views';
import { layoutSprings, measureSprings, springsPlugin } from './pm/springs';
import { parseFill, parseSpaceLine } from './springs';
import { mmToPx } from '../print/settings';
import { cellStateKey, cellStatePlugin, markCells, stalePositions } from './pm/cell-state';
import type { CellDeps, CellError } from '../code/reactive';
import { loadReactivity } from '../code/settings';
import { DagPanel, type DagView } from '../code/dag-panel';
import { listCss } from './pm/list-css';
import { askAuthor } from '../app/author';
import { isHistoryTransaction } from 'prosemirror-history';
import { ChangePanel } from './change-panel';
import { trackTransaction, UNTRACKED } from './changes';
import { withoutSolutions } from './solutions';
import { TRANSFORMS, transformText, typographyRules, type TransformId } from './text-tools';
import { loadTypography, saveTypography } from './typography';
import { writingKey, writingPlugin } from './pm/writing-plugin';
import { completionPlugin } from './pm/complete';
import { noteTagsPlugin, refreshNoteTags } from './pm/note-tags';
import { calloutPlugin } from './pm/callouts';
import { loadToolbarMode, toolGroup } from '../app/tool-groups';
import { insertSnippet, snippetStopsPlugin } from './pm/snippet-stops';
import { builtinSnippets, expandSnippet, loadSnippets, mergeSnippets, type Snippet } from './snippets';
import { readability } from './readability';
import { addWritten, loadGoal, saveGoal } from './writing-stats';
import { CommentPanel } from './comment-panel';
import { pruneComments } from './comments';
import { FindBar } from './find-bar';
import { editPageSetup, pageSetupCss, zonePreview } from './page-setup';
import { DocReview } from './review';
import { loadReading } from '../review/settings';
import { REVIEW_KEYWORDS } from '../review/keys';

/** DOC-049: words finding the columns in the command palette. */
const COLUMNS_KEYWORDS = ['columns', 'colonnes', 'newspaper', 'journal', 'newsletter', 'multicol', 'PAO', 'desktop publishing', '分栏'];

/** Words finding a button in the command palette (UI-018). */
function withKeywords(b: HTMLButtonElement, keywords: string): HTMLButtonElement {
  b.dataset.keywords = keywords;
  return b;
}
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-tables/style/tables.css';
import 'prosemirror-gapcursor/style/gapcursor.css';

/** List styles, added once to the page. */
function installListCss(): void {
  if (document.getElementById('pwo-list-css')) return;
  const style = document.createElement('style');
  style.id = 'pwo-list-css';
  style.textContent = listCss('.doc-page');
  document.head.append(style);
}

/** Fonts offered in the toolbar: common names, rendered with metric-compatible fallbacks when missing. */
const FONTS = ['Arial', 'Calibri', 'Cambria', 'Georgia', 'Liberation Sans', 'Liberation Serif', 'Times New Roman', 'Verdana', 'OpenDyslexic'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72, 96, 120, 144];

/** The last item of the list of styles: the "Styles…" window (DOC-053). */
const NEW_STYLE = 'styles:manage';

const STYLES: [ParagraphStyle, MessageKey][] = [
  ['normal', 'doc.style.normal'],
  ['h1', 'doc.style.h1'],
  ['h2', 'doc.style.h2'],
  ['h3', 'doc.style.h3'],
  ['h4', 'doc.style.h4'],
  ['quote', 'doc.style.quote'],
  ['code', 'doc.style.code'],
  ['caption', 'doc.style.caption'],
];

/** Transactions coming from other participants: not "changes" of this user. */
const REMOTE = 'pwo-remote';


/** DOC-041: symbols of the fields in menus. */
/** DOC-048: words cut at the end of lines, as in TeX (on by default). */
function loadHyphenation(): boolean {
  try {
    return localStorage.getItem('pwo.doc.hyphenate') !== '0';
  } catch {
    return true;
  }
}
function saveHyphenation(on: boolean): void {
  try {
    localStorage.setItem('pwo.doc.hyphenate', on ? '1' : '0');
  } catch {
    /* storage unavailable */
  }
}


/** DOC-044: how a document is edited; the last choice is kept per kind of document. */
type EditMode = 'visual' | 'source' | 'reading';
const MODE_KEY = 'pwo.doc.mode';
function loadEditMode(kind: string): EditMode | undefined {
  try {
    const all = JSON.parse(localStorage.getItem(MODE_KEY) ?? '{}') as Record<string, unknown>;
    const m = all[kind];
    return m === 'visual' || m === 'source' || m === 'reading' ? m : undefined;
  } catch {
    return undefined;
  }
}
function saveEditMode(kind: string, mode: EditMode): void {
  try {
    const all = JSON.parse(localStorage.getItem(MODE_KEY) ?? '{}') as Record<string, unknown>;
    localStorage.setItem(MODE_KEY, JSON.stringify({ ...all, [kind]: mode }));
  } catch {
    /* storage unavailable */
  }
}

/** FORM-003: the form fields of text documents. */
const INPUT_ICONS: Record<InputKind, string> = { text: '▭', checkbox: '☑', dropdown: '▾' };
const kindLabelOf = (kind: InputKind): string => t(`form.kind.${kind}`);
const FIELD_ICONS: Record<FieldKind, string> = { date: '📅', time: '🕒', page: '#', pages: 'Σ', title: 'T', author: '👤', filename: '📄' };

export class DocumentEditor implements EditorView {
  readonly element: HTMLElement;
  private readonly page: HTMLElement;
  readonly view: PmView;
  private readonly styleSelect: HTMLSelectElement;
  private readonly fontSelect: HTMLSelectElement;
  private readonly sizeSelect: SizeInput;
  private readonly lineSelect: HTMLSelectElement;
  private readonly markButtons: [string, HTMLButtonElement][] = [];
  private readonly stateButtons: [() => boolean, HTMLButtonElement][] = [];
  /** Table commands, enabled when they apply (DOC-025). */
  private readonly tableButtons: [Command, HTMLButtonElement][] = [];
  private tableBar!: HTMLElement;
  private readonly urls = new Map<string, string>();
  private statusTimer: ReturnType<typeof setTimeout> | undefined;
  private runner: CodeRunner | undefined;
  private readonly findBar: FindBar;
  private readonly tocViews = new Set<{ refresh(): void }>();
  /** The footnotes, listed under the page (DOC-022). */
  private readonly notes = h('aside', { class: 'doc-notes', 'aria-label': t('note.notes') });
  /** Header and footer previews around the page (DOC-024). */
  private readonly headerStrip = h('div', { class: 'doc-furniture header', role: 'button', tabindex: '0', title: t('hf.edit'), 'aria-label': t('hf.header') });
  private readonly footerStrip = h('div', { class: 'doc-furniture footer', role: 'button', tabindex: '0', title: t('hf.edit'), 'aria-label': t('hf.footer') });
  /** CODE-004: the user agreed to run this document's code. */
  private trusted = false;
  /** REV-001: the comments beside the page. */
  private readonly comments: CommentPanel;
  /** CODE-015: the dependency graph of the code cells. */
  private readonly dag: DagPanel;
  /** REV-005: tracked changes, recorded while `tracking` with this author. */
  private readonly changesPanel: ChangePanel;
  private tracking: Revision | undefined;
  private readonly trackButton: HTMLButtonElement;
  /** DOC-031: typography as you type (kept for the next documents). */
  private typography = loadTypography();
  private readonly textTools = h('select', { 'aria-label': t('text.tools'), title: t('text.toolsTitle'), class: 'text-tools' });
  /** DOC-033..DOC-035: how the document is shown while writing. */
  private readonly viewMenu = h('select', { 'aria-label': t('wview.menu'), title: t('wview.menuTitle'), class: 'text-tools' });
  private writing = { readability: false, focus: false, typewriter: false };
  private goal: number | undefined;
  private lastWords: number | undefined;
  private wordsTimer: ReturnType<typeof setTimeout> | undefined;
  private timerEnd = 0;
  private timerTick: ReturnType<typeof setInterval> | undefined;
  /** TEACH-001: solutions shown (answer key) or hidden (exercise sheet). */
  private readonly solutionsButton = button(t('solution.hide'), () => this.toggleSolutions(), { text: '👁', title: t('solution.hideTitle') });
  private hadSolutions = false;
  /** DOC-044: visual editing, the source beside a preview, or reading only. */
  private mode: EditMode = 'visual';
  private sourcePane: SourcePane | undefined;
  private readonly modeBar = h('div', { class: 'doc-mode-bar', role: 'status', hidden: true });
  /** DOC-047: graduated rulers around the page. */
  private readonly rulers: Rulers;
  private rulersFrame = 0;
  private scroller!: HTMLElement;

  constructor(
    private readonly doc: RichDocument,
    private readonly ctx: ViewContext,
  ) {
    installListCss();
    this.page = h('div', { class: 'doc-page' });
    this.styleSelect = h('select', { 'aria-label': t('doc.style'), title: t('doc.style') }, ...STYLES.map(([v, l]) => h('option', { value: v }, t(l))));
    this.styleSelect.addEventListener('change', () => {
      const v = this.styleSelect.value;
      // DOC-053: a named style of the document, or the window to make one.
      if (v === NEW_STYLE) {
        this.styleSelect.value = this.currentStyleValue();
        return void this.editStyles();
      }
      this.command(v.startsWith('named:') ? setNamedStyle(v.slice(6)) : setStyle(v as ParagraphStyle));
      this.refocus();
    });
    this.fontSelect = h('select', { 'aria-label': t('fmt.font'), title: t('fmt.font'), class: 'font-select' }, h('option', { value: '' }, t('fmt.default')), ...FONTS.map((f) => h('option', { value: f, style: `font-family: "${f}"` }, f)));
    this.fontSelect.addEventListener('change', () => {
      const v = this.fontSelect.value;
      this.command(setMarkValue(schema.marks.font!, v ? { family: v } : null));
      this.refocus();
    });
    // UI-016: any size can be typed, the usual ones are suggested.
    this.sizeSelect = sizeInput({
      label: t('fmt.size'),
      suggestions: SIZES,
      onChange: (pt) => {
        this.command(setMarkValue(schema.marks.size!, { pt }));
        this.refocus();
      },
    });
    this.lineSelect = h('select', { 'aria-label': t('para.lineSpacing'), title: t('para.lineSpacing'), class: 'size-select' }, h('option', { value: '' }, '↕'), ...LINE_SPACINGS.map((n) => h('option', { value: String(n) }, `↕ ${n}`)));
    this.lineSelect.addEventListener('change', () => {
      const v = Number(this.lineSelect.value);
      this.command(setParagraphAttrs({ lineHeight: v || null }));
      this.refocus();
    });
    this.findBar = new FindBar(() => this.view);
    this.comments = new CommentPanel({ view: () => this.view, doc: this.doc, readOnly: () => this.readOnly, changed: () => this.changed() });
    this.changesPanel = new ChangePanel(() => this.view, () => this.readOnly);
    this.dag = new DagPanel({ view: () => this.dagView(), goTo: (i) => this.goToCell(i) });
    this.trackButton = button(t('track.button'), () => void this.toggleTracking(), { text: '±', title: t('track.title'), className: 'track-btn' });
    this.trackButton.setAttribute('aria-pressed', 'false');
    this.rulers = new Rulers(
      {
        margin: (side, mm) => this.setMargin(side, mm),
        // The ruler keeps the focus (arrow keys move the handle further).
        indent: (kind, pt) => void this.command(setParagraphAttrs({ [kind]: pt ? pt : null })),
      },
      { horizontal: t('ruler.horizontal'), vertical: t('ruler.vertical'), left: t('ruler.leftMargin'), right: t('ruler.rightMargin'), indent: t('para.indent'), firstLine: t('para.firstLine'), page: (n) => t('ruler.page', { n }) },
      loadLengthUnit(),
    );
    const sheet = h('div', { class: 'doc-sheet' }, this.rulers.horizontal, h('div', { class: 'doc-sheet-body' }, this.rulers.vertical, this.page));
    const scroller = h('div', { class: 'doc-scroll' }, this.propertiesCard.element, this.headerStrip, sheet, this.footerStrip, this.bottom, this.notes);
    this.scroller = scroller;
    this.element = h('div', { class: 'doc-editor' });
    this.showRulers(loadRulerSides());
    // DOC-054: the rulers and the unit follow the settings, in every document open.
    addEventListener(RULERS_EVENT, this.onRulerSides);
    addEventListener(UNIT_EVENT, this.onUnit);
    this.element.classList.toggle('hyphenate', loadHyphenation());
    // REVIEW-001: read and comment page by page.
    this.review = new DocReview(
      {
        root: this.element,
        scroller,
        view: () => this.view,
        setReviewing: (on) => {
          this.reviewing = on;
          this.view.setProps({});
          this.updateToolbar();
        },
        comment: () => this.addComment(),
        find: () => this.findBar.open(false),
        notify: (message) => (this.ctx.notify ? this.ctx.notify(message) : window.alert(message)),
        statusChanged: () => this.ctx.statusChanged(),
        // DOC-046: the review pages have the paper and the margins of the document.
        page: () => {
          const g = this.geometry();
          return { width: mmToPx(g.width), height: mmToPx(g.height), top: mmToPx(g.top), right: mmToPx(g.right), bottom: mmToPx(g.bottom), left: mmToPx(g.left) };
        },
      },
      () => this.review.toggle(false),
    );
    this.element.append(
      this.namedCss,
      this.toolbar(),
      this.modeBar,
      this.review.bar,
      this.buildTableBar(),
      this.findBar.element,
      h('div', { class: 'doc-body' }, scroller, h('div', { class: 'doc-side' }, this.dag.element, this.changesPanel.element, this.comments.element)),
    );
    for (const strip of [this.headerStrip, this.footerStrip]) {
      strip.addEventListener('click', () => void this.editPageSetup());
      strip.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          void this.editPageSetup();
        }
      });
    }
    this.renderFurniture();
    this.applyGeometry();
    this.view = new PmView(
      { mount: this.page },
      {
        state: EditorState.create({
          doc: blocksToPm(doc.blocks),
          plugins: [
            // DOC-031: typography as you type, in the document's language.
            typographyRules({ enabled: () => this.typography, lang: () => this.lang() }),
            // DOC-033, DOC-035: readability and focus decorations.
            writingPlugin((score, level, wps) => t('read.label', { score, level: t(`read.${level}` as MessageKey), wps })),
            cellStatePlugin(() => t('code.stale')),
            // FOLDER-021: `[[` and `#` complete with the notes and tags of the folder (before Enter's keymap).
            // DOC-037: `;;` and a name inserts a snippet.
            completionPlugin(
              (kind) => (kind === 'snippet' ? this.snippets().then((list) => list.map((x) => x.name)) : this.ctx.completions?.(kind)),
              (kind) => t(kind === 'link' ? 'complete.notes' : kind === 'tag' ? 'complete.tags' : 'snippet.title'),
              (name) => this.insertSnippetNamed(name),
            ),
            snippetStopsPlugin(),
            // FOLDER-023: #tags of a note shown as tags, in their colour.
            noteTagsPlugin((tag) => (this.ctx.tagColour ? this.ctx.tagColour(tag) : null)),
            // MD-019: callouts (`> [!NOTE]`) as coloured boxes.
            calloutPlugin(),
            // DOC-042: lines with horizontal springs.
            springsPlugin(),
            ...basePlugins({ footnote: () => void this.editNote(), find: (replace) => this.findBar.open(replace), link: () => this.insertLink(), math: () => void this.editMath(), diagram: () => void this.editDiagram() }),
          ],
        }),
        nodeViews: nodeViews({
          resolve: (key) => this.resolve(key),
          editMath: (pos, node) => void this.editMath(pos, node),
          editFootnote: (pos, node) => void this.editNote(pos, node),
          tocViews: this.tocViews,
          tocEntries: (levels) => this.headings(levels),
          gotoHeading: (pos) => {
            this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(pos + 1))).scrollIntoView());
            this.view.focus();
          },
          editDiagram: (pos, node) => void this.editDiagram(pos, node),
          cellAction: (action, pos, node) => this.onCellAction(action, pos, node),
          mountWidgets: (cell) => this.mountWidgets(cell),
          xref: () => this.crossRefs(),
          gotoAnchor: (id) => this.gotoAnchor(id),
          citations: () => this.citations(),
          openInclude: (src) => this.ctx.openLink?.(src) ?? false,
          editCitation: (pos, node) => void this.editCitation(pos, node),
          // DRAW-007: a drawing (an SVG picture) opens again in the drawing editor.
          editImage: (pos, node) => void (this.doc.resources.get(node.attrs.image as string)?.mediaType === 'image/svg+xml' ? this.editDrawing(pos) : this.describeImage(pos, node)),
          fieldContext: (pos) => this.fieldContext(pos),
        }),
        editable: () => !this.readOnly && !this.reviewing && this.mode === 'visual',
        // DOC-048: the document's language, for hyphenation and the spelling checker.
        attributes: () => ({ role: 'textbox', 'aria-multiline': 'true', 'aria-label': t('doc.label'), spellcheck: 'true', class: 'doc-page', lang: this.lang() }),
        dispatchTransaction: (tr) => this.dispatch(tr),
        handlePaste: (_view, event) => this.onPaste(event),
        // FOLDER-003: Ctrl+click follows a link (a relative one from the open folder).
        handleClick: (view, pos, event) => {
          if (!(event.ctrlKey || event.metaKey)) return false;
          const mark = schema.marks.link!.isInSet(view.state.doc.resolve(pos).marks());
          const href = (event.target as HTMLElement).closest?.('a[href]:not(.xref)')?.getAttribute('href') ?? (mark?.attrs.href as string | undefined);
          if (!href || href.startsWith('#')) return false;
          if (!this.ctx.openLink?.(href) && isSafeUrl(href)) window.open(href, '_blank', 'noopener');
          return true;
        },
        // DOC-050: a click on a field changes it.
        handleClickOn: (_view, _pos, node, nodePos, event) => {
          if (node.type !== schema.nodes.field || this.readOnly || this.mode !== 'visual' || event.ctrlKey || event.metaKey || event.shiftKey) return false;
          setTimeout(() => void this.editFieldAt(nodePos));
          return true;
        },
        handleDrop: (_view, event) => this.onDrop(event as DragEvent),
        // Springs, spaces and form fields are changed again by a double click (DOC-042, FORM-003).
        handleDoubleClickOn: (_view, _pos, node, nodePos) => {
          if (this.readOnly || this.mode !== 'visual') return false;
          if (node.type === schema.nodes.space || node.type === schema.nodes.hfill) {
            this.changeSpace(nodePos);
            return true;
          }
          if (node.type === schema.nodes.form_input) {
            void this.editInput(node.attrs.input as InputKind, nodePos);
            return true;
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          // CODE-001: ``` and a language, then Enter, starts a code cell.
          if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) return this.fenceToCell() || this.typedSpace();
          // DOC-042: `\hfill` and a space is a horizontal spring.
          if (event.key === ' ' && !event.ctrlKey && !event.metaKey && this.typedFill()) return true;
          // REV-001: Ctrl+Alt+M comments the selection.
          if (!(event.ctrlKey || event.metaKey) || !event.altKey || event.key.toLowerCase() !== 'm') return false;
          this.addComment();
          return true;
        },
      },
    );
    // UI-021: a menu of what can be done where the pointer is (right click, long press).
    onContextMenu(this.view.dom, (x, y, target) => this.showContextMenu(x, y, target));
    // DOC-042: springs follow the text, the window and the printed page.
    addEventListener('resize', this.onResize);
    addEventListener('beforeprint', this.beforePrint);
    addEventListener('afterprint', this.onResize);
    void document.fonts?.ready.then(() => this.springsSoon());
    this.springsSoon();
    this.renderNamedStyles();
    this.updateToolbar();
    this.renderNotes();
    this.comments.refresh();
    this.changesPanel.refresh();
    this.hadSolutions = this.hasSolutions();
    // DOC-034: the goal of this document, and the words it starts with.
    this.goal = loadGoal(this.goalKey());
    this.lastWords = this.words();
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.writing.focus) this.setWriting({ focus: false });
      // REVIEW-001: Ctrl+Alt+R enters and leaves the review mode.
      if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyR') {
        e.preventDefault();
        this.review.toggle();
      }
    });
    this.element.style.setProperty('--solution-label', JSON.stringify(t('solution.label')));
    for (const toc of this.tocViews) toc.refresh();
  }

  /** DOC-044: Markdown and LaTeX files have a source the editor reads back. */
  private sourceLang(): SourceLang | undefined {
    return sourceLangOf(this.ctx.fileName?.());
  }

  private modeKind(): string {
    return this.sourceLang() ?? 'rich';
  }

  /** The source text of the document as it is now. */
  private sourceText(lang: SourceLang): string {
    const doc = { ...this.doc, blocks: this.currentBlocks() };
    if (lang === 'latex') return writeLatex(doc).tex;
    return writeMarkdown(doc, { imageUrl: (key) => this.sourceImageName(key) });
  }

  /** Pictures of the source are named after their resource. */
  private sourceImageName(key: string): string {
    const res = this.doc.resources.get(key);
    return res?.name ? res.name.replace(/[()\s]/g, '_') : `${key}.${(res?.mediaType ?? 'image/png').split('/')[1]}`;
  }

  private readSource(text: string, lang: SourceLang): RichDocument {
    if (lang === 'latex') return readLatex(text);
    const byName = new Map([...this.doc.resources].map(([key, res]) => [this.sourceImageName(key), res]));
    return readMarkdown(text, {
      resolveImage: (src) => {
        const res = byName.get(src);
        return res ? { data: res.data, mediaType: res.mediaType, ...(res.name ? { name: res.name } : {}) } : undefined;
      },
    });
  }

  /** Take back the source being edited into the document (DOC-044). */
  private syncSource(): void {
    const pane = this.sourcePane;
    const lang = this.sourceLang();
    if (!pane || !lang) return;
    const parsed = this.readSource(pane.text(), lang);
    for (const [key, res] of parsed.resources) if (!this.doc.resources.has(key)) this.doc.resources.set(key, res);
    this.doc.meta = { ...parsed.meta };
    // The rest of the front matter too: the other keys (NOTE-001), the page, the sources.
    if (lang === 'markdown') {
      const { frontMatter: _old, ...extras } = this.doc.extras ?? {};
      this.doc.extras = parsed.extras?.frontMatter ? { ...extras, frontMatter: parsed.extras.frontMatter } : extras;
      if (parsed.page) this.doc.page = parsed.page;
      else delete this.doc.page;
      if (parsed.references) this.doc.references = parsed.references;
      else delete this.doc.references;
    }
    this.replaceBlocks(parsed.blocks.length ? parsed.blocks : [{ type: 'paragraph', style: 'normal', runs: [] }], false);
    this.renderFurniture();
  }

  /** DOC-044: switch between visual editing, the source with its preview, and reading. */
  setMode(mode: EditMode): void {
    const lang = this.sourceLang();
    if (mode === 'source' && !lang) return;
    if (mode === this.mode) return;
    if (this.mode === 'source') {
      this.syncSource();
      this.sourcePane?.destroy();
      this.sourcePane = undefined;
    }
    this.mode = mode;
    this.element.classList.toggle('source-mode', mode === 'source');
    this.element.classList.toggle('reading-mode', mode === 'reading');
    if (mode === 'source' && lang) {
      this.sourcePane = new SourcePane({
        text: this.sourceText(lang),
        lang,
        label: t(lang === 'latex' ? 'mode.sourceLatex' : 'mode.sourceMarkdown'),
        previewLabel: t('mode.preview'),
        render: (text) => blocksToDom(this.readSource(text, lang).blocks, document, (key) => this.resolve(key)),
        changed: () => this.changed(),
      });
      this.modeBar.after(this.sourcePane.element);
    }
    this.modeBar.hidden = mode === 'visual';
    this.modeBar.replaceChildren(
      ...(mode === 'visual'
        ? []
        : [
            h('span', {}, mode === 'source' ? `</> ${t(lang === 'latex' ? 'mode.sourceLatex' : 'mode.sourceMarkdown')}` : `📖 ${t('mode.reading')}`),
            ...(mode === 'reading' && lang ? [button(t('mode.source'), () => this.setMode('source'), { text: `</> ${t('mode.source')}` })] : []),
            ...(mode === 'source' ? [button(t('mode.reading'), () => this.setMode('reading'), { text: `📖 ${t('mode.reading')}` })] : []),
            button(t('mode.visual'), () => this.setMode('visual'), { text: `✎ ${t('mode.visual')}`, className: 'primary' }),
          ]),
    );
    this.view.setProps({});
    saveEditMode(this.modeKind(), mode);
    if (mode === 'source') this.sourcePane?.focus();
    else if (mode === 'visual') this.view.focus();
    this.ctx.statusChanged();
  }

  /** Header and footer shown above and below the page, fields as examples. */
  private renderFurniture(): void {
    // NOTE-001: the properties of a Markdown note, above its page.
    if (this.sourceLang() === 'markdown' && loadShowProperties()) this.propertiesCard.render();
    else this.propertiesCard.element.hidden = true;
    const page = this.doc.page;
    const title = this.doc.meta.title ?? '';
    for (const [strip, kind] of [[this.headerStrip, 'header'], [this.footerStrip, 'footer']] as const) {
      const zones = page?.[kind];
      strip.hidden = !zones;
      strip.replaceChildren(...(['left', 'center', 'right'] as const).map((z) => h('span', { class: `zone ${z}` }, zones?.[z] ? zonePreview(zones[z]!, title, page) : '')));
    }
  }

  /** DOC-049: set the selected blocks (or the columns holding the cursor) in columns. */
  private async editColumns(): Promise<void> {
    const at = columnsAt(this.view.state);
    const { columnsDialog } = await import('./columns-dialog');
    const layout = await columnsDialog(this.element, at ? columnsOf(at.node) : undefined);
    if (layout === null) return this.refocus();
    if (!this.command(setColumns(layout))) (this.ctx.notify ?? window.alert)(t('cols.cannot'));
    this.refocus();
  }

  /** Header and footer dialog (DOC-024). */
  private async editPageSetup(): Promise<void> {
    const setup = await editPageSetup(this.element, this.doc.page);
    if (!setup) return;
    if (Object.keys(setup).length) this.doc.page = setup;
    else delete this.doc.page;
    this.renderFurniture();
    this.applyGeometry();
    this.changed();
  }

  /** Top-level headings up to `levels`, with their positions (DOC-023). */
  /** Numbers and cross-reference targets, recomputed after a change (DOC-026). */
  private xrefCache: PmCrossRefs | undefined;

  private crossRefs(): PmCrossRefs {
    if (!this.view) return { numbers: new Map(), targets: new Map() };
    this.xrefCache ??= pmCrossTargets(this.view.state.doc);
    return this.xrefCache;
  }

  /** Put the cursor at the start of the paragraph with this anchor. */
  private gotoAnchor(id: string): void {
    let at: number | undefined;
    this.view.state.doc.descendants((node, pos) => {
      if (at !== undefined) return false;
      if (node.type === schema.nodes.paragraph && node.attrs.anchor === id) at = pos;
      return node.type !== schema.nodes.paragraph;
    });
    if (at === undefined) return;
    this.view.dispatch(this.view.state.tr.setSelection(TextSelection.near(this.view.state.doc.resolve(at + 1))).scrollIntoView());
    this.view.focus();
  }

  /** Citation numbers and texts, recomputed after a change (DOC-027). */
  private citeCache: Citations | undefined;

  private citations(): Citations {
    if (!this.view) return citationsOf([], this.doc.references);
    this.citeCache ??= citationsOf(pmCiteRuns(this.view.state.doc), this.doc.references);
    return this.citeCache;
  }

  /** The sources changed: renumber the citations and the list. */
  private referencesChanged(): void {
    this.citeCache = undefined;
    for (const v of this.tocViews) v.refresh();
  }

  /** The document's sources and citation style (DOC-027). */
  private async editReferences(): Promise<void> {
    const cited = new Set(pmCiteRuns(this.view.state.doc).flatMap((c) => c.cite));
    const choice = await manageReferences(this.element, this.doc.references, cited);
    if (!choice) return;
    if (choice.references.entries.length || choice.references.style) this.doc.references = choice.references;
    else delete this.doc.references;
    this.referencesChanged();
    if (choice.insertList) this.command(insertBlockAfter(schema.nodes.bibliography!.create()));
    else this.changed();
    this.refocus();
  }

  /** Cite sources at the cursor, or change the citation at `pos` (DOC-027). */
  private async editCitation(pos?: number, node?: PmNode): Promise<void> {
    if (this.readOnly) return;
    const initial = node ? { cite: node.attrs.keys as string[], ...(node.attrs.locator ? { locator: node.attrs.locator as string } : {}) } : undefined;
    let result = await pickCitation(this.element, this.doc.references?.entries ?? [], initial);
    if (!result) return this.refocus();
    if (result === 'zotero') {
      // BIB-010: sources of the Zotero library, added to the document and cited.
      const { pickFromZotero } = await import('./zotero');
      const { mergeEntries } = await import('./bib-dialog');
      const added = await pickFromZotero(this.element, 'search');
      if (!added?.length) return this.refocus();
      this.doc.references = { ...this.doc.references, entries: mergeEntries(this.doc.references?.entries ?? [], added) };
      this.referencesChanged();
      result = { cite: [...new Set([...(initial?.cite ?? []), ...added.map((e) => e.key)])], ...(initial?.locator ? { locator: initial.locator } : {}) };
    }
    const tr = this.view.state.tr;
    if (result === 'remove') {
      if (pos !== undefined && node) tr.delete(pos, pos + node.nodeSize);
    } else {
      const cite = schema.nodes.cite!.create({ keys: result.cite, locator: result.locator ?? null });
      if (pos !== undefined && node) tr.replaceWith(pos, pos + node.nodeSize, cite);
      else tr.replaceSelectionWith(cite, false);
    }
    this.view.dispatch(tr.scrollIntoView());
    this.refocus();
  }

  /** Number a figure, table or equation (DOC-026). */
  private async editCaption(): Promise<void> {
    const state = this.view.state;
    const choice = await editCaption(this.element, { equation: inDisplayEquation(state), inTable: isInTable(state) });
    if (!choice) return;
    if (choice.kind === 'equation') this.command(numberEquation(newAnchor('equation')));
    else this.command(insertCaption(choice.kind, seqWord(choice.kind), choice.text, newAnchor(choice.kind)));
    this.refocus();
  }

  /** Refer to a numbered item or a heading (DOC-026). */
  private async insertCrossReference(): Promise<void> {
    const { targets } = this.crossRefs();
    const list: ReferenceTarget[] = [...targets.values()].map((x) => ({ id: x.id, kind: x.kind, label: x.label, description: x.description }));
    // Headings without an anchor get one when they are chosen.
    this.view.state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.paragraph) return true;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (/^h\d$/.test(node.attrs.style as string) && !node.attrs.anchor && text) list.push({ id: newAnchor('heading'), kind: 'heading', label: text, description: text, anchorAt: pos });
      return false;
    });
    const target = await pickReference(this.element, list);
    if (target) this.command(insertCrossReference(target.id, target.anchorAt));
    this.refocus();
  }

  private headings(levels: number): { level: number; text: string; pos: number }[] {
    const out: { level: number; text: string; pos: number }[] = [];
    this.view?.state.doc.descendants((node, pos) => {
      // DOC-049: headings in columns too.
      if (node.type === schema.nodes.columns) return true;
      const m = node.type === schema.nodes.paragraph ? /^h(\d)$/.exec(node.attrs.style as string) : null;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (m && Number(m[1]) <= levels && text) out.push({ level: Number(m[1]), text, pos });
      return false;
    });
    return out;
  }

  /** Footnotes in reading order, under the page; clicking one edits it. */
  private renderNotes(): void {
    const items: HTMLElement[] = [];
    this.view.state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.footnote) return true;
      const n = items.length + 1;
      const li = h('li', { value: String(n) });
      li.append(...markdownInline(node.attrs.runs as Run[]));
      li.addEventListener('click', () => void this.editNote(pos, node));
      items.push(li);
      return false;
    });
    this.notes.hidden = !items.length;
    this.notes.replaceChildren(...(items.length ? [h('h2', { class: 'sr-only' }, t('note.notes')), h('ol', {}, ...items)] : []));
    if (this.notes.querySelector('span.math')) void import('../math/ui').then(({ renderMath }) => renderMath(this.notes));
  }

  /** Insert a footnote at the cursor, or edit one; an emptied note is removed (DOC-022). */
  private async editNote(pos?: number, node?: PmNode): Promise<void> {
    if (this.readOnly) return;
    const { editFootnote } = await import('./footnote-dialog');
    const runs = await editFootnote(this.element, node?.attrs.runs as Run[] | undefined);
    if (!runs) return;
    if (pos !== undefined) {
      const tr = this.view.state.tr;
      if (runs.length) tr.setNodeMarkup(pos, undefined, { runs });
      else tr.delete(pos, pos + 1);
      this.view.dispatch(tr);
    } else if (runs.length) {
      this.command(insertInline(schema.nodes.footnote!.create({ runs })));
    }
    this.refocus();
  }

  private dispatch(tr: Transaction): void {
    this.rulersSoon();
    // REV-005: while tracking, edits are recorded as insertions and deletions.
    if (this.tracking && tr.docChanged && !tr.getMeta(REMOTE) && !tr.getMeta(UNTRACKED) && !isHistoryTransaction(tr)) {
      tr = trackTransaction(this.view.state, tr, { ...this.tracking, date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });
    }
    const state = this.view.state.apply(tr);
    this.view.updateState(state);
    if (tr.docChanged && !tr.getMeta(REMOTE)) this.changed();
    else if (tr.selectionSet) this.statusSoon();
    if (tr.docChanged) this.springsSoon();
    this.updateToolbar();
    if (tr.docChanged && this.findBar?.isOpen) this.findBar.refresh();
    if (this.writing.typewriter && (tr.docChanged || tr.selectionSet)) this.centerCursor();
    if (this.review.active) {
      if (tr.docChanged) this.review.relayout();
      else if (tr.selectionSet) this.review.reveal(state.selection.head);
    }
    if (tr.docChanged) {
      this.countWords();
      this.comments.refresh();
      this.changesPanel.refresh();
      // TEACH-001: the sheet variants appear with the first solution.
      const has = this.hasSolutions();
      if (has !== this.hadSolutions) {
        this.hadSolutions = has;
        this.ctx.headerChanged?.();
      }
    }
    else if (tr.selectionSet) this.comments.selectionChanged();
    if (tr.docChanged) {
      this.xrefCache = undefined;
      this.citeCache = undefined;
      this.renderNotes();
      for (const toc of this.tocViews) toc.refresh();
      this.dag.later();
    } else if (tr.getMeta(cellStateKey)) this.dag.later();
  }

  /** Give the focus back to the document, without touching the selection when it already has it. */
  private refocus(): void {
    if (!this.view.hasFocus()) this.view.focus();
  }

  private command(cmd: Command): boolean {
    return cmd(this.view.state, (tr) => this.view.dispatch(tr), this.view);
  }

  /** A line break in the paragraph (Shift+Enter), from a button or the command palette. */
  private insertLineBreak(): void {
    const { state } = this.view;
    this.view.dispatch(state.tr.replaceSelectionWith(schema.nodes.hard_break!.create()).scrollIntoView());
    this.view.focus();
  }

  /** A special character — superscripts, degrees, signs, Greek letters, arrows… — typed at the cursor. */
  private async insertSymbol(): Promise<void> {
    const { chooseSymbol } = await import('./symbols');
    const ch = await chooseSymbol(this.element);
    if (ch) this.view.dispatch(this.view.state.tr.insertText(ch).scrollIntoView());
    this.view.focus();
  }

  // --- code cells (CODE-001..CODE-005) ----------------------------------------

  // --- context menu (UI-021) ----------------------------------------------------

  /**
   * ``` and a language, then Enter, starts a code cell: typed ``` makes a code
   * paragraph, holding then only the language (`lua`, `python {run}`).
   */
  private fenceToCell(): boolean {
    const { $from, empty } = this.view.state.selection;
    const para = $from.parent;
    if (!empty || this.readOnly || para.type !== schema.nodes.paragraph) return false;
    const m = para.attrs.style === 'code' ? /^\s*([\w+#.-]+)\s*(\{(?:run|cell)\})?\s*$/.exec(para.textContent) : /^```\s*([\w+#.-]+)\s*(\{(?:run|cell)\})?\s*$/.exec(para.textContent);
    const lang = m && FENCE_LANGS[m[1]!.toLowerCase()];
    if (!lang) return false;
    this.view.dispatch(this.view.state.tr.delete($from.start(), $from.end()).setNodeMarkup($from.before(), undefined, { ...para.attrs, style: 'normal' }));
    void this.editCell(undefined, undefined, lang);
    return true;
  }

  /**
   * DOC-041: what a field shows. The editor is one long page: the page of a
   * field is counted from the page breaks before it.
   */
  private fieldContext(pos: number | undefined): FieldContext {
    let page = this.doc.page?.startAt ?? 1;
    let pages = 1;
    const doc = this.view?.state.doc;
    doc?.descendants((n, at) => {
      if (n.type !== schema.nodes.horizontal_rule || !n.attrs.page) return;
      pages++;
      if (pos !== undefined && at < pos) page++;
    });
    return { meta: this.doc.meta, fileName: this.ctx.fileName?.(), lang: this.lang(), page, pages: pages + (this.doc.page?.startAt ?? 1) - 1 };
  }

  /** The fields to insert, in a menu at the cursor (DOC-041). */
  private fieldMenu(): void {
    const r = this.view.coordsAtPos(this.view.state.selection.head);
    openContextMenu(r.left, r.bottom, [{ title: t('field.menu') }, ...FIELD_KINDS.map((kind): MenuAction => ({ label: t(`field.${kind}`), icon: FIELD_ICONS[kind], run: () => this.insertField(kind) }))], { label: t('field.menu'), returnFocus: this.view.dom });
  }

  /** FORM-003: the form fields to insert. */
  private inputEntries(): MenuEntry[] {
    return [{ title: t('form.inDoc') }, ...INPUT_KINDS.map((kind): MenuAction => ({ label: kindLabelOf(kind), icon: INPUT_ICONS[kind], run: () => void this.editInput(kind) }))];
  }

  private inputMenu(): void {
    const r = this.view.coordsAtPos(this.view.state.selection.head);
    openContextMenu(r.left, r.bottom, this.inputEntries(), { label: t('form.inDoc'), returnFocus: this.view.dom });
  }

  /** The names of the form fields of the document. */
  private inputNames(except?: number): Set<string> {
    const names = new Set<string>();
    this.view.state.doc.descendants((node, pos) => {
      if (node.type === schema.nodes.form_input && pos !== except) names.add(node.attrs.name as string);
    });
    return names;
  }

  /**
   * FORM-003: insert a form field at the cursor, or change the one at `pos`:
   * its name (the column of its answers), its choices, whether it is required.
   */
  private async editInput(kind: InputKind, pos?: number): Promise<void> {
    if (this.readOnly) return;
    const node = pos !== undefined ? this.view.state.doc.nodeAt(pos) : null;
    const { fieldDialog, freeName } = await import('../pdf/form-design');
    const taken = this.inputNames(pos);
    const props = await fieldDialog(this.element, kind, {
      name: node ? (node.attrs.name as string) : freeName(kind, taken),
      taken,
      groups: [],
      ...(node?.attrs.options ? { options: node.attrs.options as string[] } : {}),
      required: !!node?.attrs.required,
      ...(node ? { submit: t('common.ok') } : {}),
    });
    if (!props) return this.refocus();
    const options = kind === 'dropdown' ? props.options ?? [] : null;
    if (node && pos !== undefined && node.type === schema.nodes.form_input) {
      const value = options && node.attrs.value && !options.includes(node.attrs.value as string) ? null : node.attrs.value;
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, null, { ...node.attrs, name: props.name, options, required: props.required, value }));
    } else {
      this.command(insertInline(schema.nodes.form_input!.create({ input: kind, name: props.name, options, required: props.required })));
    }
    this.refocus();
  }

  /** DOC-042: springs and spaces to insert. */
  private spaceEntries(): MenuEntry[] {
    return [
      { title: t('space.menu') },
      { label: t('space.insertSpring'), icon: '⇕', run: () => this.insertSpace('spring') },
      { label: t('space.insertFixed'), icon: '↕', run: () => this.insertSpace('fixed') },
      { label: t('space.insertHfill'), icon: '⇔', run: () => this.insertSpace('hfill') },
    ];
  }

  private spaceMenu(): void {
    const r = this.view.coordsAtPos(this.view.state.selection.head);
    openContextMenu(r.left, r.bottom, this.spaceEntries(), { label: t('space.menu'), returnFocus: this.view.dom });
  }

  /** Replace a field with the text it shows now: a letter keeps the date it was sent (DOC-041). */
  private freezeField(pos: number): void {
    const node = this.view.state.doc.nodeAt(pos);
    if (node?.type !== schema.nodes.field) return;
    const text = fieldValue(node.attrs.kind as FieldKind, this.fieldContext(pos), { format: node.attrs.format ?? undefined, fixed: node.attrs.fixed ?? undefined });
    const tr = this.view.state.tr;
    if (text) tr.replaceWith(pos, pos + node.nodeSize, schema.text(text, this.view.state.doc.resolve(pos).marks()));
    else tr.delete(pos, pos + node.nodeSize);
    this.view.dispatch(tr);
  }

  /** DOC-050: the field at a position changed in its dialog. */
  private async editFieldAt(pos: number): Promise<void> {
    const node = this.view.state.doc.nodeAt(pos);
    if (node?.type !== schema.nodes.field) return;
    const { editField } = await import('./field-dialog');
    const run: FieldRun = { field: node.attrs.kind as FieldKind, ...(node.attrs.format ? { format: node.attrs.format as FieldFormat } : {}), ...(node.attrs.fixed ? { fixed: node.attrs.fixed as string } : {}) };
    const choice = await editField(this.element, run, this.fieldContext(pos));
    const now = this.view.state.doc.nodeAt(pos);
    if (!choice || now?.type !== schema.nodes.field) return this.refocus();
    if (choice.action === 'freeze') this.freezeField(pos);
    else if (choice.action === 'delete') this.view.dispatch(this.view.state.tr.delete(pos, pos + now.nodeSize));
    else this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { kind: choice.run.field, format: choice.run.format ?? null, fixed: choice.run.fixed ?? null }));
    this.refocus();
  }

  /** Insert a field at the cursor (DOC-041). */
  private insertField(kind: FieldKind): void {
    this.command(insertInline(schema.nodes.field!.create({ kind })));
    this.refocus();
  }

  /** `\vfill`, `\vspace{2cm}`, `\bigskip`… alone in a paragraph, then Enter: a spring or a space (DOC-042). */
  private typedSpace(): boolean {
    const { $from, empty } = this.view.state.selection;
    const para = $from.parent;
    if (!empty || this.readOnly || para.type !== schema.nodes.paragraph || $from.depth !== 1) return false;
    const space = parseSpaceLine(para.textContent);
    if (!space) return false;
    const pos = $from.before();
    const node = schema.nodes.space!.create({ stretch: space.stretch ?? null, size: space.size ?? null });
    const tr = this.view.state.tr.replaceWith(pos, pos + para.nodeSize, [node, schema.nodes.paragraph!.create()]);
    this.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(pos + node.nodeSize + 1))).scrollIntoView());
    return true;
  }

  /** `\hfill` typed before the cursor, then a space: a horizontal spring (DOC-042). */
  private typedFill(): boolean {
    const { $from, empty } = this.view.state.selection;
    if (!empty || this.readOnly || !$from.parent.isTextblock || $from.parent.attrs.style === 'code') return false;
    const before = $from.parent.textBetween(Math.max(0, $from.parentOffset - 40), $from.parentOffset, undefined, '\ufffc');
    const m = /\\(?:hfill|hspace\*?\{(?:\\fill|\\stretch\{\d*\.?\d+\})\})$/.exec(before);
    const fill = m && parseFill(m[0]);
    if (!fill) return false;
    this.view.dispatch(this.view.state.tr.replaceWith($from.pos - m[0].length, $from.pos, schema.nodes.hfill!.create({ weight: fill.hfill })).insertText(' '));
    return true;
  }

  /** The menu at the cursor (the ⋮ button, the keyboard). */
  private showContextMenuAtCursor(): void {
    const { head } = this.view.state.selection;
    const r = this.view.coordsAtPos(head);
    this.showContextMenu(r.left, r.bottom, null);
  }

  private showContextMenu(x: number, y: number, target: HTMLElement | null): boolean {
    const view = this.view;
    const editable = !this.readOnly && !this.reviewing;
    // A code cell under the pointer.
    const cellEl = target?.closest<HTMLElement>('.code-cell');
    const cellPos = cellEl ? cellHandle(cellEl)?.getPos() : undefined;
    const cell = cellPos !== undefined ? view.state.doc.nodeAt(cellPos) : null;
    if (cell?.type !== schema.nodes.code_cell && target) {
      // Elsewhere, the cursor goes where the pointer is, unless it is in the selection.
      const at = view.posAtCoords({ left: x, top: y });
      const { from, to } = view.state.selection;
      if (at && (at.pos < from || at.pos > to)) view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))));
    }
    const state = view.state;
    const empty = state.selection.empty;
    // A field under the pointer (DOC-041).
    const fieldEl = target?.closest<HTMLElement>('.pm-field');
    const fieldPos = fieldEl ? view.posAtDOM(fieldEl, 0) : undefined;
    const field = fieldPos !== undefined && view.state.doc.nodeAt(fieldPos)?.type === schema.nodes.field ? fieldPos : undefined;
    const cmd = (c: Command) => () => {
      this.command(c);
      this.refocus();
    };
    const entries: MenuEntry[] = [];
    if (cell?.type === schema.nodes.code_cell && cellPos !== undefined) {
      // CODE-020: a language not run here (and Julia, run by its notebooks) has no Run.
      const julia = !isRunLang(cell.attrs.lang as string);
      entries.push(
        { title: t('ctx.cell') },
        ...(julia || !editable ? [] : [{ label: t('code.run'), icon: '▶', run: () => this.onCellAction('run', cellPos, cell) }, { label: t('code.runAll'), icon: '⏩', run: () => this.onCellAction('run-all', cellPos, cell) }]),
        ...(editable
          ? [
              { label: t('code.edit'), icon: '✎', run: () => this.onCellAction('edit', cellPos, cell) },
              { label: t(cell.attrs.hidden ? 'code.showCode' : 'code.hideCode'), icon: cell.attrs.hidden ? '👁' : '🙈', run: () => this.onCellAction('toggle-code', cellPos, cell) },
              { label: t('ctx.deleteCell'), icon: '🗑', run: () => view.dispatch(view.state.tr.delete(cellPos, cellPos + cell.nodeSize)) },
            ]
          : []),
        'separator',
      );
    }
    // A spring or a space under the pointer (DOC-042).
    const springEl = target?.closest<HTMLElement>('.space, .hfill');
    const springPos = springEl ? view.posAtDOM(springEl, 0) : undefined;
    const springNode = springPos !== undefined ? view.state.doc.nodeAt(springPos) : null;
    if (springNode && springPos !== undefined && (springNode.type === schema.nodes.space || springNode.type === schema.nodes.hfill) && editable) {
      entries.push(
        { title: t('space.menu') },
        { label: t('space.change'), icon: '⇕', run: () => this.changeSpace(springPos) },
        { label: t('ctx.delete'), icon: '🗑', run: () => view.dispatch(view.state.tr.delete(springPos, springPos + springNode.nodeSize)) },
        'separator',
      );
    }
    if (field !== undefined && editable) {
      // DOC-041: what the field shows can be changed, or frozen into text.
      const kind = view.state.doc.nodeAt(field)?.attrs.kind as FieldKind;
      entries.push(
        { title: t('field.menu') },
        { label: t('field.edit'), icon: '✎', run: () => void this.editFieldAt(field) },
        ...FIELD_KINDS.filter((k) => k !== kind).map((k): MenuAction => ({ label: t('field.changeTo', { kind: t(`field.${k}`) }), icon: FIELD_ICONS[k], run: () => view.dispatch(view.state.tr.setNodeMarkup(field, undefined, { kind: k })) })),
        { label: t('field.freeze'), icon: '📌', run: () => this.freezeField(field) },
        'separator',
      );
    }
    // DOC-023: a table of contents under the pointer: its depth.
    const tocEl = target?.closest<HTMLElement>('nav.toc');
    const tocPos = tocEl && this.view.dom.contains(tocEl) ? view.posAtDOM(tocEl, 0) : undefined;
    const tocNode = tocPos !== undefined ? view.state.doc.nodeAt(tocPos) : null;
    if (tocNode?.type === schema.nodes.toc && tocPos !== undefined && editable) {
      const levels = tocNode.attrs.levels as number;
      entries.push(
        { title: t('toc.title') },
        ...[1, 2, 3, 4, 5, 6].map((n): MenuAction => ({ label: t('toc.levels', { n }), icon: n === levels ? '✓' : '', run: () => view.dispatch(view.state.tr.setNodeMarkup(tocPos, undefined, { ...tocNode.attrs, levels: n })) })),
        { label: t('ctx.delete'), icon: '🗑', run: () => view.dispatch(view.state.tr.delete(tocPos, tocPos + tocNode.nodeSize)) },
        'separator',
      );
    }
    // IMG-001: a picture under the pointer.
    const imgEl = target?.closest<HTMLElement>('img');
    const imgPos = imgEl && this.view.dom.contains(imgEl) ? view.posAtDOM(imgEl, 0) : undefined;
    const imgNode = imgPos !== undefined ? view.state.doc.nodeAt(imgPos) : null;
    if (imgNode?.type === schema.nodes.image && imgPos !== undefined && imgNode.attrs.image && editable) {
      entries.push(
        { title: t('ctx.picture') },
        this.doc.resources.get(imgNode.attrs.image as string)?.mediaType === 'image/svg+xml'
          ? { label: t('draw.edit'), icon: '✏️', run: () => void this.editDrawing(imgPos) }
          : { label: t('photo.edit'), icon: '🎨', run: () => void this.editPhoto(imgPos) },
        ...(['image/png', 'image/jpeg', 'image/webp'].includes(this.doc.resources.get(imgNode.attrs.image as string)?.mediaType ?? '') ? [{ label: t('paint.edit'), icon: '🖌', run: () => void this.paint(imgPos) }] : []),
        { label: t('picture.describe'), icon: '🏷', run: () => void this.describeImage(imgPos, imgNode) },
        'separator',
      );
    }
    // FORM-003: a form field under the pointer.
    const inputEl = target?.closest<HTMLElement>('.form-input');
    const inputPos = inputEl ? view.posAtDOM(inputEl, 0) : undefined;
    const inputNode = inputPos !== undefined ? view.state.doc.nodeAt(inputPos) : null;
    if (inputNode?.type === schema.nodes.form_input && inputPos !== undefined && editable) {
      entries.push(
        { title: `${INPUT_ICONS[inputNode.attrs.input as InputKind]} ${inputNode.attrs.name as string}` },
        { label: t('form.properties'), icon: '⚙', run: () => void this.editInput(inputNode.attrs.input as InputKind, inputPos) },
        { label: t('form.delete'), icon: '🗑', run: () => view.dispatch(view.state.tr.delete(inputPos, inputPos + inputNode.nodeSize)) },
        'separator',
      );
    }
    entries.push(
      { title: t('ctx.edit') },
      ...(editable ? [{ label: t('ctx.cut'), icon: '✂', shortcut: 'Ctrl+X', disabled: empty, run: () => this.clipboard('cut') }] : []),
      { label: t('ctx.copy'), icon: '⧉', shortcut: 'Ctrl+C', disabled: empty, run: () => this.clipboard('copy') },
      ...(editable ? [{ label: t('ctx.paste'), icon: '📋', shortcut: 'Ctrl+V', run: () => void this.pasteFromClipboard() }] : []),
      // DOC-020: the spacing and indents of the paragraph (letters, reports).
      ...(editable ? [{ label: t('para.button'), icon: '¶', run: () => void this.editParagraph() }] : []),
      // DOC-053: the named styles of the document.
      ...(editable ? [{ label: t('styles.manage'), icon: '🅰', run: () => void this.editStyles() }] : []),
    );
    if (editable) {
      const link = linkRange(state);
      if (link) {
        const href = linkAt(state)?.attrs.href as string | undefined;
        entries.push(
          { title: t('ctx.link') },
          { label: t('ctx.openLink'), icon: '↗', run: () => href && !href.startsWith('#') && (this.ctx.openLink?.(href) || (isSafeUrl(href) && window.open(href, '_blank', 'noopener'))) },
          { label: t('ctx.editLink'), icon: '🔗', run: () => this.insertLink() },
          { label: t('ctx.removeLink'), icon: '⛓', run: cmd(removeLink) },
        );
      }
      if (isInTable(state)) {
        const can = (c: Command): boolean => c(state);
        const table = (key: MessageKey, icon: string, c: Command): MenuAction => ({ label: t(key), icon, disabled: !can(c), run: cmd(c) });
        entries.push(
          { title: t('table.bar') },
          table('table.rowAbove', '⬆', addRowBefore),
          table('table.rowBelow', '⬇', addRowAfter),
          table('table.colLeft', '⬅', addColumnBefore),
          table('table.colRight', '➡', addColumnAfter),
          table('table.deleteRow', '⬌', deleteRow),
          table('table.deleteCol', '⬍', deleteColumn),
          table('table.merge', '⊞', mergeCells),
          table('table.split', '⊟', splitCell),
          table('table.header', 'H', toggleHeaderRow),
          table('table.delete', '🗑', deleteTable),
        );
      }
      entries.push(
        { title: t('group.insert') },
        { label: t('ctx.codeCell'), icon: '{ }', run: () => void this.editCell() },
        ...(isInTable(state) ? [] : [{ title: t('ctx.table') }, tableSizePicker((rows, cols) => t('ctx.tableSize', { rows, cols }), (rows, cols) => cmd(insertTable(rows, cols))())]),
        'separator',
        { label: t('common.insertImage'), icon: '🖼', run: () => void this.pickImage() },
        { label: t('draw.insert'), icon: '✏️', run: () => void this.editDrawing() },
        { label: t('paint.new'), icon: '🖌', run: () => void this.paint() },
        { label: t('doc.insertEquation'), icon: '∑', run: () => void this.editMath() },
        ...(link ? [] : [{ label: t('doc.insertLink'), icon: '🔗', run: () => this.insertLink() }]),
        { label: t('note.button'), icon: '¹', run: () => void this.editNote() },
        { label: t('comment.add'), icon: '💬', shortcut: 'Ctrl+Alt+M', run: () => this.addComment() },
        { title: t('field.menu') },
        ...FIELD_KINDS.map((kind): MenuAction => ({ label: t(`field.${kind}`), icon: FIELD_ICONS[kind], run: () => this.insertField(kind) })),
        ...this.inputEntries(),
        ...this.spaceEntries(),
        // DOC-049: columns, changed again from the context menu.
        { title: t('cols.title') },
        { label: t(columnsAt(state) ? 'cols.change' : 'cols.button'), icon: '▥', run: () => void this.editColumns() },
        ...(columnsAt(state) ? [{ label: t('doc.columnBreak'), icon: '⫼', shortcut: 'Ctrl+Shift+Enter', run: cmd(insertRule(false, true)) }, { label: t('cols.remove'), icon: '▭', run: cmd(setColumns(undefined)) }] : []),
      );
      if (!empty) entries.push('separator', { label: t('fmt.clear'), icon: '⌫', run: cmd(clearFormatting) });
    }
    openContextMenu(x, y, entries, { label: t('ctx.menu'), returnFocus: view.dom });
    return true;
  }

  /** Cut or copy the selection, as the keyboard does (ProseMirror serialises it). */
  private clipboard(action: 'cut' | 'copy'): void {
    this.view.focus();
    if (!document.execCommand(action)) this.ctx.notify?.(t('ctx.clipboardKeys'));
  }

  /** Paste what the clipboard holds, when the browser lets the page read it. */
  private async pasteFromClipboard(): Promise<void> {
    this.view.focus();
    try {
      if (navigator.clipboard?.read) {
        for (const item of await navigator.clipboard.read()) {
          if (item.types.includes('text/html')) return void this.view.pasteHTML(await (await item.getType('text/html')).text());
          if (item.types.includes('text/plain')) return void this.view.pasteText(await (await item.getType('text/plain')).text());
        }
        return;
      }
      this.view.pasteText(await navigator.clipboard.readText());
    } catch {
      this.ctx.notify?.(t('ctx.clipboardKeys'));
    }
  }

  private onCellAction(action: string, pos: number, node: PmNode): void {
    if (this.readOnly) return;
    if ((action === 'run' || action === 'run-all') && !isRunLang(node.attrs.lang as string)) return void (node.attrs.lang === 'julia' && window.alert(t('kslate.runHint')));
    if (action === 'run') void this.runCells([pos]);
    else if (action === 'run-all') void this.runCells(this.cellPositions());
    else if (action === 'stop') this.runner?.stop();
    else if (action === 'graph') void this.dag.show(this.allCells().findIndex((c) => c.pos === pos));
    else if (action === 'edit') void this.editCell(pos, node);
    // CODE-013: show or hide the code, the output staying.
    else if (action === 'toggle-code') this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, hidden: !node.attrs.hidden }));
  }

  /** CODE-013: hide (or show) the code of every cell of the document. */
  private setAllCodeHidden(hidden: boolean): void {
    const tr = this.view.state.tr;
    this.view.state.doc.descendants((n, pos) => {
      if (n.type === schema.nodes.code_cell && !!n.attrs.hidden !== hidden) tr.setNodeMarkup(pos, undefined, { ...n.attrs, hidden });
    });
    if (tr.docChanged) this.view.dispatch(tr);
  }

  private cellPositions(): number[] {
    const out: number[] = [];
    this.view.state.doc.descendants((n, pos) => {
      // DOC-038: Julia cells run in KaimonSlate, not here; CODE-020: nor the languages shown only.
      if (n.type === schema.nodes.code_cell && isRunLang(n.attrs.lang as string)) out.push(pos);
    });
    return out;
  }

  /** Insert a new cell on its own line (in `lang`), or edit an existing one (CODE-001). */
  private async editCell(pos?: number, node?: PmNode, lang?: CodeLang): Promise<void> {
    if (this.readOnly) return;
    const { editCell } = await import('../code/ui');
    const current = node?.attrs as { cell: string; lang: CodeLang; output: unknown; header: string | null } | undefined;
    // CODE-011: completion loads jedi the first time, longer than a keystroke waits: it starts now.
    if (this.runner?.started) void this.runner.complete('import sys\nsys.', 1, 4, 120_000);
    // CODE-011: the interpreter of the document's cells completes with what it knows, once running.
    const value = await editCell(this.element, current ? { lang: current.lang, code: current.cell, ...(current.header !== null && current.header !== undefined ? { fixedLang: true } : {}) } : lang ? { lang, code: '' } : undefined, (code, line, column, onLate) => this.runner?.complete(code, line, column, 2500, onLate) ?? Promise.resolve(null), !current);
    if (!value) return;
    // Changing the code makes the previous output stale.
    const unchanged = current && current.cell === value.code && current.lang === value.lang;
    const attrs = { cell: value.code, lang: value.lang, output: unchanged ? current.output : null };
    // The other attributes (hidden code, KaimonSlate header) stay.
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node?.attrs, ...attrs }));
    else this.command(insertOnOwnLine(schema.nodes.code_cell!.create(attrs)));
    this.refocus();
    // CODE-014: the cells using what it defined (before or now) are out of date.
    if (!unchanged && current && pos !== undefined && isRunLang(current.lang)) void this.markDependents(pos, { lang: current.lang, code: current.cell });
  }

  // --- reactive cells (CODE-014) -----------------------------------------------

  /** Analyses of cells by language and code; null when the code cannot be analysed. */
  private readonly analyses = new Map<string, Promise<CellDeps | null>>();
  /** Names defined by the cells run so far, by language. */
  private readonly defined = new Map<string, Set<string>>();

  private allCells(): { pos: number; node: PmNode }[] {
    const out: { pos: number; node: PmNode }[] = [];
    this.view.state.doc.descendants((node, pos) => {
      if (node.type === schema.nodes.code_cell && isRunLang(node.attrs.lang as string)) out.push({ pos, node });
    });
    return out;
  }

  /** What a cell defines and uses; Python needs the running interpreter unless `start`. */
  private async depsOf(lang: string, code: string, start: boolean): Promise<CellDeps | undefined> {
    const key = `${lang}\u0000${code}`;
    let found = this.analyses.get(key);
    if (!found) {
      if (lang === 'javascript') found = import('../code/ts-language').then(({ analyzeScript }) => analyzeScript(code)).catch(() => null);
      // CODE-018: Lua, SQL, R and C/C++ cells share no names with the others: they run in document order.
      else if (lang !== 'python') return { defs: [], refs: [] };
      else if (this.runner && (start || this.runner.started)) found = this.runner.analyze(code);
      else return undefined;
      this.analyses.set(key, found);
    }
    return (await found) ?? undefined;
  }

  private async graphOf(cells: { node: PmNode }[], start: boolean, extra?: { index: number; deps: CellDeps }) {
    const { buildGraph } = await import('../code/reactive');
    const deps = await Promise.all(cells.map((c) => this.depsOf(c.node.attrs.lang as string, c.node.attrs.cell as string, start)));
    if (extra && deps[extra.index]) {
      const d = deps[extra.index]!;
      deps[extra.index] = { defs: [...new Set([...d.defs, ...extra.deps.defs])], refs: [...new Set([...d.refs, ...extra.deps.refs])] };
    }
    return { deps, graph: buildGraph(cells.map((c, i) => ({ lang: c.node.attrs.lang as 'python' | 'javascript', ...(deps[i] ? { deps: deps[i] } : {}) }))) };
  }

  /** After a cell changed: mark what depends on it (on its old code or its new one) out of date. */
  private async markDependents(pos: number, before: { lang: string; code: string }): Promise<void> {
    if (loadReactivity() === 'off') return;
    const cells = this.allCells();
    const index = cells.findIndex((c) => c.pos === pos);
    if (index < 0) return;
    const old = await this.depsOf(before.lang, before.code, false);
    const { graph } = await this.graphOf(cells, false, old ? { index, deps: old } : undefined);
    const { descendants } = await import('../code/reactive');
    // The cell itself has not run since its code changed.
    const stale = [index, ...descendants(graph, [index])].map((i) => this.allCells()[i]?.pos).filter((p): p is number => p !== undefined);
    this.view.dispatch(markCells(this.view.state.tr, { stale }));
  }

  private cellError(error: CellError, cells: number[]): string {
    const list = cells.map((i) => i + 1).join(', ');
    return error.kind === 'multiple' ? t('code.definedTwice', { name: error.name, cells: list }) : t('code.cycle', { cells: list });
  }

  /** The sandbox of the document's code, with its widgets (CODE-016). */
  private async ensureRunner(): Promise<CodeRunner> {
    if (this.runner) return this.runner;
    const { CodeRunner } = await import('../code/runner');
    const runner = new CodeRunner(this.element);
    runner.confirmDownload = async (origin) => (await import('../code/ui')).confirmDownload(this.element, origin);
    runner.onWidgetChanged = (lang, names) => void this.widgetChanged(lang, names);
    this.runner = runner;
    return runner;
  }

  /** Draw the live widgets of a cell; a widget of an earlier session keeps its picture. */
  private mountWidgets(cell: HTMLElement): void {
    const host = this.runner?.widgets;
    const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    for (const slot of cell.querySelectorAll<HTMLElement>('.code-cell-widget[data-model]')) {
      const id = slot.dataset.model!;
      if (host?.has(id)) void host.mount(slot, id, dark);
      else if (!slot.querySelector('img')) slot.replaceChildren(h('span', { class: 'hint' }, t('widgets.notRunning')));
    }
  }

  /** CODE-016: a picture of each live widget, kept with the document (print, export, reopening). */
  private async captureWidgets(): Promise<void> {
    const host = this.runner?.widgets;
    if (!host) return;
    const updates: { pos: number; widgets: { id: string; snapshot?: string }[] }[] = [];
    for (const { pos, node } of this.allCells()) {
      const output = node.attrs.output as { widgets?: { id: string; snapshot?: string }[] } | null;
      if (!output?.widgets?.some((w) => host.has(w.id))) continue;
      const widgets = await Promise.all(
        output.widgets.map(async (w) => {
          const png = host.has(w.id) ? await host.snapshot(w.id) : undefined;
          return png ? { id: w.id, snapshot: addResource(this.doc, new Uint8Array(png), 'image/png') } : w;
        }),
      );
      updates.push({ pos, widgets });
    }
    if (!updates.length) return;
    const tr = this.view.state.tr.setMeta('addToHistory', false);
    for (const u of updates) {
      const node = tr.doc.nodeAt(u.pos)!;
      tr.setNodeMarkup(u.pos, undefined, { ...node.attrs, output: { ...(node.attrs.output as object), widgets: u.widgets } });
    }
    this.view.dispatch(tr);
  }

  /** A widget marked with `ui()` changed: the cells using it run again (CODE-016, CODE-014). */
  private async widgetChanged(lang: string, names: string[]): Promise<void> {
    const cells = this.allCells().filter((c) => c.node.attrs.lang === lang);
    const targets: number[] = [];
    for (const c of cells) {
      const deps = await this.depsOf(lang, c.node.attrs.cell as string, false);
      if (deps && names.some((n) => deps.refs.includes(n) && !deps.defs.includes(n))) targets.push(c.pos);
    }
    if (targets.length) await this.runCells(targets, loadReactivity() === 'off' ? 'off' : 'auto');
  }

  /** CODE-015: the cells, their states and their links, for the graph. */
  private async dagView(): Promise<DagView> {
    const [{ cellStates, edgesOf }, { LANG_LABEL }] = await Promise.all([import('../code/dag'), import('../code/ui')]);
    const cells = this.allCells();
    // Python is analysed by the interpreter: the sandbox starts, no code of the document runs.
    if (cells.some((c) => c.node.attrs.lang === 'python')) await this.ensureRunner();
    const { deps, graph } = await this.graphOf(cells, true);
    const now = this.allCells();
    if (now.length !== cells.length) return this.dagView();
    const stale = new Set(stalePositions(this.view.state).map((p) => cells.findIndex((c) => c.pos === p)).filter((i) => i >= 0));
    const states = cellStates(graph, cells.map((c) => (c.node.attrs.output ?? undefined) as { text: string; error?: boolean } | undefined), stale);
    const graphCells = cells.map((c, i) => ({ lang: c.node.attrs.lang as 'python' | 'javascript', ...(deps[i] ? { deps: deps[i] } : {}) }));
    return {
      nodes: cells.map((c, i) => ({ label: `${i + 1} · ${LANG_LABEL[c.node.attrs.lang as 'python' | 'javascript']}`, defs: deps[i]?.defs ?? [], state: states[i]! })),
      edges: edgesOf(graphCells, graph),
      ...(deps.some((d) => !d) ? { hint: t('code.dagUnknown') } : {}),
    };
  }

  /** Bring a cell into view and make it stand out for a moment. */
  private goToCell(index: number): void {
    const at = this.allCells()[index];
    const el = at && (this.view.nodeDOM(at.pos) as HTMLElement | null);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('dag-highlight');
    setTimeout(() => el.classList.remove('dag-highlight'), 1500);
  }

  /** Run cells in the sandbox and store their output in the document (CODE-002, CODE-005, CODE-014). */
  private async runCells(positions: number[], force?: 'lazy' | 'auto' | 'off'): Promise<void> {
    const ui = await import('../code/ui');
    if (!this.trusted) {
      if (!(await ui.confirmRun(this.element))) return;
      this.trusted = true;
    }
    await this.ensureRunner();
    const mode = force ?? loadReactivity();
    if (mode === 'off') return this.runInOrder(positions.map((pos) => ({ pos })));
    const reactive = await import('../code/reactive');
    const cells = this.allCells();
    for (const pos of positions) {
      const cell = (this.view.nodeDOM(pos) as HTMLElement | null)?.querySelector<HTMLElement>('.code-cell');
      if (cell) ui.setCellStatus(cell, t('code.analysing'));
    }
    const { deps, graph } = await this.graphOf(cells, true);
    const stale = new Set(stalePositions(this.view.state).map((p) => cells.findIndex((c) => c.pos === p)).filter((i) => i >= 0));
    // A cell whose names the interpreter does not hold (never run, or run in an earlier visit) must run first too.
    cells.forEach((c, i) => {
      const held = this.defined.get(c.node.attrs.lang as string);
      if ((deps[i]?.defs ?? []).some((n) => !n.startsWith('_') && !held?.has(n))) stale.add(i);
    });
    const targets = positions.map((p) => cells.findIndex((c) => c.pos === p)).filter((i) => i >= 0);
    const plan = reactive.planRun(graph, targets, mode, stale);
    // Names no cell defines any more are removed: no hidden state.
    for (const lang of ['python', 'javascript']) {
      const now = new Set(cells.flatMap((c, i) => (c.node.attrs.lang === lang ? (deps[i]?.defs ?? []) : [])));
      const before = this.defined.get(lang) ?? new Set<string>();
      this.runner!.forget(lang as 'python' | 'javascript', [...before].filter((n) => !now.has(n)));
      this.defined.set(lang, new Set([...before].filter((n) => now.has(n))));
    }
    // Cells in error say why, and do not run.
    const tr = this.view.state.tr;
    for (const i of targets) {
      const error = graph.errors.get(i);
      const at = cells[i]!;
      if (error) tr.setNodeMarkup(at.pos, undefined, { ...at.node.attrs, output: { text: this.cellError(error, error.cells), error: true } });
      else if (!plan.run.includes(i)) {
        const el = (this.view.nodeDOM(at.pos) as HTMLElement | null)?.querySelector<HTMLElement>('.code-cell');
        if (el) ui.setCellStatus(el, '');
      }
    }
    if (plan.stale.length) markCells(tr, { stale: plan.stale.map((i) => cells[i]!.pos) });
    if (tr.docChanged || plan.stale.length) this.view.dispatch(tr);
    const jsNames = new Set(cells.flatMap((c, i) => (c.node.attrs.lang === 'javascript' ? (deps[i]?.defs ?? []) : [])));
    const order = plan.run.map((i) => {
      const d = deps[i];
      const lang = cells[i]!.node.attrs.lang as string;
      const code = lang === 'javascript' && d ? reactive.scriptDeps(cells[i]!.node.attrs.cell as string, { defs: d.defs, refs: d.refs.filter((r) => jsNames.has(r) && !d.defs.includes(r)) }) : undefined;
      return { pos: cells[i]!.pos, index: i, ...(code !== undefined ? { code } : {}) };
    });
    await this.runInOrder(order, (index, ok) => {
      if (ok) for (const n of deps[index]?.defs ?? []) this.defined.set(cells[index]!.node.attrs.lang as string, (this.defined.get(cells[index]!.node.attrs.lang as string) ?? new Set()).add(n));
      // What depends on a failed cell does not run.
      return ok ? [] : [...reactive.descendants(graph, [index])];
    });
  }

  /**
   * Run cells one after the other; `after` tells which of the cells to come
   * must be skipped (they are then out of date). Without it, the first error stops.
   */
  private async runInOrder(list: { pos: number; index?: number; code?: string }[], after?: (index: number, ok: boolean) => number[]): Promise<void> {
    const ui = await import('../code/ui');
    const runner = this.runner!;
    // Positions move while cells run and the user types: follow the elements.
    const handles = list.map((x) => ({ ...x, handle: cellHandle((this.view.nodeDOM(x.pos) as HTMLElement | null)?.querySelector('.code-cell') ?? null) })).filter((x) => !!x.handle);
    for (const h of handles) ui.setCellStatus(h.handle!.element, t('code.queued'));
    const skipped = new Set<number>();
    for (const { handle, index, code } of handles) {
      const pos = handle!.getPos();
      const node = pos === undefined ? null : this.view.state.doc.nodeAt(pos);
      if (pos === undefined || !node || node.type !== schema.nodes.code_cell) continue;
      const cell = handle!.element;
      if (index !== undefined && skipped.has(index)) {
        ui.setCellStatus(cell, '');
        this.view.dispatch(markCells(this.view.state.tr, { stale: [pos] }));
        continue;
      }
      cell.classList.add('running');
      const source = code ?? (node.attrs.cell as string);
      // NOTE-002: a SQL cell of a note of the folder queries its notes.
      const notes = node.attrs.lang === 'sql' && usesNoteTables(source) ? await this.ctx.noteTables?.() : undefined;
      const result = await runner.run(node.attrs.lang as 'python' | 'javascript', source, (status) => {
        const text = status === 'loading-python' ? t('code.loadingPython') : status === 'running' ? t('code.running') : `${t('code.packages')} ${status.slice('packages:'.length)}`;
        ui.setCellStatus(cell, text);
      }, undefined, notes);
      const images = result.images.map((png) => addResource(this.doc, png, 'image/png'));
      const widgets = (result.widgets ?? []).map((id) => ({ id }));
      const output = { text: result.text, ...(result.error ? { error: true } : {}), ...(images.length ? { images } : {}), ...(widgets.length ? { widgets } : {}) };
      const now = handle!.getPos();
      const current = now === undefined ? null : this.view.state.doc.nodeAt(now);
      if (now !== undefined && current?.type === schema.nodes.code_cell) {
        this.view.dispatch(markCells(this.view.state.tr.setNodeMarkup(now, undefined, { ...current.attrs, output }), { fresh: [now] }));
        // The same output as before leaves the node as it was: the status shown while running goes.
        if (cell.isConnected && cell.querySelector('.code-cell-output.pending')) handle!.refresh();
      }
      if (!after) {
        if (result.error) {
          for (const rest of handles.slice(handles.findIndex((x) => x.handle === handle) + 1)) ui.setCellStatus(rest.handle!.element, '');
          break; // like a notebook's "run all": stop at the first error
        }
        continue;
      }
      for (const i of after(index!, !result.error)) skipped.add(i);
    }
    this.dag.later();
  }

  // --- diagrams, equations, properties ----------------------------------------

  /** Insert a new diagram on its own line, or edit an existing one (DIAG-001). */
  private async editDiagram(pos?: number, node?: PmNode): Promise<void> {
    if (this.readOnly) return;
    const { editDiagram } = await import('../diagram/ui');
    const source = await editDiagram(this.element, (node?.attrs.diagram as string | undefined) ?? '');
    if (source === null) return;
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...node!.attrs, diagram: source }));
    else this.command(insertOnOwnLine(schema.nodes.diagram!.create({ diagram: source, lang: 'mermaid' })));
    this.refocus();
  }

  /** Insert a new equation at the cursor, or edit an existing one (MATH-001). */
  private async editMath(pos?: number, node?: PmNode): Promise<void> {
    if (this.readOnly) return;
    const { editEquation } = await import('../math/ui');
    const value = await editEquation(this.element, node ? { latex: node.attrs.math as string, display: !!node.attrs.display } : undefined);
    if (!value) return;
    const attrs = { math: value.latex, display: value.display };
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, attrs));
    else this.command(insertInline(schema.nodes.math!.create(attrs)));
    this.refocus();
  }

  /** Document properties: title, author, keywords… (DOC-017). */
  /** The accessibility check, and a way to each issue (DOC-030). */
  private async checkAccessibility(): Promise<void> {
    const [{ checkAccessibility }, { showAccessibility }] = await Promise.all([import('./a11y'), import('./a11y-dialog')]);
    const choice = await showAccessibility(this.element, checkAccessibility(this.view.state.doc, this.doc.meta));
    if (!choice) return this.refocus();
    const { issue, fix } = choice;
    if (issue.kind === 'title' || issue.kind === 'language') return void this.editProperties();
    if (issue.pos === undefined) return;
    const node = this.view.state.doc.nodeAt(issue.pos);
    if (fix && node?.type === schema.nodes.image) return void this.describeImage(issue.pos, node);
    const tr = this.view.state.tr;
    if (node && !node.isText && node.type !== schema.nodes.paragraph && !node.isBlock) tr.setSelection(NodeSelection.create(tr.doc, issue.pos));
    else tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(issue.pos + 1, tr.doc.content.size))));
    this.view.dispatch(tr.scrollIntoView());
    if (fix && issue.kind === 'tableHeader') this.command(toggleHeaderRow);
    this.refocus();
  }

  private async editProperties(): Promise<void> {
    const { editProperties } = await import('./properties');
    const meta = await editProperties(this.element, this.doc.meta);
    if (!meta) return;
    this.doc.meta = meta;
    this.renderFurniture();
    this.changed();
  }

  // --- EditorView ---------------------------------------------------------------

  mounted(): void {
    // DOC-044: the mode last chosen for this kind of document (the file's name is known now).
    const saved = loadEditMode(this.modeKind());
    if (saved === 'reading' || (saved === 'source' && this.sourceLang())) this.setMode(saved);
    this.viewMenu.dispatchEvent(new Event('refill'));
    // NOTE-001: a Markdown note shows its properties (the file's name is known now).
    this.renderFurniture();
    // SET-002: documents with text may open in review mode.
    if (loadReading().review && this.view.state.doc.textContent.trim()) this.review.toggle(true, false);
  }

  focus(): void {
    this.view.focus();
  }

  /** FILE-029: where the document comes from. */
  origin(): string | undefined {
    return this.doc.meta.source;
  }

  setOrigin(url: string | undefined): void {
    if (url) this.doc.meta.source = url;
    else delete this.doc.meta.source;
  }

  status(): string {
    const { words, characters } = wordCount({ ...this.doc, blocks: this.currentBlocks() });
    const extra: string[] = [];
    if (this.goal) extra.push(t('goal.status', { words, goal: this.goal, pct: Math.min(100, Math.round((words / this.goal) * 100)) }));
    if (this.timerEnd) {
      const left = Math.max(0, Math.ceil((this.timerEnd - Date.now()) / 1000));
      extra.push(`⏱ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
    }
    if (this.writing.readability) {
      const r = readability(this.view.state.doc.textBetween(0, this.view.state.doc.content.size, '\n', ' '), this.lang());
      if (r) extra.push(t('read.status', { score: r.score, level: t(`read.${r.level}` as MessageKey) }));
    }
    if (this.tracking) extra.push(t('track.on'));
    const page = this.review.status();
    if (page) extra.unshift(page);
    return [t(words === 1 ? 'doc.word' : 'doc.words', { words, characters }), ...extra].join(' · ');
  }

  async save(format: Parameters<EditorView['save'] & object>[0]): Promise<Uint8Array> {
    await this.captureWidgets();
    this.doc.blocks = this.currentBlocks();
    // REV-001: comments whose text is gone are left out (an undo can still bring them back here).
    const out = { ...this.doc };
    pruneComments(out);
    return writeDocumentAsync(out, format as TextFormat);
  }

  /** The document's language, else the interface's. */
  private lang(): string {
    return this.doc.meta.language || getLocale();
  }

  /** DOC-037: the snippets: the open folder's, the user's, then the built-in ones (the last list kept to insert at once). */
  private snippetList: Snippet[] = [];
  private async snippets(): Promise<Snippet[]> {
    const folder = (await this.ctx.folderSnippets?.().catch(() => [])) ?? [];
    this.snippetList = mergeSnippets(folder, loadSnippets(), builtinSnippets((key) => t(key as MessageKey)));
    return this.snippetList;
  }

  private insertSnippetNamed(name: string): void {
    const snippet = this.snippetList.find((x) => x.name === name);
    if (snippet) void this.insertSnippetBody(snippet.body);
  }

  /** Fill the fields of a snippet and insert it at the cursor (at once, unless the clipboard is needed). */
  private async insertSnippetBody(body: string): Promise<void> {
    if (this.readOnly) return;
    let clipboard: string | undefined;
    if (body.includes('${clipboard}')) clipboard = await navigator.clipboard?.readText().catch(() => undefined);
    const text = expandSnippet(body, { now: new Date(), lang: this.lang(), title: this.doc.meta.title ?? '', ...(clipboard !== undefined ? { clipboard } : {}) });
    insertSnippet(this.view, blocksToPm(readMarkdown(text).blocks));
  }

  /** DOC-037: choose a snippet to insert, or manage the user's snippets. */
  private async openSnippets(): Promise<void> {
    const { chooseSnippet } = await import('./snippets-dialog');
    const { from, to } = this.view.state.selection;
    const selected = this.view.state.doc.textBetween(from, to, '\n\n');
    const chosen = await chooseSnippet(this.element, await this.snippets(), selected);
    if (chosen) await this.insertSnippetBody(chosen.body);
    else this.refocus();
  }

  /** "Text" menu: typography as you type, and transforms of the selection or the document (DOC-031, DOC-032). */
  private textToolsMenu(): HTMLSelectElement {
    const select = this.textTools;
    const fill = (): void => {
      select.replaceChildren(
        h('option', { value: '' }, t('text.tools')),
        h('option', { value: 'snippets' }, t('snippet.menu')),
        h('option', { value: 'typography' }, `${this.typography ? '✓ ' : ''}${t('text.typography')}`),
        ...TRANSFORMS.map((id) => h('option', { value: id }, t(`text.${id}` as MessageKey))),
      );
    };
    fill();
    select.addEventListener('change', () => {
      const value = select.value;
      select.value = '';
      if (value === 'snippets') return void this.openSnippets();
      if (value === 'typography') {
        this.typography = !this.typography;
        saveTypography(this.typography);
        fill();
      } else if (value && !this.readOnly) {
        this.command((state, dispatch) => {
          dispatch?.(transformText(state, value as TransformId, this.lang()).scrollIntoView());
          return true;
        });
      }
      this.refocus();
    });
    return select;
  }

  /** "View" menu: readability, focus and typewriter modes, writing goal (DOC-033..DOC-035). */
  private viewToolsMenu(): HTMLSelectElement {
    const select = this.viewMenu;
    const mark = (on: boolean): string => (on ? '✓ ' : '');
    const fill = (): void => {
      select.replaceChildren(
        h('option', { value: '' }, t('wview.menu')),
        // DOC-044: editing modes.
        h('option', { value: 'mode-visual' }, `${mark(this.mode === 'visual')}${t('mode.visual')}`),
        ...(this.sourceLang() ? [h('option', { value: 'mode-source' }, `${mark(this.mode === 'source')}${t('mode.source')}`)] : []),
        h('option', { value: 'mode-reading' }, `${mark(this.mode === 'reading')}${t('mode.reading')}`),
        h('option', { value: 'hyphenate' }, `${mark(this.element.classList.contains('hyphenate'))}${t('typo.hyphenate')}`),
        // DOC-054: each ruler on its own, and the unit of the page.
        h('option', { value: 'ruler-h' }, `${mark(this.element.classList.contains('show-ruler-h'))}${t('ruler.horizontal')}`),
        h('option', { value: 'ruler-v' }, `${mark(this.element.classList.contains('show-ruler-v'))}${t('ruler.vertical')}`),
        h('optgroup', { label: t('unit.label') }, ...LENGTH_UNITS.map((u) => h('option', { value: `unit-${u}` }, `${mark(loadLengthUnit() === u)}${t(`unit.${u}`)}`))),
        // NOTE-001: the properties of a Markdown note.
        ...(this.sourceLang() === 'markdown'
          ? [h('option', { value: 'props-show' }, `${mark(loadShowProperties())}${t('props.show')}`), ...(this.readOnly ? [] : [h('option', { value: 'props-add' }, t('props.addMenu'))])]
          : []),
        // UI-023: the paper on screen.
        h('optgroup', { label: t('paper.label') }, ...PAPERS.map((p) => h('option', { value: `paper-${p}` }, `${mark(loadPaper() === p)}${t(`paper.${p}`)}`))),
        // COLOR-002: the colours as a printer would print them.
        h('option', { value: 'proof' }, `${mark(this.element.classList.contains('soft-proof'))}${t('color.proof')}`),
        h('option', { value: 'readability' }, `${mark(this.writing.readability)}${t('wview.readability')}`),
        h('option', { value: 'focus' }, `${mark(this.writing.focus)}${t('wview.focus')}`),
        h('option', { value: 'typewriter' }, `${mark(this.writing.typewriter)}${t('wview.typewriter')}`),
        h('option', { value: 'goal' }, t('wview.goal')),
        h('option', { value: 'hide-code' }, t('code.hideAll')),
        h('option', { value: 'show-code' }, t('code.showAll')),
        h('option', { value: 'dag' }, `${mark(this.dag.open)}${t('code.dag')}`),
      );
    };
    fill();
    select.addEventListener('refill', fill);
    // The file's name (and so its source) may be known only once the document is shown.
    select.addEventListener('pointerdown', fill);
    select.addEventListener('focus', fill);
    select.addEventListener('change', () => {
      const value = select.value;
      select.value = '';
      if (value.startsWith('mode-')) {
        this.setMode(value.slice(5) as EditMode);
        fill();
        return;
      }
      const sides = this.rulerSides();
      if (value === 'ruler-h') saveRulerSides({ ...sides, horizontal: !sides.horizontal });
      if (value === 'ruler-v') saveRulerSides({ ...sides, vertical: !sides.vertical });
      if (value.startsWith('unit-')) saveLengthUnit(value.slice(5) as LengthUnit);
      if (value.startsWith('paper-')) savePaper(value.slice(6) as PaperPreference);
      if (value === 'props-show') {
        saveShowProperties(!loadShowProperties());
        this.renderFurniture();
      }
      if (value === 'props-add') this.addProperty();
      if (value === 'proof') this.element.classList.toggle('soft-proof');
      if (value === 'hyphenate') {
        const on = !this.element.classList.contains('hyphenate');
        this.element.classList.toggle('hyphenate', on);
        saveHyphenation(on);
      }
      if (value === 'goal') void this.editGoal();
      else if (value === 'hide-code' || value === 'show-code') this.setAllCodeHidden(value === 'hide-code');
      else if (value === 'dag') {
        if (this.dag.open) this.dag.close();
        else void this.dag.show();
      }
      else if (value === 'readability' || value === 'focus' || value === 'typewriter') this.setWriting({ [value]: !this.writing[value] });
      fill();
      this.refocus();
    });
    return select;
  }

  private setWriting(patch: Partial<typeof this.writing>): void {
    this.writing = { ...this.writing, ...patch };
    this.element.classList.toggle('focus-mode', this.writing.focus);
    this.element.classList.toggle('typewriter', this.writing.typewriter);
    this.view.dispatch(this.view.state.tr.setMeta(writingKey, { readability: this.writing.readability, focus: this.writing.focus, lang: this.lang() }));
    if (this.writing.typewriter) this.centerCursor();
    this.viewMenu.dispatchEvent(new Event('refill'));
    this.ctx.statusChanged();
  }

  /** Typewriter mode: the line of the cursor stays in the middle of the screen. */
  private centerCursor(): void {
    let scroller: HTMLElement | null = this.page.parentElement;
    while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement;
    const target = scroller ?? (document.scrollingElement as HTMLElement | null);
    if (!target) return;
    try {
      const at = this.view.coordsAtPos(this.view.state.selection.head);
      const box = scroller ? scroller.getBoundingClientRect() : { top: 0, height: window.innerHeight };
      target.scrollTop += at.top - (box.top + box.height / 2);
    } catch {
      /* not laid out */
    }
  }

  /** The key of the document's goal: its title or first heading. */
  private goalKey(): string {
    let first = '';
    this.view.state.doc.descendants((node) => {
      if (first) return false;
      if (node.type === schema.nodes.paragraph && /^h\d$/.test(node.attrs.style as string)) first = node.textContent.trim();
      return !first;
    });
    return this.doc.meta.title?.trim() || first || 'untitled';
  }

  private words(): number {
    return wordCount({ ...this.doc, blocks: this.currentBlocks() }).words;
  }

  private async editGoal(): Promise<void> {
    const { editGoal } = await import('./goal-dialog');
    const choice = await editGoal(this.element, { goal: this.goal, words: this.words() });
    if (!choice) return this.refocus();
    this.goal = choice.goal;
    saveGoal(this.goalKey(), choice.goal);
    if (choice.timer) this.startTimer(choice.timer);
    this.ctx.statusChanged();
    this.refocus();
  }

  /** A focus timer shown in the status bar. */
  private startTimer(minutes: number): void {
    clearInterval(this.timerTick);
    this.timerEnd = Date.now() + minutes * 60_000;
    this.timerTick = setInterval(() => {
      if (Date.now() >= this.timerEnd) {
        clearInterval(this.timerTick);
        this.timerEnd = 0;
        this.ctx.statusChanged();
        window.alert(t('goal.timerDone'));
        return;
      }
      this.ctx.statusChanged();
    }, 1000);
    this.ctx.statusChanged();
  }

  /** Words added since the last count go to today's statistics. */
  private countWords(): void {
    clearTimeout(this.wordsTimer);
    this.wordsTimer = setTimeout(() => {
      const now = this.words();
      if (this.lastWords !== undefined) addWritten(now - this.lastWords);
      this.lastWords = now;
    }, 2000);
  }

  /** Show or hide the solutions, on screen and in print (TEACH-001). */
  private toggleSolutions(): void {
    const hidden = this.element.classList.toggle('hide-solutions');
    this.solutionsButton.setAttribute('aria-pressed', String(hidden));
  }

  /** The exercise sheet: copies without the solutions (TEACH-001). */
  saveVariants(): SaveVariant[] {
    // PDF-020: the document typeset as a PDF, without the print dialog.
    const pdf: SaveVariant = {
      id: 'pdf-typeset',
      label: t('pdfx.saveAs'),
      format: 'pdf',
      suffix: '',
      save: async () => {
        const { typesetPdf } = await import('../pdf/typst-pdf');
        const doc = { ...this.doc, blocks: this.currentBlocks() };
        pruneComments(doc);
        return typesetPdf(doc, { host: this.element, fileName: this.ctx.fileName?.() });
      },
    };
    if (!this.hasSolutions()) return [pdf];
    return [pdf, ...(['odt', 'docx', 'md'] as const).map((format) => ({
      id: `sheet-${format}`,
      label: t('solution.sheet', { ext: format }),
      format,
      suffix: t('solution.sheetSuffix'),
      save: () => {
        const doc = withoutSolutions({ ...this.doc, blocks: this.currentBlocks() });
        pruneComments(doc);
        return writeDocumentAsync(doc, format);
      },
    }))];
  }

  /** N variants of the sheet and their answer keys, in a ZIP (TEACH-002). */
  /** TEACH-004: Bode and Nyquist plots of a transfer function, inserted as pictures. */
  private async insertControlPlots(): Promise<void> {
    if (this.readOnly) return;
    const { chooseControlPlots } = await import('../teach/control-dialog');
    const plots = await chooseControlPlots(this.element);
    if (!plots) return this.refocus();
    for (const plot of plots) {
      const key = addResource(this.doc, new TextEncoder().encode(plot.svg), 'image/svg+xml', 'plot.svg');
      this.command(insertInline(schema.nodes.image!.create({ image: key, alt: plot.alt })));
    }
    this.refocus();
  }

  /** TEACH-003: the questions of the document for a learning platform or AMC. */
  private async exportQuiz(): Promise<void> {
    const doc = { ...this.doc, blocks: this.currentBlocks() };
    const quiz = await import('../teach/quiz');
    const questions = quiz.quizQuestions(doc);
    if (!questions.length) return void window.alert(t('quiz.none'));
    const formats = [t('quiz.moodle'), t('quiz.gift'), t('quiz.amc')];
    const choice = await this.ctx.choose(t('quiz.title'), t('quiz.found', { n: questions.length, short: questions.filter((q) => q.kind === 'short').length }), formats, formats[0]!);
    if (!choice) return this.refocus();
    const stem = (doc.meta.title || this.ctx.fileName?.()?.replace(/\.[^.]+$/, '') || t('quiz.stem')).replace(/[\\/:*?"<>|]+/g, '-').trim();
    const { saveFile } = await import('../storage/file-io');
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
    if (choice === formats[0]) await saveFile(enc(quiz.moodleXml(questions, stem)), `${stem}-moodle.xml`, 'text', { mimeType: 'application/xml', extension: 'xml' });
    else if (choice === formats[1]) await saveFile(enc(quiz.giftText(questions)), `${stem}.gift.txt`, 'text', { mimeType: 'text/plain', extension: 'txt' });
    else await saveFile(enc(quiz.amcLatex(questions, { title: doc.meta.title || stem, lang: this.lang() })), `${stem}-amc.tex`, 'text', { mimeType: 'application/x-tex', extension: 'tex' });
    this.refocus();
  }

  private async generateVariants(): Promise<void> {
    const doc = { ...this.doc, blocks: this.currentBlocks() };
    const [{ definitions, draw, random, substitute, checkDefinitions }, { chooseVariants }] = await Promise.all([import('../teach/variants'), import('../teach/variants-dialog')]);
    const defs = definitions(doc);
    if (!defs.length) return window.alert(t('variants.none'));
    const problems = checkDefinitions(defs);
    if (problems.length) return window.alert(t('variants.error', { message: problems.join('\n') }));
    const choice = await chooseVariants(this.element, defs, this.hasSolutions());
    if (!choice) return this.refocus();
    const [{ writeZip }, { saveFile }] = await Promise.all([import('../core/zip'), import('../storage/file-io')]);
    const stem = (doc.meta.title || t('variants.stem')).replace(/[\\/:*?"<>|]+/g, '-').trim();
    const pad = (n: number): string => String(n).padStart(String(choice.count).length, '0');
    const entries: { path: string; data: Uint8Array | string }[] = [];
    const rows: string[] = [['variant', ...defs.map((d) => d.name)].join(',')];
    for (let i = 1; i <= choice.count; i++) {
      const values = draw(defs, random(choice.seed + i));
      const variant = substitute(doc, values);
      pruneComments(variant);
      entries.push({ path: `${stem}-${pad(i)}.${choice.format}`, data: await writeDocumentAsync(withoutSolutions(variant), choice.format) });
      if (choice.keys) entries.push({ path: `${stem}-${pad(i)}-${t('variants.keySuffix')}.${choice.format}`, data: await writeDocumentAsync(variant, choice.format) });
      rows.push([String(i), ...defs.map((d) => JSON.stringify(String(values[d.name] ?? '')))].join(','));
    }
    entries.push({ path: `${stem}-values.csv`, data: `${rows.join('\n')}\n` });
    await saveFile(writeZip(entries), `${stem}-variants.zip`, 'texzip', { mimeType: 'application/zip', extension: 'zip' });
    this.refocus();
  }

  /** DOC-036: the document combined with the rows of a table (CSV, TSV, workbook). */
  private async mailMerge(): Promise<void> {
    const doc = { ...this.doc, blocks: this.currentBlocks() };
    const merge = await import('./merge');
    const fields = merge.mergeFields(doc);
    if (!fields.length) return window.alert(t('merge.none'));
    // The data: a table of the open folder, or a file of the device.
    const inFolder = this.ctx.folderDataFiles?.() ?? [];
    const device = t('merge.fromDevice');
    const source = inFolder.length ? await this.ctx.choose(t('merge.title'), t('merge.pickData'), [...inFolder, device], inFolder[0]!) : device;
    if (!source) return this.refocus();
    let name = source;
    let bytes: Uint8Array;
    try {
      if (source === device) {
        const file = await pickDataFile();
        if (!file) return this.refocus();
        name = file.name;
        bytes = new Uint8Array(await file.arrayBuffer());
      } else bytes = await this.ctx.readFolderFile!(source);
      const wb = /\.xlsx$/i.test(name) ? (await import('../sheet/xlsx-reader')).readXlsx(bytes) : /\.ods$/i.test(name) ? (await import('../sheet/ods-reader')).readOds(bytes) : (await import('../sheet/csv')).readCsv(bytes, name);
      const table = merge.mergeTable(wb);
      const { chooseMerge } = await import('./merge-dialog');
      const format = 'odt';
      const choice = await chooseMerge(this.element, fields, table, name.replace(/^.*\//, ''), !!this.ctx.folderWritable?.(), format);
      if (!choice) return this.refocus();
      const stem = (doc.meta.title || t('merge.stem')).replace(/[\\/:*?"<>|]+/g, '-').trim();
      const { saveFile } = await import('../storage/file-io');
      const plain = withoutSolutions(doc);
      // UI-019: one document per row can take a while.
      const busy = <T,>(task: () => Promise<T>): Promise<T> => this.ctx.busy?.(task) ?? task();
      if (choice.output === 'single') {
        const all = merge.mergeAll(plain, table.rows);
        await saveFile(await busy(() => writeDocumentAsync(all, choice.format)), `${stem}-${t('merge.suffix')}.${choice.format}`, choice.format);
      } else {
        const names = merge.mergeNames(table.rows, choice.nameField, stem);
        const files: { path: string; data: Uint8Array }[] = [];
        await busy(async () => {
          for (const [i, row] of table.rows.entries()) files.push({ path: `${names[i]}.${choice.format}`, data: await writeDocumentAsync(merge.mergeOne(plain, row), choice.format) });
        });
        if (choice.output === 'folder') {
          const dir = `${stem} – ${t('merge.suffix')}`;
          await busy(async () => {
            for (const f of files) await this.ctx.writeFolderFile!(`${dir}/${f.path}`, f.data);
          });
          this.ctx.notify?.(t('merge.written', { n: files.length, dir }));
        } else {
          const { writeZip } = await import('../core/zip');
          await saveFile(writeZip(files), `${stem}-${t('merge.suffix')}.zip`, 'texzip', { mimeType: 'application/zip', extension: 'zip' });
        }
      }
    } catch (err) {
      window.alert(t('merge.error', { message: (err as Error).message }));
    }
    this.refocus();
  }

  private hasSolutions(): boolean {
    let found = false;
    this.view?.state.doc.descendants((node) => {
      if (found) return false;
      if (node.type === schema.nodes.paragraph && node.attrs.solution) found = true;
      return !found;
    });
    return found;
  }

  /** Record the edits as tracked changes, or stop (REV-005). */
  private async toggleTracking(): Promise<void> {
    if (this.tracking) this.tracking = undefined;
    else {
      const author = await askAuthor(t('comment.yourName'));
      this.tracking = author ? { author } : {};
    }
    this.trackButton.setAttribute('aria-pressed', String(!!this.tracking));
    this.element.classList.toggle('tracking', !!this.tracking);
    this.ctx.statusChanged();
  }

  /**
   * DOC-052: compare with another version of the document, chosen as a file:
   * the differences become tracked changes of the newer version.
   */
  private compareWith(): void {
    if (this.readOnly) return;
    const input = h('input', { type: 'file', accept: '.odt,.docx,.md,.mdz,.tex,.jl,.py,.zip' });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.compareWithFile(file);
    });
    input.click();
  }

  private async compareWithFile(file: File): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { detectFormat } = await import('../core/format');
    const format = detectFormat(file.name, bytes);
    if (!format || !['docx', 'odt', 'md', 'mdz', 'tex', 'texzip', 'jl', 'marimo'].includes(format)) return void window.alert(t('compare.notDocument', { name: file.name }));
    const thisName = this.ctx.fileName?.() ?? t('compare.thisDocument');
    const newer = t('compare.otherNewer', { name: file.name });
    const older = t('compare.otherOlder', { name: file.name });
    const which = await this.ctx.choose(t('compare.title'), t('compare.which', { name: file.name, current: thisName }), [newer, older], newer);
    if (!which) return;
    const run = async (): Promise<void> => {
      const { readDocument } = await import('./io');
      const { compareDocuments } = await import('./compare');
      const other = await readDocument(format as TextFormat, bytes);
      const current: RichDocument = { ...this.doc, blocks: this.currentBlocks() };
      const otherIsNewer = which === newer;
      const result = compareDocuments(otherIsNewer ? current : other, otherIsNewer ? other : current, { author: otherIsNewer ? file.name : thisName, date: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') });
      // Pictures of the other version, for its new paragraphs.
      if (otherIsNewer) for (const [key, res] of other.resources) if (!this.doc.resources.has(key)) this.doc.resources.set(key, res);
      this.replaceBlocks(result.doc.blocks, false, true);
      this.changesPanel.refresh();
      this.ctx.changed();
      window.alert(
        [t('compare.done', { inserted: result.inserted, deleted: result.deleted, paragraphs: result.paragraphs }), result.otherBlocks ? t('compare.otherBlocks', { n: result.otherBlocks }) : '', t('compare.howTo')].filter(Boolean).join('\n\n'),
      );
    };
    await (this.ctx.busy ? this.ctx.busy(run) : run());
  }

  // --- NOTE-001: the properties of a note -------------------------------------------

  /** FOLDER-026: under the page, the backlinks of the note. */
  private readonly bottom = h('div', { class: 'doc-page-bottom', hidden: true });

  pageBottom(el: HTMLElement | null): void {
    this.bottom.replaceChildren(...(el ? [el] : []));
    this.bottom.hidden = !el;
  }

  private readonly propertiesCard = new PropertiesCard({
    get: () => ({ meta: this.doc.meta, extra: typeof this.doc.extras?.frontMatter === 'string' ? this.doc.extras.frontMatter : '' }),
    set: (meta, extra) => {
      this.doc.meta = meta;
      const { frontMatter: _old, ...extras } = this.doc.extras ?? {};
      this.doc.extras = extra.trim() ? { ...extras, frontMatter: extra } : extras;
      this.changed();
    },
    readOnly: () => this.readOnly,
    open: (href) => {
      if (!this.ctx.openLink?.(href) && isSafeUrl(href)) window.open(href, '_blank', 'noopener');
    },
    tagColour: (tag) => this.ctx.tagColour?.(tag),
    suggestions: async (kind) => (await this.ctx.completions?.(kind)) ?? [],
  });

  /** Add a property to the note (and show its properties). */
  private addProperty(): void {
    if (this.readOnly || this.sourceLang() !== 'markdown') return;
    if (!loadShowProperties()) saveShowProperties(true);
    this.propertiesCard.add();
  }

  // --- DOC-053: named paragraph styles --------------------------------------------

  private readonly namedCss = h('style', { class: 'named-styles' });

  private currentStyleValue(): string {
    const state = this.view.state;
    const named = currentNamed(state);
    return named && this.doc.styles?.some((s) => s.id === named) ? `named:${named}` : currentStyle(state);
  }

  /** The styles of the document in the list of styles, and their look in the page. */
  private renderNamedStyles(): void {
    this.namedCss.textContent = namedStylesCss(this.doc.styles, '.doc-editor .ProseMirror');
    this.styleSelect.querySelector('optgroup.named')?.remove();
    this.styleSelect.querySelector(`option[value="${NEW_STYLE}"]`)?.remove();
    const group = h('optgroup', { class: 'named', label: t('styles.ofDocument') }, ...(this.doc.styles ?? []).map((s) => h('option', { value: `named:${s.id}` }, s.name)));
    if (this.doc.styles?.length) this.styleSelect.append(group);
    this.styleSelect.append(h('option', { value: NEW_STYLE }, t('styles.manage')));
    if (this.view) this.styleSelect.value = this.currentStyleValue();
  }

  /** The look of the current paragraph, to make a style from it. */
  private paragraphLook(): Omit<NamedStyle, 'id' | 'name'> {
    const { $from } = this.view.state.selection;
    const para = $from.parent;
    const look: Omit<NamedStyle, 'id' | 'name'> = {};
    const a = para.attrs as Record<string, unknown>;
    if (a.align) look.align = a.align as NamedStyle['align'];
    for (const k of ['spaceBefore', 'spaceAfter', 'indent', 'firstLine', 'lineHeight'] as const) if (typeof a[k] === 'number') look[k] = a[k] as number;
    let first: PmNode | undefined;
    para.forEach((n) => {
      if (!first && n.isText) first = n;
    });
    for (const m of first?.marks ?? []) {
      if (m.type === schema.marks.bold) look.bold = true;
      else if (m.type === schema.marks.italic) look.italic = true;
      else if (m.type === schema.marks.underline) look.underline = true;
      else if (m.type === schema.marks.smallCaps) look.smallCaps = true;
      else if (m.type === schema.marks.size) look.size = m.attrs.pt as number;
      else if (m.type === schema.marks.color) look.color = m.attrs.hex as string;
      else if (m.type === schema.marks.font) look.font = m.attrs.family as string;
    }
    return look;
  }

  /** The "Styles…" window: the styles of the document, then the paragraphs without a style that was deleted. */
  private async editStyles(): Promise<void> {
    if (this.readOnly) return;
    const { chooseStyles } = await import('./styles-dialog');
    const choice = await chooseStyles(this.element, this.doc.styles ?? [], this.paragraphLook(), currentNamed(this.view.state) ?? undefined);
    if (!choice) return this.refocus();
    if (choice.styles.length) this.doc.styles = choice.styles;
    else delete this.doc.styles;
    const kept = new Set(choice.styles.map((s) => s.id));
    const tr = this.view.state.tr;
    this.view.state.doc.descendants((node, pos) => {
      if (node.type === schema.nodes.paragraph && node.attrs.named && !kept.has(node.attrs.named as string)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, named: null });
      return true;
    });
    if (tr.docChanged) this.view.dispatch(tr);
    this.renderNamedStyles();
    if (choice.apply) this.command(setNamedStyle(choice.apply));
    this.ctx.changed();
    this.refocus();
  }

  /** Comment the selection or the word at the cursor (REV-001). */
  private addComment(): void {
    if (this.readOnly) return;
    if (!this.comments.add()) window.alert(t('comment.selectText'));
  }

  /** FILE-017: no edits while read-only (toolbars hidden, document not editable). */
  private readOnly = false;
  /** REVIEW-001: reading and commenting, the text itself not editable. */
  private reviewing = false;
  private review!: DocReview;

  setReadOnly(readOnly: boolean): void {
    this.readOnly = readOnly;
    this.element.classList.toggle('read-only', readOnly);
    this.view.setProps({});
    // NOTE-001: the properties of the note, to read only (or to change again).
    this.renderFurniture();
  }

  /** UI-018: the review mode in the palette, even when the toolbar is hidden (read-only). */
  commands(): import('../app/palette').PaletteCommand[] {
    const toggle = this.review.active
      ? { label: t('review.leaveTitle'), where: t('review.bar'), keys: ['Ctrl+Alt+R'], run: () => this.review.toggle(false) }
      : { label: t('review.mode'), where: t('doc.formatting'), keys: ['Ctrl+Alt+R'], keywords: REVIEW_KEYWORDS, run: () => this.review.toggle(true) };
    if (this.review.active || this.readOnly) return [toggle, ...this.review.commands()];
    // UI-022: what the context menu offers, by category.
    const where = t('doc.formatting');
    const fields = FIELD_KINDS.map((kind) => ({ label: t(`field.${kind}`), category: t('field.menu'), where, run: () => this.insertField(kind) }));
    const modes = (['visual', ...(this.sourceLang() ? ['source' as const] : []), 'reading'] as EditMode[]).filter((m) => m !== this.mode).map((m) => ({ label: t(`mode.${m}`), category: t('mode.menu'), where, run: () => this.setMode(m) }));
    const formInputs = INPUT_KINDS.map((kind) => ({ label: kindLabelOf(kind), category: t('form.inDoc'), where, run: () => void this.editInput(kind) }));
    const springs = (['spring', 'fixed', 'hfill'] as const).map((kind) => ({ label: t(kind === 'spring' ? 'space.insertSpring' : kind === 'fixed' ? 'space.insertFixed' : 'space.insertHfill'), category: t('space.menu'), where, run: () => this.insertSpace(kind) }));
    const state = this.view.state;
    const tableCmd = (key: MessageKey, cmd: Command) => ({ label: t(key), category: t('table.bar'), where, run: () => this.command(cmd) });
    const table = isInTable(state)
      ? [
          tableCmd('table.rowAbove', addRowBefore),
          tableCmd('table.rowBelow', addRowAfter),
          tableCmd('table.colLeft', addColumnBefore),
          tableCmd('table.colRight', addColumnAfter),
          tableCmd('table.deleteRow', deleteRow),
          tableCmd('table.deleteCol', deleteColumn),
          tableCmd('table.merge', mergeCells),
          tableCmd('table.split', splitCell),
          tableCmd('table.header', toggleHeaderRow),
          tableCmd('table.delete', deleteTable),
        ].filter((_c, i) => [addRowBefore, addRowAfter, addColumnBefore, addColumnAfter, deleteRow, deleteColumn, mergeCells, splitCell, toggleHeaderRow, deleteTable][i]!(state))
      : [];
    const menu = { label: t('ctx.menu'), category: t('ctx.edit'), where, run: () => this.showContextMenuAtCursor() };
    const compare = { label: t('compare.button'), category: t('group.review'), where, keywords: 'diff compare versions comparer', run: () => this.compareWith() };
    const columns = [
      { label: t(columnsAt(state) ? 'cols.change' : 'cols.button'), category: t('cols.title'), where, keywords: COLUMNS_KEYWORDS, run: () => void this.editColumns() },
      { label: t('doc.columnBreak'), category: t('cols.title'), where, keys: ['Ctrl+Shift+Enter'], run: () => this.command(insertRule(false, true)) },
    ];
    return [toggle, ...modes, ...this.review.commands(), ...fields, ...formInputs, ...springs, ...table, ...columns, menu, compare];
  }

  /** FOLDER-023: the colours of the tags changed. */
  tagsChanged(): void {
    this.view.dispatch(refreshNoteTags(this.view.state.tr));
  }

  /** FOLDER-002: show the first match of a search from the folder panel. */
  find(query: string): void {
    this.findBar.openWith(query);
  }

  /** DOC-028: the document, its sub-documents as include blocks. */
  masterDocument(): RichDocument {
    return { ...this.doc, blocks: this.currentBlocks() };
  }

  /** DOC-028: include a document of the folder (or a path) after the current block. */
  private async insertInclude(): Promise<void> {
    const docs = await this.ctx.folderDocuments?.();
    let src: string | null;
    if (docs?.length) src = await this.ctx.choose(t('master.include'), t('master.includeMessage'), docs, docs[0]!);
    else src = window.prompt(t('master.includePrompt'), 'chapter1.md');
    if (!src?.trim()) return this.refocus();
    this.command(insertBlockAfter(schema.nodes.include!.create({ src: src.trim() })));
    this.refocus();
  }

  agentTools(): AgentTool[] {
    return documentTools({
      doc: this.doc,
      getBlocks: () => this.currentBlocks(),
      setBlocks: (blocks) => this.replaceBlocks(blocks, false),
    });
  }

  /**
   * Replace the content with `blocks`, touching only the blocks that differ so
   * that the cursor and the undo history of untouched parts are kept.
   */
  private replaceBlocks(blocks: Block[], remote: boolean, untracked = false): void {
    const next = blocksToPm(blocks);
    const cur = this.view.state.doc;
    let start = 0;
    while (start < cur.childCount && start < next.childCount && cur.child(start).eq(next.child(start))) start++;
    let endCur = cur.childCount;
    let endNext = next.childCount;
    while (endCur > start && endNext > start && cur.child(endCur - 1).eq(next.child(endNext - 1))) {
      endCur--;
      endNext--;
    }
    if (start === endCur && start === endNext) return;
    const posOf = (doc: PmNode, index: number): number => {
      let pos = 0;
      for (let i = 0; i < index; i++) pos += doc.child(i).nodeSize;
      return pos;
    };
    const nodes: PmNode[] = [];
    for (let i = start; i < endNext; i++) nodes.push(next.child(i));
    const tr = this.view.state.tr.replaceWith(posOf(cur, start), posOf(cur, endCur), Fragment.from(nodes));
    if (remote) tr.setMeta(REMOTE, true).setMeta('addToHistory', false);
    // DOC-052: changes already marked, not recorded again while tracking.
    if (untracked) tr.setMeta(UNTRACKED, true);
    this.view.dispatch(tr);
  }

  /** Real-time collaboration: properties, images and one shared part per block (COLLAB-002). */
  collab(): CollabAdapter {
    return {
      read: () => documentParts(this.doc, this.currentBlocks()),
      write: (parts) => {
        this.replaceBlocks(applyDocumentParts(this.doc, parts), true);
        this.renderFurniture();
        this.renderNamedStyles();
        this.referencesChanged();
      },
      cursor: () => ({ block: this.view.state.selection.$from.index(0) }),
      showPeers: (peers: PeerCursor[]) => {
        const markers: PeerMarker[] = peers.flatMap((p) => {
          const block = (p.cursor as { block?: number } | undefined)?.block;
          return typeof block === 'number' ? [{ name: p.name, color: p.color, block }] : [];
        });
        this.view.dispatch(this.view.state.tr.setMeta(peersKey, markers).setMeta(REMOTE, true).setMeta('addToHistory', false));
      },
    };
  }

  /** Offline synchronisation (COLLAB-008): the whole document in and out. */
  syncable(): SyncableDocument {
    return {
      read: () => ({ ...this.doc, meta: { ...this.doc.meta }, blocks: this.currentBlocks() }),
      write: (doc) => {
        this.doc.meta = { ...doc.meta };
        if (doc.page) this.doc.page = doc.page;
        else delete this.doc.page;
        if (doc.references) this.doc.references = doc.references;
        else delete this.doc.references;
        if (doc.styles) this.doc.styles = doc.styles;
        else delete this.doc.styles;
        for (const [id, res] of doc.resources) if (!this.doc.resources.has(id)) this.doc.resources.set(id, res);
        this.replaceBlocks(doc.blocks, false);
        this.renderFurniture();
        this.renderNamedStyles();
        this.referencesChanged();
        this.ctx.changed();
      },
    };
  }

  async printContent(_settings?: PrintSettings): Promise<HTMLElement> {
    await this.captureWidgets();
    // DOC-048: printed in the document's language, hyphenated as on screen.
    const root = h('div', { class: `print-document${this.element.classList.contains('hyphenate') ? ' hyphenate' : ''}`, lang: this.lang() });
    for (const node of Array.from(this.view.dom.childNodes)) root.append(node.cloneNode(true));
    for (const el of Array.from(root.querySelectorAll('[contenteditable]'))) el.removeAttribute('contenteditable');
    for (const el of Array.from(root.querySelectorAll('.code-cell-bar, .ProseMirror-trailingBreak, .ProseMirror-separator, .column-resize-handle'))) el.remove();
    for (const el of Array.from(root.querySelectorAll<HTMLElement>('.peer-here'))) el.classList.remove('peer-here');
    // TEACH-001: the exercise sheet is printed without its solutions.
    if (this.element.classList.contains('hide-solutions')) for (const el of Array.from(root.querySelectorAll('[data-solution]'))) el.remove();
    // Header and footer in the page margins (DOC-024).
    const css = pageSetupCss(this.doc.page, this.doc.meta.title ?? '');
    if (css) root.prepend(h('style', {}, css));
    // Footnotes are printed as notes at the end of the document (DOC-022).
    if (!this.notes.hidden) {
      const notes = this.notes.cloneNode(true) as HTMLElement;
      notes.className = 'print-notes';
      root.append(notes);
    }
    return root;
  }

  destroy(): void {
    removeEventListener('resize', this.onResize);
    removeEventListener(RULERS_EVENT, this.onRulerSides);
    removeEventListener(UNIT_EVENT, this.onUnit);
    removeEventListener('beforeprint', this.beforePrint);
    removeEventListener('afterprint', this.onResize);
    if (this.springsFrame) cancelAnimationFrame(this.springsFrame);
    if (this.review.active) this.review.toggle(false, false);
    this.runner?.destroy();
    this.view.destroy();
    clearTimeout(this.statusTimer);
    if (typeof URL.revokeObjectURL === 'function') for (const url of this.urls.values()) if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------

  // --- springs (DOC-042) ------------------------------------------------------

  /** DOC-046: the paper and margins of the document (the default page when it has none). */
  private geometry(): PageGeometry {
    return this.doc.page?.geometry ?? defaultGeometry();
  }

  printPage(): PageGeometry {
    return this.geometry();
  }

  /** The page on screen as on paper: its width, margins, and a boundary at the end of each page's text. */
  private applyGeometry(): void {
    const g = this.geometry();
    const style = this.scroller.style;
    style.setProperty('--page-w', `${mmToPx(g.width)}px`);
    style.setProperty('--page-h', `${mmToPx(g.height)}px`);
    style.setProperty('--page-pad', [g.top, g.right, g.bottom, g.left].map((m) => `${mmToPx(m)}px`).join(' '));
    style.setProperty('--page-top', `${mmToPx(g.top)}px`);
    style.setProperty('--page-left', `${mmToPx(g.left)}px`);
    style.setProperty('--page-right', `${mmToPx(g.right)}px`);
    style.setProperty('--text-h', `${mmToPx(textHeight(g))}px`);
    this.page.dataset.paper = `${paperName(g) ?? `${g.width} × ${g.height} mm`}${isLandscape(g) ? ' ↔' : ''}`;
    this.springsSoon();
    this.rulersSoon();
  }

  /** DOC-047: a margin dragged on the ruler. */
  private setMargin(side: 'left' | 'right', mm: number): void {
    const g = { ...this.geometry() };
    const other = side === 'left' ? g.right : g.left;
    g[side] = Math.max(0, Math.min(mm, g.width - other - 20));
    this.doc.page = cleanPageSetup({ ...this.doc.page, geometry: g }) ?? { geometry: g };
    this.applyGeometry();
    this.changed();
  }

  private rulersSoon(): void {
    if (this.rulersFrame || typeof requestAnimationFrame !== 'function') return;
    this.rulersFrame = requestAnimationFrame(() => {
      this.rulersFrame = 0;
      this.updateRulers();
    });
  }

  /** The rulers follow the page and the paragraph of the cursor. */
  private updateRulers(): void {
    if (!this.element.classList.contains('show-rulers') || !this.view || this.view.isDestroyed) return;
    const g = this.geometry();
    const rect = this.page.getBoundingClientRect();
    if (!rect.width) return;
    const pxPerMm = rect.width / g.width;
    const para = this.view.state.selection.$from.parent.attrs as { indent?: number | null; firstLine?: number | null };
    const ends: number[] = [];
    for (let k = 1; (g.top + k * textHeight(g)) * pxPerMm < rect.height - 1; k++) ends.push((g.top + k * textHeight(g)) * pxPerMm);
    this.rulers.render({ geometry: g, pxPerMm, indent: para.indent ?? 0, firstLine: para.firstLine ?? 0, height: rect.height, pageEnds: ends });
  }

  private rulerSides(): RulerSides {
    return { horizontal: this.element.classList.contains('show-ruler-h'), vertical: this.element.classList.contains('show-ruler-v') };
  }

  private showRulers(sides: RulerSides): void {
    this.element.classList.toggle('show-ruler-h', sides.horizontal);
    this.element.classList.toggle('show-ruler-v', sides.vertical);
    this.element.classList.toggle('show-rulers', sides.horizontal || sides.vertical);
    if (this.view && (sides.horizontal || sides.vertical)) this.rulersSoon();
  }

  private readonly onRulerSides = (e: Event): void => this.showRulers((e as CustomEvent<RulerSides>).detail);
  private readonly onUnit = (e: Event): void => this.rulers.setUnit((e as CustomEvent<LengthUnit>).detail);

  private springsFrame = 0;
  private readonly onResize = (): void => {
    this.springsSoon();
    this.rulersSoon();
  };

  /** Lay the springs out again, once the page is drawn. */
  private springsSoon(): void {
    if (this.springsFrame || typeof requestAnimationFrame !== 'function') return;
    this.springsFrame = requestAnimationFrame(() => {
      this.springsFrame = 0;
      if (this.view && !this.view.isDestroyed) layoutSprings(this.view, mmToPx(textHeight(this.geometry())));
    });
  }

  /** Before printing: the springs of the printed page, as wide as it is. */
  private readonly beforePrint = (): void => {
    const g = this.geometry();
    const style = this.page.style;
    const saved = [style.width, style.maxWidth, style.padding];
    style.width = `${mmToPx(textWidth(g))}px`;
    style.maxWidth = 'none';
    style.padding = '0';
    layoutSprings(this.view, mmToPx(textHeight(g)));
    style.width = saved[0]!;
    style.maxWidth = saved[1]!;
    style.padding = saved[2]!;
  };

  /** A vertical spring, a fixed space or a horizontal spring at the cursor. */
  private insertSpace(kind: 'spring' | 'fixed' | 'hfill'): void {
    if (kind === 'hfill') {
      this.command(insertInline(schema.nodes.hfill!.create({ weight: 1 })));
    } else if (kind === 'spring') {
      this.command(insertOnOwnLine(schema.nodes.space!.create({ stretch: 1 })));
    } else {
      void this.spaceChoice(false, { size: Math.round((72 / 2.54) * 100) / 100 }, this.springWeights(undefined), true).then((value) => {
        if (value) this.command(insertOnOwnLine(schema.nodes.space!.create({ stretch: value.stretch ?? null, size: value.size ?? null, fraction: value.fraction ?? null })));
        this.refocus();
      });
      return;
    }
    this.refocus();
  }

  private async spaceChoice(horizontal: boolean, current: import('./space-dialog').SpaceValue, others: number, isNew = false): Promise<import('./space-dialog').SpaceValue | null> {
    const { spaceDialog } = await import('./space-dialog');
    return spaceDialog(this.element, { horizontal, current, others, isNew });
  }

  /**
   * The weight of the other vertical springs of the page of `pos` (pages are
   * what lies between page breaks), or of the other horizontal springs of its
   * line; for a new space, of the page of the cursor.
   */
  private springWeights(pos: number | undefined, horizontal = false): number {
    const doc = this.view.state.doc;
    if (horizontal && pos !== undefined) {
      const $pos = doc.resolve(pos);
      let sum = 0;
      $pos.parent.forEach((child, offset) => {
        if (child.type === schema.nodes.hfill && $pos.start() + offset !== pos) sum += child.attrs.weight as number;
      });
      return sum;
    }
    const at = pos ?? this.view.state.selection.from;
    let page = 0;
    let target = -1;
    const weights = new Map<number, number>();
    doc.forEach((node, offset) => {
      if (offset <= at && at < offset + node.nodeSize) target = page;
      if (node.type === schema.nodes.horizontal_rule && node.attrs.page) page++;
      else if (node.type === schema.nodes.space && node.attrs.stretch && offset !== pos) weights.set(page, (weights.get(page) ?? 0) + (node.attrs.stretch as number));
    });
    return weights.get(target < 0 ? page : target) ?? 0;
  }

  /** Change a spring (its share, as a weight) or a space (its height), or turn one into the other (DOC-042). */
  private changeSpace(pos: number): void {
    const node = this.view.state.doc.nodeAt(pos);
    if (!node) return;
    const horizontal = node.type === schema.nodes.hfill;
    const a = node.attrs as { stretch?: number | null; weight?: number; size?: number | null; fraction?: number | null };
    const current = horizontal ? { stretch: a.weight! } : { ...(a.stretch ? { stretch: a.stretch } : {}), ...(a.size ? { size: a.size } : {}), ...(a.fraction ? { fraction: a.fraction } : {}) };
    void this.spaceChoice(horizontal, current, this.springWeights(pos, horizontal)).then((value) => {
      const now = this.view.state.doc.nodeAt(pos);
      if (value && now?.type === node.type) {
        this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, horizontal ? { weight: value.stretch ?? 1 } : { stretch: value.stretch ?? null, size: value.size ?? null, fraction: value.fraction ?? null }));
        this.springsSoon();
      }
      this.refocus();
    });
  }

  private currentBlocks(): Block[] {
    if (this.mode === 'source') this.syncSource();
    const blocks = pmToBlocks(this.view.state.doc);
    // DOC-042: springs as shown, for the formats without springs.
    const { spaces, fills } = measureSprings(this.view);
    for (const b of blocks) if (b.type === 'space') b.size = spaces.shift() ?? b.size;
    for (const p of allParagraphs(blocks)) {
      for (const r of p.runs) {
        if (!isFillRun(r)) continue;
        const at = fills.shift();
        if (at !== undefined && at >= 0) r.at = at;
      }
    }
    return blocks.length ? blocks : [{ type: 'paragraph', style: 'normal', runs: [] }];
  }

  private resolve(key: string): ImageInfo | undefined {
    const res = this.doc.resources.get(key);
    if (!res) return undefined;
    let url = this.urls.get(key);
    if (!url) {
      url =
        typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(new Blob([res.data as BlobPart], { type: res.mediaType }))
          : `data:${res.mediaType};base64,${bytesToBase64(res.data)}`;
      this.urls.set(key, url);
    }
    return { url };
  }

  /** Map a pasted <img> to a resource key. */
  private lookup(img: HTMLImageElement): string | undefined {
    const key = img.dataset.resource;
    if (key && this.doc.resources.has(key)) return key;
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('data:image/')) {
      const decoded = decodeDataUri(src);
      if (decoded) return addResource(this.doc, decoded.data, decoded.mediaType);
    }
    return undefined;
  }

  private changed(): void {
    this.ctx.changed();
    this.statusSoon();
  }

  private statusSoon(): void {
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => this.ctx.statusChanged(), 150);
  }

  // --- toolbar ------------------------------------------------------------------

  private toolbar(): HTMLElement {
    const bar = this.buildToolbar();
    // Toolbar buttons never take the focus: the editor keeps its selection, and
    // the next key goes to the document (a refocus could lose the selection).
    bar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    return bar;
  }

  private buildToolbar(): HTMLElement {
    const act = (label: string, text: string, fn: () => void, title = label): HTMLButtonElement =>
      button(
        label,
        () => {
          fn();
          this.refocus();
        },
        { text, title },
      );
    const mark = (name: string, label: string, text: string, shortcut: string): HTMLButtonElement => {
      const b = act(label, text, () => this.command(toggleMark(schema.marks[name]!)), `${label} (${shortcut})`);
      b.setAttribute('aria-pressed', 'false');
      this.markButtons.push([name, b]);
      return b;
    };
    const state = (label: string, text: string, cmd: Command, active: () => boolean, shortcut: string): HTMLButtonElement => {
      const b = act(label, text, () => this.command(cmd), `${label} (${shortcut})`);
      b.setAttribute('aria-pressed', 'false');
      this.stateButtons.push([active, b]);
      return b;
    };
    const align = (a: Align, label: string, text: string, shortcut: string): HTMLButtonElement => state(label, text, setAlign(a), () => currentAlign(this.view.state) === a, shortcut);
    // UI-020: the most used tools in sight, the others in menus.
    const compact = loadToolbarMode() === 'compact';
    return h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': t('doc.formatting') },
      // REVIEW-001: the review mode, named, first in the toolbar.
      withKeywords(act(t('review.mode'), compact ? '📖' : `📖 ${t('review.mode')}`, () => this.review.toggle(true), t('review.modeTitle')), REVIEW_KEYWORDS),
      h('span', { class: 'sep' }),
      act(t('common.undo'), '↶', () => this.command(undo), `${t('common.undo')} (Ctrl+Z)`),
      act(t('common.redo'), '↷', () => this.command(redo), `${t('common.redo')} (Ctrl+Y)`),
      h('span', { class: 'sep' }),
      this.styleSelect,
      h('span', { class: 'sep' }),
      mark('bold', t('common.bold'), 'B', 'Ctrl+B'),
      mark('italic', t('common.italic'), 'I', 'Ctrl+I'),
      mark('underline', t('common.underline'), 'U', 'Ctrl+U'),
      state(t('common.bullets'), '•≡', toggleList(false), () => inList(this.view.state, false), 'Ctrl+Shift+8'),
      state(t('common.numbering'), '1≡', toggleList(true), () => inList(this.view.state, true), 'Ctrl+Shift+7'),
      toolGroup(t('group.format'), 'A', [
        mark('strike', t('common.strike'), 'S', 'Ctrl+Shift+X'),
        mark('smallCaps', t('fmt.smallCaps'), 'Sᴄ', 'Ctrl+Shift+K'),
        mark('code', t('doc.inlineCode'), '</>', 'Ctrl+`'),
        this.fontSelect,
        this.sizeSelect.element,
        this.colorControl(t('fmt.color'), 'A', '#c00000', (hex) => this.command(setMarkValue(schema.marks.color!, hex ? { hex } : null)), t('fmt.automatic')),
        this.colorControl(t('fmt.highlight'), '🖍', '#ffff00', (hex) => this.command(setMarkValue(schema.marks.highlight!, hex ? { hex } : null)), t('fmt.noHighlight')),
        act(t('fmt.clear'), '⌫', () => this.command(clearFormatting), `${t('fmt.clear')} (Ctrl+Space)`),
      ]),
      toolGroup(t('group.paragraph'), '¶', [
        align('left', t('common.alignLeft'), '⇤', 'Ctrl+L'),
        align('center', t('common.alignCenter'), '↔', 'Ctrl+E'),
        align('right', t('common.alignRight'), '⇥', 'Ctrl+R'),
        align('justify', t('common.justify'), '☰', 'Ctrl+J'),
        act(t('para.indentLess'), '⇠', () => this.command(changeIndent(-1))),
        act(t('para.indentMore'), '⇢', () => this.command(changeIndent(1))),
        this.lineSelect,
        act(t('para.button'), '¶', () => void this.editParagraph()),
        act(t('styles.manage'), '🅰', () => void this.editStyles()),
      ]),
      toolGroup(t('group.insert'), '＋', [
        act(t('doc.insertLink'), '🔗', () => this.insertLink(), t('doc.insertLinkTitle')),
        act(t('common.insertImage'), '🖼', () => void this.pickImage()),
        act(t('pdf.sign'), '✍', () => void this.sign(), t('mark.signTitle')),
        act(t('draw.insert'), '✏️', () => void this.editDrawing(), t('draw.insertTitle')),
        act(t('paint.new'), '🖌', () => void this.paint(), t('paint.newTitle')),
        act(t('doc.insertTable'), '▦', () => this.command(insertTable()), t('doc.insertTableTitle')),
        act(t('doc.insertEquation'), '∑', () => void this.editMath(), t('doc.insertEquationTitle')),
        act(t('doc.insertCode'), '{ }', () => void this.editCell(), t('doc.insertCodeTitle')),
        act(t('doc.insertDiagram'), '⧉', () => void this.editDiagram(), t('doc.insertDiagramTitle')),
        act(t('note.button'), '¹', () => void this.editNote(), `${t('note.insert')} (Ctrl+Alt+F)`),
        act(t('field.insert'), '⌗', () => this.fieldMenu(), t('field.insertTitle')),
        act(t('form.insertField'), '☑', () => this.inputMenu(), t('form.insertFieldTitle')),
        act(t('space.menu'), '⇕', () => this.spaceMenu(), t('space.menu')),
        act(t('xref.captionButton'), '🏷', () => void this.editCaption(), t('xref.captionButtonTitle')),
        act(t('xref.button'), '↪', () => void this.insertCrossReference(), t('xref.buttonTitle')),
        act(t('bib.cite'), '❝', () => void this.editCitation(), t('bib.citeTitle')),
        act(t('bib.title_'), '📚', () => void this.editReferences(), t('bib.buttonTitle')),
        act(t('master.include'), '📄', () => void this.insertInclude(), t('master.includeTitle')),
        act(t('toc.button'), '§', () => this.command(insertToc), t('toc.insertTitle')),
        act(t('doc.insertRule'), '―', () => this.command(insertRule())),
        act(t('doc.pageBreak'), '⤓', () => this.command(insertRule(true)), `${t('doc.pageBreak')} (Ctrl+Enter)`),
        act(t('cols.button'), '▥', () => void this.editColumns(), t('cols.buttonTitle')),
        act(t('doc.columnBreak'), '⫼', () => this.command(insertRule(false, true)), `${t('doc.columnBreak')} (Ctrl+Shift+Enter)`),
        act(t('doc.lineBreak'), '↵', () => this.insertLineBreak(), `${t('doc.lineBreak')} (Shift+Enter)`),
        act(t('doc.symbol'), 'Ω', () => void this.insertSymbol(), t('doc.symbolTitle')),
        act(t('snippet.title'), '✂', () => void this.openSnippets(), t('snippet.menu')),
      ]),
      h('span', { class: 'sep' }),
      act(t('find.title'), '🔍', () => this.findBar.open(false), `${t('find.title')} (Ctrl+F, Ctrl+H)`),
      // UI-021: the context menu at the cursor, for touch screens (also a long press) and the keyboard.
      act(t('ctx.button'), '⋮', () => this.showContextMenuAtCursor(), t('ctx.buttonTitle')),
      ...(compact ? [] : [this.textToolsMenu(), this.viewToolsMenu()]),
      toolGroup(t('group.review'), '💬', [act(t('comment.add'), '💬', () => this.addComment(), `${t('comment.add')} (Ctrl+Alt+M)`), this.trackButton, act(t('compare.button'), '⇆', () => this.compareWith(), t('compare.buttonTitle')), act(t('a11y.button'), '♿', () => void this.checkAccessibility(), t('a11y.buttonTitle'))]),
      toolGroup(t('group.teach'), '🎓', [
        state(t('solution.button'), '✓', (s, d) => setParagraphAttrs({ solution: !paragraphAttr(s, 'solution') })(s, d), () => !!paragraphAttr(this.view.state, 'solution'), t('solution.title')),
        this.solutionsButton,
        act(t('variants.button'), '🎲', () => void this.generateVariants(), t('variants.buttonTitle')),
        act(t('merge.button'), '✉', () => void this.mailMerge(), t('merge.buttonTitle')),
        act(t('quiz.button'), '📝', () => void this.exportQuiz(), t('quiz.buttonTitle')),
        act(t('control.button'), '📈', () => void this.insertControlPlots(), t('control.buttonTitle')),
      ]),
      toolGroup(t('group.document'), '📄', [...(compact ? [this.textToolsMenu(), this.viewToolsMenu()] : []), act(t('meta.button'), 'ⓘ', () => void this.editProperties(), t('meta.buttonTitle')), act(t('hf.button'), '▤', () => void this.editPageSetup())]),
    );
  }

  /** Contextual bar shown while the cursor is in a table (DOC-025). */
  private buildTableBar(): HTMLElement {
    const act = (key: MessageKey, text: string, cmd: Command): HTMLButtonElement => {
      const b = button(
        t(key),
        () => {
          this.command(cmd);
          this.refocus();
        },
        { text, title: t(key) },
      );
      this.tableButtons.push([cmd, b]);
      return b;
    };
    this.tableBar = h(
      'div',
      { class: 'toolbar table-bar', role: 'toolbar', 'aria-label': t('table.bar'), hidden: '' },
      h('span', { class: 'table-bar-label' }, t('table.bar')),
      act('table.rowAbove', '⬆+', addRowBefore),
      act('table.rowBelow', '⬇+', addRowAfter),
      act('table.colLeft', '⬅+', addColumnBefore),
      act('table.colRight', '➡+', addColumnAfter),
      h('span', { class: 'sep' }),
      act('table.deleteRow', '⬌−', deleteRow),
      act('table.deleteCol', '⬍−', deleteColumn),
      h('span', { class: 'sep' }),
      act('table.merge', '⊞', mergeCells),
      act('table.split', '⊟', splitCell),
      act('table.header', 'H', toggleHeaderRow),
      h('span', { class: 'sep' }),
      act('table.delete', '🗑', deleteTable),
    );
    this.tableBar.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    return this.tableBar;
  }

  private updateToolbar(): void {
    const state = this.view?.state;
    if (!state) return;
    const inTable = isInTable(state);
    this.tableBar.hidden = !inTable;
    if (inTable) for (const [cmd, b] of this.tableButtons) b.disabled = !cmd(state);
    for (const [name, b] of this.markButtons) b.setAttribute('aria-pressed', String(markActive(state, schema.marks[name]!)));
    for (const [active, b] of this.stateButtons) b.setAttribute('aria-pressed', String(active()));
    this.styleSelect.value = this.currentStyleValue();
    const font = (markValue(state, schema.marks.font!, 'family') as string | undefined) ?? '';
    if (font && ![...this.fontSelect.options].some((o) => o.value === font)) this.fontSelect.append(h('option', { value: font }, font));
    this.fontSelect.value = font;
    const size = markValue(state, schema.marks.size!, 'pt') as number | undefined;
    this.sizeSelect.set(size);
    const line = paragraphAttr(state, 'lineHeight') as number | null | undefined;
    if (line && ![...this.lineSelect.options].some((o) => o.value === String(line))) this.lineSelect.append(h('option', { value: String(line) }, `↕ ${line}`));
    this.lineSelect.value = line ? String(line) : '';
  }

  /** A colour button: applies the last colour; the swatch picks another; × removes it. */
  private colorControl(label: string, text: string, initial: string, apply: (hex: string | null) => void, resetLabel: string): HTMLElement {
    const picker = h('input', { type: 'color', value: initial, 'aria-label': label, title: label });
    const main = button(label, () => {
      apply(picker.value);
      this.refocus();
    }, { text, title: label, className: 'color-apply' });
    main.style.setProperty('--swatch', initial);
    picker.addEventListener('change', () => {
      main.style.setProperty('--swatch', picker.value);
      apply(picker.value);
      this.refocus();
    });
    const reset = button(resetLabel, () => {
      apply(null);
      this.refocus();
    }, { text: '×', title: resetLabel, className: 'color-reset' });
    // COLOR-001: a colour by its RGB or CMYK values.
    const more = button(`${label}: ${t('color.more')}`, async () => {
      const { colorDialog } = await import('../color/dialog');
      const hex = await colorDialog(this.element, { title: label, current: picker.value });
      if (hex) {
        picker.value = hex;
        main.style.setProperty('--swatch', hex);
        apply(hex);
      }
      this.refocus();
    }, { text: '⋯', title: t('color.more'), className: 'color-more' });
    return h('span', { class: 'color-control' }, main, picker, more, reset);
  }

  /** Paragraph spacing dialog (DOC-020). */
  private async editParagraph(): Promise<void> {
    const { editParagraphLayout } = await import('./paragraph-dialog');
    const node = this.view.state.selection.$from.parent;
    const a = node.attrs as Record<string, number | null>;
    const pick = (k: string): number | undefined => a[k] ?? undefined;
    const initial = { indent: pick('indent'), firstLine: pick('firstLine'), spaceBefore: pick('spaceBefore'), spaceAfter: pick('spaceAfter'), lineHeight: pick('lineHeight') };
    const value = await editParagraphLayout(this.element, Object.fromEntries(Object.entries(initial).filter(([, v]) => v !== undefined)));
    if (!value) return;
    this.command(setParagraphAttrs({ indent: value.indent ?? null, firstLine: value.firstLine ?? null, spaceBefore: value.spaceBefore ?? null, spaceAfter: value.spaceAfter ?? null, lineHeight: value.lineHeight ?? null }));
    this.refocus();
  }

  private insertLink(): void {
    const current = linkAt(this.view.state)?.attrs.href as string | undefined;
    const url = window.prompt(t('doc.linkPrompt'), current ?? 'https://');
    if (url === null) return;
    if (!url || url === 'https://') {
      if (current) this.command(toggleMark(schema.marks.link!, { href: current }));
      return;
    }
    if (!isSafeUrl(url)) {
      window.alert(t('doc.linkRefused'));
      return;
    }
    this.command(setLink(url));
  }

  // --- images, paste, drop -----------------------------------------------------

  private async pickImage(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml';
    const file = await new Promise<File | null>((resolve) => {
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
    if (file) await this.insertImageFile(file);
  }

  /** MARK-001: the signature pad of the PDF viewer; the signature inserted as a picture at the cursor. */
  private async sign(): Promise<void> {
    if (this.readOnly) return;
    const { askSignature, fitSize } = await import('../app/mark');
    const sig = await askSignature(this.element);
    if (!sig) return this.refocus();
    const key = addResource(this.doc, sig.png, 'image/png', 'signature.png');
    const size = fitSize(sig.width, sig.height, 240, 120);
    this.command(insertInline(schema.nodes.image!.create({ image: key, alt: t('pdf.signature'), width: size.w, height: size.h })));
    this.refocus();
  }

  private async insertImageFile(file: File, pos?: number, describe = true): Promise<void> {
    if (!file.type.startsWith('image/')) return;
    const data = new Uint8Array(await file.arrayBuffer());
    const key = addResource(this.doc, data, file.type, file.name);
    const node = schema.nodes.image!.create({ image: key, alt: null });
    const at = pos ?? this.view.state.selection.from;
    if (pos !== undefined) this.view.dispatch(this.view.state.tr.insert(pos, node));
    else this.command(insertInline(node));
    // IMG-003: describe the picture and caption it, right away.
    const placed = this.view.state.doc.nodeAt(at)?.type === schema.nodes.image ? at : undefined;
    if (describe && placed !== undefined) await this.describeImage(placed, this.view.state.doc.nodeAt(placed)!, true);
  }

  /** The alternative text of a picture, and a caption when it is new (IMG-003). */
  /** IMG-001: crop, turn, lighten, blur or resize a picture of the document. */
  private async editPhoto(pos: number): Promise<void> {
    const node = this.view.state.doc.nodeAt(pos);
    const res = node?.type === schema.nodes.image ? this.doc.resources.get(node.attrs.image as string) : undefined;
    if (!node || !res || this.readOnly) return;
    const { editPhoto } = await import('../images/photo-editor');
    const edited = await editPhoto(this.element, res.data, res.mediaType);
    if (!edited) return this.refocus();
    const current = this.view.state.doc.nodeAt(pos);
    if (current?.type !== schema.nodes.image) return;
    const key = addResource(this.doc, edited.bytes, edited.mediaType, res.name);
    // The shown width is kept (no wider than the picture), the height follows the new proportions.
    const width = Math.min((current.attrs.width as number | null) ?? edited.width, edited.width);
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, image: key, width, height: Math.round((width * edited.height) / edited.width) }));
    this.refocus();
  }

  /** DRAW-007: a new drawing, or a drawing (any SVG picture) of the document edited again. */
  private async editDrawing(pos?: number): Promise<void> {
    if (this.readOnly) return;
    const node = pos !== undefined ? this.view.state.doc.nodeAt(pos) : null;
    const res = node?.type === schema.nodes.image ? this.doc.resources.get(node.attrs.image as string) : undefined;
    const [{ editDrawing }, { fromSvg, toSvg }] = await Promise.all([import('../draw/editor'), import('../draw/svg')]);
    let initial;
    try {
      initial = res ? fromSvg(new TextDecoder().decode(res.data)) : undefined;
    } catch {
      initial = undefined;
    }
    if (initial && !initial.alt && node?.attrs.alt) initial.alt = node.attrs.alt as string;
    const drawing = await editDrawing(this.element, initial);
    if (!drawing) return this.refocus();
    const key = addResource(this.doc, new TextEncoder().encode(toSvg(drawing)), 'image/svg+xml', res?.name ?? 'drawing.svg');
    const attrs = { image: key, alt: drawing.alt ?? null, width: drawing.width, height: drawing.height };
    const current = pos !== undefined ? this.view.state.doc.nodeAt(pos) : null;
    if (pos !== undefined && current?.type === schema.nodes.image) this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, ...attrs }));
    else this.command(insertInline(schema.nodes.image!.create(attrs)));
    this.refocus();
  }

  /** DRAW-008: a new painting, or a picture of the document painted on. */
  private async paint(pos?: number): Promise<void> {
    if (this.readOnly) return;
    const node = pos !== undefined ? this.view.state.doc.nodeAt(pos) : null;
    const res = node?.type === schema.nodes.image ? this.doc.resources.get(node.attrs.image as string) : undefined;
    const { paintPicture } = await import('../paint/editor');
    const painted = await paintPicture(this.element, res ? { bytes: res.data, mediaType: res.mediaType } : undefined);
    if (!painted) return this.refocus();
    const key = addResource(this.doc, painted.bytes, painted.mediaType, res?.name ?? 'picture.png');
    const current = pos !== undefined ? this.view.state.doc.nodeAt(pos) : null;
    if (pos !== undefined && current?.type === schema.nodes.image) {
      // The shown width is kept (no wider than the picture), the height follows.
      const width = Math.min((current.attrs.width as number | null) ?? painted.width, painted.width);
      this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, image: key, width, height: Math.round((width * painted.height) / painted.width) }));
    } else this.command(insertInline(schema.nodes.image!.create({ image: key, width: painted.width, height: painted.height })));
    this.refocus();
  }

  private async describeImage(pos: number, node: PmNode, isNew = false): Promise<void> {
    if (this.readOnly) return;
    const { editPicture } = await import('./picture-dialog');
    const choice = await editPicture(this.element, { alt: node.attrs.alt as string | null, src: this.resolve(node.attrs.image as string)?.url, withCaption: isNew });
    if (!choice) return this.refocus();
    const current = this.view.state.doc.nodeAt(pos);
    if (current?.type !== schema.nodes.image) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, alt: choice.alt });
    tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)));
    this.view.dispatch(tr);
    if (choice.caption) this.command(insertCaption('figure', seqWord('figure'), choice.caption, newAnchor('figure')));
    this.refocus();
  }

  private onPaste(e: ClipboardEvent): boolean {
    const data = e.clipboardData;
    if (!data) return false;
    const images = Array.from(data.files).filter((f) => f.type.startsWith('image/'));
    if (images.length) {
      void (async () => {
        for (const f of images) await this.insertImageFile(f, undefined, images.length === 1);
      })();
      return true;
    }
    const html = data.getData('text/html');
    // Content copied from this editor keeps its exact structure.
    if (!html || html.includes('data-pm-slice')) return false;
    // Other sources: only the supported subset survives; pasted data: images become resources.
    const holder = document.createElement('div');
    holder.innerHTML = sanitizeHtml(html, (img) => this.lookup(img));
    const blocks = domToBlocks(holder, (img) => this.lookup(img));
    if (!blocks.length) return false;
    const nodes = blocks.map(blockToPm);
    const { $from, empty } = this.view.state.selection;
    if (empty && $from.parent.type === schema.nodes.paragraph && $from.parent.content.size === 0 && $from.depth > 0) {
      // An empty line takes the pasted blocks as they are (headings stay headings).
      const tr = this.view.state.tr.replaceWith($from.before(), $from.after(), Fragment.from(nodes));
      this.view.dispatch(tr.scrollIntoView());
      return true;
    }
    const open = (n: PmNode | undefined): number => (n?.type === schema.nodes.paragraph ? 1 : 0);
    const slice = new Slice(Fragment.from(nodes), open(nodes[0]), open(nodes[nodes.length - 1]));
    this.view.dispatch(this.view.state.tr.replaceSelection(slice).scrollIntoView());
    return true;
  }

  private onDrop(e: DragEvent): boolean {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return false;
    const pos = this.view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
    void (async () => {
      for (const f of files) await this.insertImageFile(f, pos, files.length === 1);
    })();
    return true;
  }
}

/** DOC-036: a table file of the device (CSV, TSV, workbook). */
function pickDataFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.tsv,.txt,.xlsx,.ods';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
