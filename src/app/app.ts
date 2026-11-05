/** Application shell: start screen, header toolbar, file open/save flow. */
import { BROWSER_ORIGIN } from '../storage/recent';
import { inExam } from '../exam/mode';
import { backupDue, loadBackupSettings } from '../backup/settings';
import { NEW_HOME, movedFrom } from './move';
import { backupAge as backupAgeText, lastBackupText as backupLastText } from '../backup/text';
import { getLocale, LOCALES, setLocale, t, type Locale, type MessageKey } from '../i18n';
import {
  detectFormat,
  fileExtension,
  formatKind,
  formatLabel,
  isArchive,
  MAX_ARCHIVE_SIZE,
  MAX_FILE_SIZE,
  MIME_TYPES,
  saveFormatsFor,
  type DocumentFormat,
  type DocumentKind,
} from '../core/format';
import { isTemplate, isTemplateBase, TEMPLATE_FORMATS, templateExtension, templateMimeType, toTemplate, type TemplateBase } from '../core/template-format';
import { defaultFormat, FORMAT_FAMILIES, loadFormatFamily, saveFormatFamily, type FormatFamily } from '../core/format-preference';
import { pickFile, readFileBytes, replaceExtension, saveFile } from '../storage/file-io';
import { forgetPlace, forgetPlaces, loadPlaces } from '../storage/places';
import { toolGroup } from './tool-groups';
import { captureDrop, droppedFolder, isFolderDrop } from '../fs/drop';
import { renamedKeepingExtension, splitExtension } from '../core/filename';
import type { AssistantPanel } from '../ai/panel';
import type { GitAccount } from '../git/accounts';
import type { GitRepo } from '../git/types';
import { versionLabel } from './build-info';
import { busyText, button, h } from './dom';
import { applyTheme, loadTheme, nextTheme, saveTheme } from './theme';
import { newView, openView, type EditorView, type ViewContext } from './views';

/** Where a document opened from a git repository lives (GIT-003). */
interface RepoSource {
  account: GitAccount;
  repo: GitRepo;
  branch: string;
  path: string;
  version: string;
}

/** FILE-020: the template file formats offered for a kind. */
const templateBasesFor = (kind: DocumentKind): TemplateBase[] => TEMPLATE_FORMATS.filter((f) => formatKind(f) === kind);

interface OpenDocument {
  name: string;
  format: DocumentFormat;
  kind: DocumentKind;
  view: EditorView;
  source?: RepoSource;
  /** Opened from a Grist document: Save sends the changes back (GRIST-003). */
  grist?: GristSource;
  /** Opened from or saved to Nextcloud / WebDAV: Save writes it back (DAV-003). */
  dav?: CloudSource;
  /** Path in the open folder: Save writes it back there (FOLDER-001). */
  folderPath?: string;
  /** Shown without allowing changes (FILE-017). */
  readOnly?: boolean;
  /** Its source cannot be written (read-only folder): editing needs a copy. */
  locked?: boolean;
  /** Made from a template file: a new document, not tied to where the template is (FILE-020). */
  fromTemplate?: boolean;
  /** FILE-029: its repository or server was found again from its metadata (its version is read when saving). */
  originRestored?: boolean;
}

interface CloudSource {
  account: import('../webdav/ui').DavAccount;
  path: string;
  /** Version that was read or last written, to detect concurrent changes. */
  etag?: string;
}

interface GristSource {
  account: import('../grist/ui').GristAccount;
  doc: import('../grist/client').GristDoc;
  snapshot: import('../grist/workbook').GristSnapshot;
}


/** Storage for the autosaved draft (FILE-011). */
export interface DraftStore {
  save(draft: { name: string; format: DocumentFormat; bytes: Uint8Array }): Promise<void>;
  load(): Promise<{ name: string; format: DocumentFormat; bytes: Uint8Array; savedAt?: number } | undefined>;
  clear(): Promise<void>;
}

export interface AppOptions {
  drafts?: DraftStore;
  /** Autosave period in milliseconds (default 30 s). */
  autosaveMs?: number;
  /** The address of the page (default: the browser's), for the moving notice (BACKUP-006). */
  location?: string;
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** AGPL-3.0 §13: offer the source code to every user. */
const SOURCE_URL = 'https://github.com/progressive-web-office/progressive-web-office.github.io';

const KIND_KEY = { document: 'kind.document', spreadsheet: 'kind.spreadsheet', presentation: 'kind.presentation', pdf: 'kind.pdf', file: 'kind.file' } as const;

const BROWSER_FOLDER_ID = 'opfs:Documents';

export class App {
  private readonly header: HTMLElement;
  private readonly main: HTMLElement;
  private readonly statusBar: HTMLElement;
  private readonly alert: HTMLElement;
  /** "Read-only" banner with Edit / Edit a copy (FILE-017). */
  private readonly roBanner: HTMLElement;
  private readonly busy: HTMLElement;
  private current: OpenDocument | null = null;
  private dirty = false;
  private busyTimer: ReturnType<typeof setTimeout> | undefined;
  private autosaveTimer: ReturnType<typeof setInterval> | undefined;
  private assistant: AssistantPanel | null = null;
  private unregisterAgentTools: (() => void) | null = null;
  /** Real-time collaboration session on the open document (COLLAB-001). */
  private collab: import('../collab/ui').Collaboration | null = null;
  /** The open folder and its side panel (FOLDER-001). */
  private folder: import('../folder/panel').FolderPanel | null = null;
  /** GIT-017: the open folder is a Git working copy the application commits to. */
  private localRepo: import('../git/local').LocalRepo | undefined;

  constructor(
    private readonly root: HTMLElement,
    private readonly options: AppOptions = {},
  ) {
    this.header = h('header', { class: 'app-header', 'aria-label': t('app.header') });
    this.main = h('main', { class: 'app-main', id: 'main' });
    this.statusBar = h('footer', { class: 'app-status', 'aria-live': 'polite' });
    this.alert = h('div', { class: 'app-alert', role: 'alert', hidden: true });
    this.roBanner = h('div', { class: 'readonly-banner', role: 'status', hidden: true });
    this.busy = h('div', { class: 'app-busy', role: 'status', hidden: true }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('app.working'));
    root.replaceChildren(this.header, this.alert, this.roBanner, this.main, this.statusBar, this.busy);
    // Side panels (folder, assistant) start under the header, which wraps on narrow screens.
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => root.style.setProperty('--header-h', `${this.header.offsetHeight}px`)).observe(this.header);
    }
    root.classList.add('app');
    root.dataset.dropLabel = t('start.drop');
    this.installDropZone();
    window.addEventListener('beforeunload', (e) => {
      if (this.dirty || this.archiveChanged()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    this.showStart();
    // NOTIF-001: the reminders of the events, while the application is open.
    void this.startReminders();
    addEventListener('pwo-reminders-changed', () => void this.startReminders());
    addEventListener('pwo-open-event', (e) => void this.openEventNote((e as CustomEvent<string>).detail));
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent) => {
      const m = e.data as { type?: string; path?: string } | null;
      if (m?.type === 'pwo-open-event' && m.path) void this.openEventNote(m.path);
    });
  }

  private async startReminders(): Promise<void> {
    const { startReminders } = await import('../pim/notify');
    startReminders({
      provider: async () => this.folder?.provider ?? (await (await import('../fs')).privateStorage('Documents', t('folder.browserStorage')).catch(() => null)),
      open: (path) => void this.openEventNote(path),
      notice: (message) => this.showNotice(message),
    });
  }

  /** NOTIF-001: the note of an event, from its reminder (of the folder open, else of the browser's storage). */
  async openEventNote(path: string): Promise<void> {
    if (!this.folder) await this.openBrowserStorage();
    if (this.folder) await this.openFromFolder(path);
  }

  /** Show an error coming from outside the shell (e.g. a damaged document link). */
  notifyError(message: string): void {
    this.showError(message);
  }

  /** Open a user-provided file (picker, drop, file handler, recent list). */
  /**
   * SHARE-013: a file handed over by another app is checked first (a file this
   * app opens, whose content is what its name says); one from QRShare is
   * opened once the user has seen where it comes from and what it is.
   */
  async openReceived(file: File, from: { app: 'qrshare'; origin: string } | { app: 'system' }): Promise<void> {
    if (file.size > MAX_ARCHIVE_SIZE) return this.showError(t('error.tooLarge', { name: file.name, limit: MAX_ARCHIVE_SIZE / 1024 / 1024 }));
    const [{ inspectReceived }, bytes] = await Promise.all([import('../share/gate'), readFileBytes(file)]);
    const check = inspectReceived(file.name, bytes);
    const what = (f?: string): string => (!f ? '' : f === 'archive' ? t('received.archive') : formatLabel(f as DocumentFormat));
    if (!check.ok) {
      return this.showError(t(`received.${check.reason}` as MessageKey, { name: file.name, format: what(check.format) }));
    }
    if (from.app === 'qrshare') {
      const mb = file.size >= 1024 * 1024;
      const size = new Intl.NumberFormat(getLocale(), { style: 'unit', unit: mb ? 'megabyte' : 'kilobyte', maximumFractionDigits: mb ? 1 : 0 }).format(mb ? file.size / 1024 / 1024 : Math.max(1, file.size / 1024));
      const ok = await this.confirmDialog(t('received.title'), t('received.confirm', { origin: from.origin, name: file.name, size, format: what(check.format) }), t('common.open'));
      if (!ok) return;
    }
    await this.openFile(file);
  }

  async openFile(file: File, origin?: string): Promise<void> {
    // FILE-021: an archive is opened as a folder, its files read one at a time.
    const limit = /\.zip$/i.test(file.name) ? MAX_ARCHIVE_SIZE : MAX_FILE_SIZE;
    if (file.size > limit) {
      this.showError(t('error.tooLarge', { name: file.name, limit: limit / 1024 / 1024 }));
      return;
    }
    await this.withBusy(async () => {
      const bytes = await readFileBytes(file);
      if (isArchive(bytes)) return void (await this.openArchive(file.name, bytes));
      if (file.size > MAX_FILE_SIZE) return this.showError(t('error.tooLarge', { name: file.name, limit: MAX_FILE_SIZE / 1024 / 1024 }));
      if (!this.confirmDiscard()) return;
      // MD-018: a note's pictures on the web are embedded; those next to it need its folder.
      const note = /\.(md|markdown)$/i.test(file.name) ? new TextDecoder().decode(bytes) : undefined;
      const images = note !== undefined ? await this.noteImages(file.name, note) : undefined;
      const format = await this.openBytes(file.name, bytes, undefined, images && ((src) => images.get(src)));
      if (format && note !== undefined) await this.missingPictures(note, images!);
      if (!format) return;
      // FILE-029: a document that comes from a repository or a server is saved back there.
      const from = await this.restoreOrigin(origin);
      this.onFileOpened?.(file, format, from);
    });
  }

  /** FILE-029: the address of where the open document comes from. */
  private async originOf(doc: OpenDocument): Promise<string | undefined> {
    if (doc.source) {
      const { repoWebUrl } = await import('../git/url');
      return repoWebUrl(doc.source.account.provider, doc.source.account.apiUrl, doc.source.repo.name, doc.source.branch, doc.source.path, true);
    }
    if (doc.dav) {
      const { davFileUrl } = await import('../webdav/ui');
      return davFileUrl(doc.dav.account, doc.dav.path);
    }
    return undefined;
  }

  /**
   * FILE-028, FILE-029: the document is in a repository or on a server: its
   * address goes into its metadata, its place into the places remembered.
   * Returns the address, to keep with its recent entry.
   */
  private async noteOrigin(doc: OpenDocument): Promise<string | undefined> {
    const url = await this.originOf(doc);
    if (!url) return undefined;
    const { originsEnabled, rememberPlace } = await import('../storage/places');
    if (originsEnabled()) doc.view.setOrigin?.(url);
    const dir = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
    if (doc.source) {
      const { repoWebUrl } = await import('../git/url');
      const { account, repo, branch, path } = doc.source;
      rememberPlace({ kind: 'git', url: repoWebUrl(account.provider, account.apiUrl, repo.name, branch, dir(path) || undefined), label: `${repo.name}${dir(path) ? `/${dir(path)}` : ''} · ${branch}`, accountId: account.id });
    } else if (doc.dav) {
      const { davFileUrl, davLabel } = await import('../webdav/ui');
      const folder = dir(doc.dav.path);
      rememberPlace({ kind: 'dav', url: davFileUrl(doc.dav.account, folder), label: `${davLabel(doc.dav.account)}${folder ? `/${folder}` : ''}`, accountId: doc.dav.account.id, folder });
    }
    return originsEnabled() ? url : undefined;
  }

  /**
   * FILE-029: the open document says where it comes from (its metadata, or
   * its recent entry): Save writes it back there. Returns the address kept.
   */
  private async restoreOrigin(hint?: string): Promise<string | undefined> {
    const doc = this.current;
    const { originsEnabled } = await import('../storage/places');
    if (!doc || !originsEnabled() || doc.source || doc.dav || doc.grist || doc.folderPath || doc.fromTemplate) return undefined;
    const url = doc.view.origin?.() ?? hint;
    if (!url) return undefined;
    // Only a copy in the same format goes back there (a .md saved as .odt is another file).
    const extOf = (path: string): string => (path.includes('.') ? path.slice(path.lastIndexOf('.') + 1).toLowerCase() : '');
    const sameFormat = (path: string): boolean => extOf(path) === extOf(doc.name);
    const [{ parseRepoAddress }, { davLocationOf }] = await Promise.all([import('../git/url'), import('../webdav/ui')]);
    const at = parseRepoAddress(url);
    if (at?.isFile && at.branch && at.inside) {
      if (!sameFormat(at.inside)) return undefined;
      const { accountForRepo } = await import('../git/accounts');
      try {
        // GIT-018: of the tokens of the site, the one that opens it.
        const chosen = await accountForRepo(at);
        if (!chosen) throw new Error('No access');
        const account = chosen.account.id.startsWith('public:') ? { ...chosen.account, label: t('git.publicAccess', { site: at.host }) } : chosen.account;
        const repo = chosen.repo;
        if (this.current !== doc) return undefined;
        // The version is read again when saving: the commit dialog comes first, conflicts are still found.
        doc.source = { account, repo, branch: at.branch, path: at.inside, version: '' };
        doc.originRestored = true;
      } catch {
        this.showNotice(t('origin.noAccount', { place: `${at.path} (${at.host})` }));
        return url;
      }
      this.renderHeader();
      this.showNotice(t('origin.restored', { place: `${at.path} · ${at.branch}` }));
      return url;
    }
    const dav = davLocationOf(url);
    if (dav) {
      if (!sameFormat(dav.path)) return undefined;
      doc.dav = { account: dav.account, path: dav.path };
      doc.originRestored = true;
      this.renderHeader();
      this.showNotice(t('origin.restored', { place: `${new URL(dav.account.url).host}/${dav.path}` }));
      return url;
    }
    if (/^https?:\/\//.test(url)) this.showNotice(t('origin.noAccount', { place: url }));
    return url;
  }

  /** FILE-029: the document is no longer tied to where it comes from. */
  private detachOrigin(): void {
    const doc = this.current;
    if (!doc) return;
    const place = doc.source ? doc.source.repo.name : doc.dav ? new URL(doc.dav.account.url).host : '';
    delete doc.source;
    delete doc.dav;
    delete doc.originRestored;
    if (doc.view.origin?.()) {
      doc.view.setOrigin?.(undefined);
      this.markChanged();
    }
    this.renderHeader();
    this.showNotice(t('origin.detached', { place }));
  }

  /** Detect the format and show the matching editor; returns the format on success. */
  private async openBytes(name: string, bytes: Uint8Array, source?: RepoSource, resolveImage?: import('../document/markdown-reader').MarkdownReadOptions['resolveImage'], keepImageLinks = false): Promise<DocumentFormat | null> {
    try {
      if (isArchive(bytes)) {
        await this.openArchive(name, bytes);
        return null;
      }
      const format = detectFormat(name, bytes);
      if (!format) {
        this.showError(t('error.unsupported', { name }));
        return null;
      }
      // FILE-020: a template file opens as a new document of its base format.
      const template = isTemplate(bytes);
      if (template) name = `${name.replace(/\.[^.]+$/, '')}.${fileExtension(format)}`;
      const view = await openView(format, bytes, this.viewContext(), name, resolveImage, keepImageLinks);
      const doc: OpenDocument = { name, format, kind: formatKind(format), view };
      if (template) doc.fromTemplate = true;
      else if (source) doc.source = source;
      this.setDocument(doc);
      if (template) this.showNotice(t('tpl.fromFile', { name }));
      return format;
    } catch (err) {
      if ((err as Error).name !== 'MdzCancelled') this.showError(t('error.open', { name, message: (err as Error).message }));
      return null;
    }
  }

  /** Open a file from Nextcloud / WebDAV (DAV-002). */
  async openFromCloud(startAt?: { accountId?: string; folder?: string }): Promise<void> {
    if (!this.confirmDiscard()) return;
    const { browseCloud } = await import('../webdav/ui');
    const file = await browseCloud(this.root, 'open', '', startAt);
    if (!file) return;
    await this.withBusy(async () => {
      const format = await this.openBytes(basename(file.path), file.bytes);
      if (!format) return;
      if (this.current && !this.current.fromTemplate) {
        this.current.dav = { account: file.account, path: file.path, ...(file.etag ? { etag: file.etag } : {}) };
        this.onFileOpened?.(new File([file.bytes as BlobPart], basename(file.path)), format, await this.noteOrigin(this.current));
      }
      this.renderHeader();
    });
  }

  /**
   * Save to Nextcloud / WebDAV (DAV-003): back to where the document came from,
   * or to a chosen place. Never overwrites a newer version silently (DAV-004).
   */
  async saveToCloud(choose = false): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const { browseCloud, davClient, davErrorMessage } = await import('../webdav/ui');
    let target = choose ? undefined : doc.dav;
    let format = doc.format;
    if (!target) {
      const chosen = await browseCloud(this.root, 'save', doc.name);
      if (!chosen) return;
      const formats = saveFormatsFor(doc.kind, loadFormatFamily());
      const ext = chosen.path.slice(chosen.path.lastIndexOf('.') + 1).toLowerCase();
      const match = formats.find((f) => fileExtension(f) === ext);
      if (!match) {
        this.showError(t('git.badExtension', { list: formats.map((f) => `.${fileExtension(f)}`).join(', ') }));
        return;
      }
      format = match;
      target = { account: chosen.account, path: chosen.path };
    }
    const location = target;
    await this.withBusy(async () => {
      const client = davClient(location.account);
      // FILE-029: the file written there says where it is.
      const [{ originsEnabled }, { davFileUrl }] = await Promise.all([import('../storage/places'), import('../webdav/ui')]);
      if (originsEnabled()) doc.view.setOrigin?.(davFileUrl(location.account, location.path));
      const bytes = await doc.view.save!(format);
      let path = location.path;
      let result: { etag?: string };
      try {
        try {
          result = await client.write(path, bytes, location.etag);
        } catch (err) {
          if (!(err instanceof Error && 'conflict' in err && (err as { conflict: boolean }).conflict)) throw err;
          // DAV-004: the file changed (or exists) on the server.
          const overwrite = t('dav.conflictOverwrite');
          const copy = t('dav.conflictCopy');
          const answer = await this.choose(t('dav.conflictTitle'), t(location.etag ? 'dav.conflictChanged' : 'dav.conflictExists', { path }), [copy, overwrite], copy, t('common.continue'));
          if (!answer) return;
          if (answer === copy) {
            const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
            const dot = path.lastIndexOf('.');
            path = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}-copy-${stamp}${path.slice(dot)}` : `${path}-copy-${stamp}`;
            result = await client.write(path, bytes);
          } else {
            result = await client.write(path, bytes, undefined, true);
          }
        }
      } catch (err) {
        this.showError(davErrorMessage(err));
        return;
      }
      doc.dav = { account: location.account, path, ...(result.etag ? { etag: result.etag } : {}) };
      delete doc.originRestored;
      doc.name = basename(path);
      doc.format = format;
      this.keepVersion(doc, bytes);
      this.onFileSaved?.(new File([bytes as BlobPart], doc.name, { type: MIME_TYPES[format] }), format, await this.noteOrigin(doc));
      this.dirty = false;
      this.discardDraft();
      this.renderHeader();
      this.showNotice(t('dav.saved', { path }));
    });
  }

  /** Open a Grist document as a workbook, one sheet per table (GRIST-002). */
  async openFromGrist(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const { pickGristDocument, gristClient, gristErrorMessage } = await import('../grist/ui');
    const choice = await pickGristDocument(this.root);
    if (!choice) return;
    await this.withBusy(async () => {
      try {
        const snapshot = await gristClient(choice.account).readDocument(choice.doc.id);
        await this.showGristDocument({ ...choice, snapshot });
      } catch (err) {
        this.showError(gristErrorMessage(err));
      }
    });
  }

  private async showGristDocument(source: GristSource): Promise<void> {
    const [{ gristToWorkbook }, { writeWorkbook }] = await Promise.all([import('../grist/workbook'), import('../sheet/io')]);
    const format = defaultFormat('spreadsheet') as 'ods' | 'xlsx';
    const bytes = writeWorkbook(gristToWorkbook(source.snapshot), format);
    if (!(await this.openBytes(`${source.doc.name}.${format}`, bytes))) return;
    if (this.current) this.current.grist = source;
    this.dirty = false;
    this.renderHeader();
  }

  /** Send the changes of the open workbook to its Grist document (GRIST-003). */
  async saveToGrist(): Promise<void> {
    const doc = this.current;
    if (!doc?.grist || !doc.view.save) return;
    const source = doc.grist;
    const [{ gristChanges }, { readWorkbook }, { gristClient, gristErrorMessage }] = await Promise.all([import('../grist/workbook'), import('../sheet/io'), import('../grist/ui')]);
    const changes = gristChanges(source.snapshot, readWorkbook('xlsx', await this.withBusy(async () => doc.view.save!('xlsx'))));
    if (!changes.length) {
      this.showNotice(t('grist.noChanges'));
      return;
    }
    const removed = changes.reduce((n, c) => n + c.remove.length, 0);
    if (removed && !window.confirm(t('grist.removeConfirm', { n: removed }))) return;
    await this.withBusy(async () => {
      try {
        const client = gristClient(source.account);
        await client.apply(source.snapshot.docId, changes);
        // Reload: new rows get their ids, formulas their new values.
        const snapshot = await client.readDocument(source.snapshot.docId);
        await this.showGristDocument({ ...source, snapshot });
        const rows = changes.reduce((n, c) => n + c.update.length + c.add.length + c.remove.length, 0);
        this.showNotice(t('grist.saved', { n: rows, name: source.doc.name }));
      } catch (err) {
        this.showError(gristErrorMessage(err));
      }
    });
  }

  /** Open a file from a GitHub/GitLab repository (GIT-002). */
  async openFromRepository(startAt?: string): Promise<void> {
    if (!this.confirmDiscard()) return;
    const { browseRepository } = await import('../git/ui');
    const file = await browseRepository(this.root, 'open', '', [], startAt);
    if (!file) return;
    // GIT-013: the repository is shown as a folder, with its tree, beside the file opened.
    const [{ clientFor, rememberRepoAccount }, { GitRepoProvider }] = await Promise.all([import('../git/accounts'), import('../git/provider')]);
    // GIT-018: its address opens it with this account again.
    rememberRepoAccount(file.account, file.repo.name);
    const folder = new GitRepoProvider(clientFor(file.account), file.repo, file.branch);
    if (!('bytes' in file)) {
      await this.setFolder(folder);
      return;
    }
    const { bytes, ...location } = file;
    await this.setFolder(folder);
    await this.withBusy(async () => {
      const format = await this.openBytes(basename(file.path), bytes, location);
      // FILE-028, FILE-029: the repository remembered, the document knowing where it comes from.
      if (format && this.current) this.onFileOpened?.(new File([bytes as BlobPart], basename(file.path)), format, await this.noteOrigin(this.current));
    });
    this.folder?.setCurrent(file.path);
  }

  /** Commit the current document to its repository, or to a chosen one (GIT-003..GIT-005). */
  async commitToRepository(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const [{ browseRepository, commitDialog }, { clientFor }, { GitConflictError }] = await Promise.all([import('../git/ui'), import('../git/accounts'), import('../git/types')]);
    let format = doc.format;
    let location: Omit<RepoSource, 'version'>;
    let version: string | undefined;
    if (doc.source) {
      ({ version, ...location } = doc.source);
      // FILE-029: found again from its metadata: the file there now, to replace (conflicts on a later change still found).
      if (doc.originRestored) version = await this.repoVersion(location).catch(() => undefined);
    } else {
      const formats = saveFormatsFor(doc.kind, loadFormatFamily());
      const chosen = await browseRepository(this.root, 'save', doc.name, formats.map(fileExtension));
      if (!chosen) return;
      const ext = chosen.path.slice(chosen.path.lastIndexOf('.') + 1).toLowerCase();
      const match = formats.find((f) => fileExtension(f) === ext);
      if (!match) {
        this.showError(t('git.badExtension', { list: formats.map((f) => `.${fileExtension(f)}`).join(', ') }));
        return;
      }
      format = match;
      location = chosen;
      version = await this.repoVersion(chosen);
    }
    // GIT-008, GIT-012: a repository opened without a token: ask for one, remembered for next time.
    if (!location.account.token) {
      const { askToken } = await import('../git/ui');
      const account = await askToken(this.root, location.account, location.repo.id);
      if (!account) return;
      location = { ...location, account };
      if (doc.source) doc.source = { ...doc.source, account };
    }
    const choice = await commitDialog(this.root, location.path, location.branch, version !== undefined);
    if (!choice) return;
    const client = clientFor(location.account);
    await this.withBusy(async () => {
      try {
        // FILE-029: the file written there says where it is.
        const [{ originsEnabled }, { repoWebUrl }] = await Promise.all([import('../storage/places'), import('../git/url')]);
        if (originsEnabled()) doc.view.setOrigin?.(repoWebUrl(location.account.provider, location.account.apiUrl, location.repo.name, choice.branch, location.path, true));
        const bytes = await doc.view.save!(format);
        let { branch, path } = location;
        if (choice.createBranch) await client.createBranch(location.repo.id, branch, choice.branch);
        if (choice.branch !== branch) {
          branch = choice.branch;
          version = await this.repoVersion({ ...location, branch });
        }
        let result: { version: string };
        try {
          result = await client.writeFile(location.repo.id, branch, path, bytes, choice.message, version);
        } catch (err) {
          if (!(err instanceof GitConflictError)) throw err;
          // GIT-004: never overwrite; offer a new branch or a copy.
          const newBranch = t('git.conflictNewBranch');
          const answer = await this.choose(t('git.conflictTitle'), t('git.conflictMessage', { path }), [newBranch, t('git.conflictCopy')], newBranch, t('common.continue'));
          if (!answer) return;
          const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
          if (answer === newBranch) {
            const created = `pwo/${stamp}`;
            await client.createBranch(location.repo.id, branch, created);
            branch = created;
            result = await client.writeFile(location.repo.id, branch, path, bytes, choice.message, await this.repoVersion({ ...location, branch }));
          } else {
            const dot = path.lastIndexOf('.');
            path = dot > path.lastIndexOf('/') ? `${path.slice(0, dot)}-copy-${stamp}${path.slice(dot)}` : `${path}-copy-${stamp}`;
            result = await client.writeFile(location.repo.id, branch, path, bytes, choice.message);
          }
        }
        if (this.current !== doc) return;
        doc.source = { ...location, branch, path, version: result.version };
        // GIT-018: its address opens it with this account again.
        (await import('../git/accounts')).rememberRepoAccount(location.account, location.repo.name);
        delete doc.originRestored;
        doc.name = basename(path);
        doc.format = format;
        this.keepVersion(doc, bytes);
        // FILE-028, FILE-029: the repository remembered; the recent entry knows where the file is.
        const origin = await this.noteOrigin(doc);
        this.onFileSaved?.(new File([bytes as BlobPart], doc.name, { type: MIME_TYPES[format] }), format, origin);
        this.dirty = false;
        this.discardDraft();
        this.renderHeader();
        this.renderStatus();
        this.showNotice(t('git.committed', { path, branch }));
      } catch (err) {
        this.showError(t('error.git', { message: (err as Error).message }));
      }
    });
  }

  /** Current version of a file in a repository, or undefined when it does not exist. */
  /**
   * GIT-007: for a document of a repository, work on a new branch (the next
   * saves are commits there), open it on another branch, or propose its
   * branch's changes to the default one (pull request / merge request).
   */
  private async repoDocumentMenu(): Promise<void> {
    const doc = this.current;
    const source = doc?.source;
    if (!doc || !source) return;
    const { clientFor } = await import('../git/accounts');
    const client = clientFor(source.account);
    const { repo, branch } = source;
    const newBranch = t('git.workOnNewBranch');
    const propose = t(source.account.provider === 'gitlab' ? 'git.proposeMerge' : 'git.proposePull', { base: repo.defaultBranch });
    const history = t('history.menu');
    const options = [history, newBranch, ...(branch !== repo.defaultBranch ? [propose] : [])];
    const choice = await this.choose(t('git.branchMenu'), t('git.branchMenuMessage', { repo: repo.name, branch }), options, branch !== repo.defaultBranch ? propose : newBranch, t('common.continue'));
    if (!choice) return;
    // VER-002: the commits of this document, compared, opened or restored.
    if (choice === history) return this.showRepoHistory(client, repo.id, branch, source.path);
    try {
      if (choice === newBranch) {
        const name = window.prompt(t('git.newBranchPrompt', { from: branch }), `pwo/${new Date().toISOString().slice(0, 10)}`)?.trim();
        if (!name) return;
        await this.withBusy(() => client.createBranch(repo.id, branch, name));
        const version = await this.repoVersion({ ...source, branch: name });
        if (this.current !== doc) return;
        doc.source = { ...source, branch: name, version: version ?? source.version };
        this.renderHeader();
        this.showNotice(t('git.onBranch', { branch: name }));
      } else {
        const title = window.prompt(t('git.pullTitle'), t('git.pullDefaultTitle', { branch }))?.trim();
        if (!title) return;
        if (this.dirty) this.showNotice(t('git.pullUnsaved'));
        const pr = await this.withBusy(() => client.createPullRequest(repo.id, branch, repo.defaultBranch, title, ''));
        this.showNotice(t('git.pullOpened', { n: pr.number, url: pr.url }));
        window.open(pr.url, '_blank', 'noopener');
      }
    } catch (err) {
      this.showError(t('error.git', { message: (err as Error).message }));
    }
  }

  private async repoVersion(location: Omit<RepoSource, 'version'>): Promise<string | undefined> {
    const { clientFor } = await import('../git/accounts');
    try {
      return (await clientFor(location.account).readFile(location.repo.id, location.branch, location.path)).version;
    } catch (err) {
      if ((err as { status?: number }).status === 404) return undefined;
      throw err;
    }
  }

  /** Hook used by the recent-files feature. */
  onFileOpened?: (file: File, format: DocumentFormat, origin?: string) => void;
  /** A file saved on its own: the recent files keep what was saved (FILE-008), and where it comes from (FILE-029). */
  onFileSaved?: (file: File, format: DocumentFormat, origin?: string) => void;
  /** A file renamed in the app (FILE-026). */
  onFileRenamed?: (oldName: string, newName: string) => Promise<void> | void;

  async newDocument(kind: Exclude<DocumentKind, 'pdf' | 'file'>): Promise<void> {
    if (!this.confirmDiscard()) return;
    await this.withBusy(async () => {
      try {
        const format = defaultFormat(kind);
        const view = await newView(kind, this.viewContext(), format);
        this.setDocument({ name: replaceExtension(t('file.untitled', { kind: t(KIND_KEY[kind]) }), fileExtension(format)), format, kind, view });
      } catch (err) {
        this.showError((err as Error).message);
      }
    });
  }

  /** DRAW-001, DRAW-008: a new drawing (.svg) or painting (.png), drawn first, then open as a picture to save. */
  async newPicture(kind: 'drawing' | 'painting'): Promise<void> {
    if (!this.confirmDiscard()) return;
    let bytes: Uint8Array | undefined;
    let layeredName = false;
    if (kind === 'drawing') {
      const [{ editDrawing }, { toSvg }] = await Promise.all([import('../draw/editor'), import('../draw/svg')]);
      const drawing = await editDrawing(this.root);
      if (drawing) bytes = new TextEncoder().encode(toSvg(drawing));
    } else {
      const { paintPicture } = await import('../paint/editor');
      const painted = await paintPicture(this.root, undefined, undefined, { layered: true });
      bytes = painted?.bytes;
      // DRAW-013: a picture with layers is an OpenRaster file.
      if (painted?.mediaType === 'image/openraster') layeredName = true;
    }
    if (!bytes) return;
    let name = t(kind === 'drawing' ? 'start.untitledDrawing' : 'start.untitledPainting');
    if (layeredName) name = name.replace(/\.[^.]+$/, '.ora');
    const view = await openView('image', bytes, this.viewContext(), name);
    this.setDocument({ name, format: 'image', kind: formatKind('image'), view });
    this.dirty = true;
    this.renderHeader();
  }

  /** Save the open document as a template file: .ott, .dotx… (FILE-020). */
  async saveTemplateFile(base: DocumentFormat): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    try {
      if (!isTemplateBase(base)) return;
      const extension = templateExtension(base);
      const name = `${doc.name.replace(/\.[^.]+$/, '')}.${extension}`;
      if (await saveFile(toTemplate(await this.withBusy(async () => doc.view.save!(base)), base), name, base, { mimeType: templateMimeType(base), extension })) this.showNotice(t('tpl.fileSaved', { name }));
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** Keep the open document as a template of this browser (FILE-019). */
  async saveAsTemplate(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const name = window.prompt(t('tpl.namePrompt'), doc.name.replace(/\.[^.]+$/, ''))?.trim();
    if (!name) return;
    try {
      // FOLDER-020: a writable open folder can keep it in its templates folder, shared with the folder.
      const folder = this.folder?.provider;
      if (folder?.capabilities.write) {
        const { templatesDir } = await import('../folder/templates');
        const dir = (await templatesDir(folder)) ?? 'Templates';
        const there = t('tpl.inFolder', { path: dir });
        const where = await this.choose(t('tpl.saveAs'), t('tpl.whereSave'), [there, t('tpl.inBrowser')], there, t('file.save'));
        if (!where) return;
        if (where === there) {
          const path = `${dir}/${name.replace(/[\\/:*?"<>|]/g, '_')}.${fileExtension(doc.format)}`;
          await folder.mkdir(dir);
          await folder.write(path, new Blob([(await this.withBusy(async () => doc.view.save!(doc.format))) as BlobPart]));
          await this.folder?.refresh();
          this.showNotice(t('tpl.savedInFolder', { path }));
          return;
        }
      }
      const { saveTemplate } = await import('../storage/recent');
      await saveTemplate(name, doc.format, await this.withBusy(async () => doc.view.save!(doc.format)));
      this.showNotice(t('tpl.saved', { name }));
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** A new document from a built-in template or example (FILE-018), or from a template of the user (FILE-019). */
  async newFromTemplate(): Promise<void> {
    const [{ chooseTemplate }, storage] = await Promise.all([import('../templates/ui'), import('../storage/recent')]);
    const provider = this.folder?.provider;
    // The folder is looked through first, which can take a while (a repository, a cloud folder).
    const [mine, inFolder] = await this.withBusy(() =>
      Promise.all([storage.listTemplates().catch(() => []), provider ? import('../folder/templates').then((m) => m.folderTemplates(provider)).catch(() => []) : Promise.resolve([])]),
    );
    // FILE-030: the repositories and cloud folders of templates.
    const sourcesModule = await import('../templates/sources');
    const opened = new Map<string, Promise<{ provider: import('../fs').StorageProvider; dir: string }>>();
    const open = (s: import('../templates/sources').TemplateSource) => {
      if (!opened.has(s.id)) opened.set(s.id, sourcesModule.openSource(s, (base, repo) => this.askReadToken(base, repo)));
      return opened.get(s.id)!;
    };
    // TEACH-005: no repository or cloud folder of templates in exam mode.
    const sources = inExam() ? undefined : {
      list: sourcesModule.loadSources(),
      load: async (s: import('../templates/sources').TemplateSource) => {
        const { provider: p, dir } = await open(s);
        return sourcesModule.templatesIn(p, dir);
      },
      add: () => this.addTemplateSource(),
      remove: (s: import('../templates/sources').TemplateSource) => sourcesModule.removeSource(s.id),
    };
    const template = await chooseTemplate(this.root, mine, (id) => storage.deleteTemplate(id), provider ? { label: provider.label, items: inFolder } : undefined, sources);
    if (!template || !this.confirmDiscard()) return;
    if ('source' in template) {
      // A copy of the template of the repository or the cloud folder: a new document, saved where the user wants.
      await this.withBusy(async () => {
        try {
          const { provider: p } = await open(template.source);
          const bytes = new Uint8Array(await (await p.read(template.template.path)).arrayBuffer());
          await this.openBytes(template.template.path.replace(/^.*\//, ''), bytes);
          if (this.current) {
            delete this.current.source;
            delete this.current.dav;
          }
        } catch (err) {
          this.showError(t('tpl.sourceError', { message: (err as Error).message }));
        }
      });
      return;
    }
    if ('path' in template) {
      // A copy of the folder's template, a new document: saving asks where.
      await this.withBusy(async () => {
        try {
          const bytes = new Uint8Array(await (await provider!.read(template.path)).arrayBuffer());
          await this.openBytes(template.path.replace(/^.*\//, ''), bytes);
        } catch (err) {
          this.showError((err as Error).message);
        }
      });
      return;
    }
    if ('format' in template) {
      const bytes = await storage.loadTemplate(template.id);
      if (bytes) await this.withBusy(async () => void (await this.openBytes(`${template.name}.${fileExtension(template.format)}`, bytes)));
      return;
    }
    await this.withBusy(async () => {
      try {
        const { contentLang } = await import('../templates/catalog');
        const built = template.build(contentLang(getLocale()));
        // A drawing or a picture opens as a picture, to edit and save as a file.
        if (built.kind === 'picture') {
          const name = `${t(template.name)}.${built.ext}`;
          const view = await openView('image', await built.bytes(), this.viewContext(), name);
          this.setDocument({ name, format: 'image', kind: formatKind('image'), view });
          return;
        }
        const format = defaultFormat(built.kind);
        // The model goes straight to the editor: saving converts it like any new document.
        const view = await newView(built.kind, this.viewContext(), format, built);
        this.setDocument({ name: `${t(template.name)}.${fileExtension(format)}`, format, kind: built.kind, view });
      } catch (err) {
        this.showError((err as Error).message);
      }
    });
  }

  /** FILE-030: a repository or a cloud folder of templates, among the places used or given by its address. */
  private async addTemplateSource(): Promise<import('../templates/sources').TemplateSource | null> {
    const [{ addSource, openSource }, { loadDavAccounts, davLabel }] = await Promise.all([import('../templates/sources'), import('../webdav/ui')]);
    const places = loadPlaces();
    // TEACH-005: only local folders in exam mode.
    const accounts = inExam() ? [] : loadDavAccounts();
    const address = t('tpl.sourceAddress');
    const options = [...places.map((p) => `${p.kind === 'git' ? '⎇' : '☁'} ${p.label}`), ...accounts.map((a) => `☁ ${davLabel(a)}`), address];
    const choice = await this.choose(t('tpl.sourceAdd'), t('tpl.sourceAddMessage'), options, options[0]!, t('common.ok'));
    if (!choice) return null;
    const i = options.indexOf(choice);
    if (i < places.length) {
      const p = places[i]!;
      return p.kind === 'git' ? addSource({ kind: 'git', label: p.label, url: p.url }) : addSource({ kind: 'dav', label: p.label, ...(p.accountId ? { accountId: p.accountId } : {}), ...(p.folder ? { folder: p.folder } : {}) });
    }
    if (i < places.length + accounts.length) {
      const a = accounts[i - places.length]!;
      const folder = window.prompt(t('tpl.sourceFolderPrompt'), '')?.trim().replace(/^\/+|\/+$/g, '') ?? null;
      if (folder === null) return null;
      return addSource({ kind: 'dav', label: `${davLabel(a)}${folder ? `/${folder}` : ''}`, accountId: a.id, ...(folder ? { folder } : {}) });
    }
    const url = window.prompt(t('tpl.sourceAddressPrompt'), 'https://github.com/owner/templates')?.trim();
    if (!url) return null;
    const { parseRepoAddress } = await import('../git/url');
    const at = parseRepoAddress(url);
    if (!at) {
      this.showError(t('git.badAddress'));
      return null;
    }
    // A private repository is read with a token of the site, asked now if none reaches it.
    const source = { kind: 'git' as const, label: `${at.path}${at.inside ? `/${at.inside}` : ''}`, url };
    try {
      await openSource({ ...source, id: '' }, (base, repo) => this.askReadToken(base, repo));
    } catch (err) {
      this.showError(t('tpl.sourceError', { message: (err as Error).message }));
      return null;
    }
    return addSource(source);
  }

  /** FILE-030: a token for a private repository of templates, checked on it. */
  private async askReadToken(base: Pick<import('../git/accounts').GitAccount, 'provider' | 'apiUrl'>, repo: string): Promise<import('../git/accounts').GitAccount | null> {
    const { askToken } = await import('../git/ui');
    return askToken(this.root, base, repo, 'read');
  }

  async save(format?: DocumentFormat): Promise<void> {
    try {
      return await this.saveAs(format);
    } catch (err) {
      if (err instanceof SaveCancelled) return;
      throw err;
    }
  }

  private async saveAs(format?: DocumentFormat): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    // FILE-017: a read-only document is not saved in place; "Save as" makes a copy.
    if (!format && doc.readOnly) return this.showNotice(t('ro.cannotSave'));
    if (!format && doc.source) return this.commitToRepository();
    if (!format && doc.grist) return this.saveToGrist();
    if (!format && doc.dav) return this.saveToCloud();
    // Save writes back into the folder; "Save as" writes a new file elsewhere, not into the folder.
    if (!format && doc.folderPath && this.folder?.provider.capabilities.write) return this.saveToFolder();
    // DEVSYNC-007: a paired device offers to keep the document in the browser, synchronised.
    if (!format && (await this.wantsSyncedSave())) return this.saveToSynced();
    const target = format ?? doc.format;
    try {
      const bytes = await this.withBusy(async () => doc.view.save!(target));
      // FILE-022: a text or source file keeps its name and extension.
      const own = doc.kind === 'file';
      const name = own ? doc.name : replaceExtension(doc.name, fileExtension(target));
      const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : 'txt';
      // A picture keeps its own type (DRAW-001, DRAW-008).
      const mimeType = doc.format === 'image' ? ((doc.view as { mediaType?: () => string }).mediaType?.() ?? 'image/png') : doc.format === 'sqlite' || doc.format === 'kdbx' ? MIME_TYPES[doc.format] : 'text/plain';
      if (await saveFile(bytes, name, target, own ? { mimeType, extension: ext } : undefined)) {
        // The document is now the file saved elsewhere, no longer the one of the folder.
        if (doc.folderPath && format) {
          delete doc.folderPath;
          this.folder?.setCurrent(undefined);
        }
        doc.name = name;
        doc.format = target;
        this.keepVersion(doc, bytes);
        this.onFileSaved?.(new File([bytes as BlobPart], name, { type: MIME_TYPES[target] }), target);
        this.dirty = false;
        this.discardDraft();
        this.renderHeader();
      }
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** Save a copy through one of the view's save variants; the open document is unchanged (PDF-010). */
  async saveCopy(id: string): Promise<void> {
    const doc = this.current;
    const variant = doc?.view.saveVariants?.().find((v) => v.id === id);
    if (!doc || !variant) return;
    try {
      const bytes = await this.withBusy(() => variant.save());
      const dot = doc.name.lastIndexOf('.');
      const stem = dot > 0 ? doc.name.slice(0, dot) : doc.name;
      const name = `${stem}${variant.suffix}.${fileExtension(variant.format)}`;
      if (await saveFile(bytes, name, variant.format)) this.showNotice(t('file.copySaved', { name }));
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** Hand the current document to QRShare (SHARE-001, SHARE-002). */
  async sendToDevice(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    try {
      const bytes = await this.withBusy(async () => doc.view.save!(doc.format));
      const file = new File([bytes as BlobPart], replaceExtension(doc.name, fileExtension(doc.format)), { type: MIME_TYPES[doc.format] });
      // Links carry text documents as Markdown, much shorter than DOCX (SHARE-009).
      const linkFile = doc.kind === 'document' && doc.format !== 'md' ? new File([(await this.withBusy(async () => doc.view.save!('md'))) as BlobPart], replaceExtension(doc.name, 'md'), { type: MIME_TYPES.md }) : file;
      const { openSendDialog } = await import('../share/ui');
      await openSendDialog(this.root, file, doc.format, (message) => this.showNotice(message), linkFile);
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** Merge changes with another device through QR codes (COLLAB-008). */
  async syncOffline(): Promise<void> {
    const doc = this.current;
    const syncable = doc?.view.syncable?.();
    if (!doc || !syncable) return;
    try {
      const { openOfflineSync } = await import('../collab/offline/ui');
      await openOfflineSync({ root: this.root, document: syncable, name: doc.name });
    } catch (err) {
      this.showError(t('sync.invalid', { message: (err as Error).message }));
    }
  }

  /** Open QRShare's receive screen (SHARE-005). */
  async receiveFromDevice(): Promise<void> {
    const { loadShareSettings, receiveUrl } = await import('../share/qrshare');
    const settings = loadShareSettings();
    // QRShare hands the received file back to this address (SHARE-008, see pwa.ts).
    const back = new URL(location.pathname, location.origin);
    back.searchParams.set('handoff', 'qrshare');
    window.open(receiveUrl(settings.url, settings.policy, back.href), '_blank', 'noopener');
  }

  /** Show or hide the AI assistant panel (AI-001). */
  async toggleAssistant(show = !this.root.classList.contains('with-ai')): Promise<void> {
    if (!show) {
      this.root.classList.remove('with-ai');
      this.assistant?.element.remove();
      if (this.current) this.renderHeader();
      return;
    }
    if (!this.current?.view.agentTools) return;
    if (!this.assistant) {
      const { AssistantPanel } = await import('../ai/panel');
      this.assistant = new AssistantPanel({
        context: () => {
          const doc = this.current;
          return doc?.view.agentTools ? { kind: t(KIND_KEY[doc.kind]), name: doc.name, tools: doc.view.agentTools() } : null;
        },
        snapshot: () => this.snapshot(),
        confirm: (title, message) => this.confirmDialog(title, message),
        close: () => void this.toggleAssistant(false),
      });
    }
    this.root.classList.add('with-ai');
    this.root.append(this.assistant.element);
    this.renderHeader();
    this.assistant.focus();
  }

  /** Capture the open document so assistant changes can be undone (AI-003). */
  private async snapshot(): Promise<() => Promise<void>> {
    const doc = this.current;
    if (!doc?.view.save) return async () => undefined;
    const bytes = await this.withBusy(async () => doc.view.save!(doc.format));
    const wasDirty = this.dirty;
    let restored: OpenDocument | null = doc;
    return async () => {
      // Only restore the document the changes were made to.
      if (!restored || this.current !== restored) return;
      const view = await openView(restored.format, bytes, this.viewContext(), restored.name);
      const again: OpenDocument = { ...restored, view };
      this.setDocument(again, true);
      restored = null;
      this.dirty = wasDirty;
      this.renderHeader();
    };
  }

  /** WebMCP: let in-browser AI agents use the document tools (AI-006). */
  private async exposeAgentTools(doc: OpenDocument): Promise<void> {
    this.unregisterAgentTools?.();
    this.unregisterAgentTools = null;
    const hasApi = !!((document as unknown as { modelContext?: unknown }).modelContext ?? (navigator as unknown as { modelContext?: unknown }).modelContext);
    if (!hasApi || !doc.view.agentTools) return;
    const { registerWebMcpTools } = await import('../ai/webmcp');
    if (this.current !== doc) return;
    this.unregisterAgentTools = registerWebMcpTools(doc.view.agentTools(), (tool, input) =>
      this.confirmDialog(t('ai.webmcpTitle'), t('ai.webmcpMessage', { tool: tool.name, input: JSON.stringify(input).slice(0, 300) }), t('common.allow')),
    );
  }

  /** Modal yes/no question. */
  confirmDialog(title: string, message: string, okLabel = t('common.continue')): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'confirm-title' });
      const finish = (value: boolean): void => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      const ok = button(okLabel, () => finish(true), { className: 'primary' });
      dialog.append(h('h2', { id: 'confirm-title' }, title), h('p', {}, message), h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(false)), ok));
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(false);
      });
      this.root.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      ok.focus();
    });
  }

  /** Print preview for editable documents, native printing otherwise (PRINT-001). */
  async print(): Promise<void> {
    const doc = this.current;
    if (!doc) return;
    const view = doc.view;
    if (view.printContent && doc.kind !== 'pdf') {
      const { openPrintPreview } = await import('../print/preview');
      const orientation = view.printOrientation?.();
      const page = view.printPage?.();
      await openPrintPreview(this.root, doc.kind === 'file' ? 'document' : doc.kind, (s) => view.printContent!(s), { ...(orientation ? { orientation } : {}), ...(page ? { page } : {}) });
    } else if (view.print) {
      view.print();
    } else {
      window.print();
    }
  }

  close(): void {
    if (!this.confirmDiscard()) return;
    this.folder?.setCurrent(undefined);
    this.leaveCollaboration();
    this.current?.view.destroy();
    this.current = null;
    this.assistant?.reset();
    void this.toggleAssistant(false);
    this.unregisterAgentTools?.();
    this.unregisterAgentTools = null;
    this.dirty = false;
    this.discardDraft();
    this.renderReadOnly();
    this.showStart();
  }

  isDirty(): boolean {
    return this.dirty;
  }

  // ---------------------------------------------------------------------------

  private viewContext(): ViewContext {
    return {
      busy: (task) => this.withBusy(task),
      rename: (name) => {
        if (!this.current) return;
        this.current.name = name;
        this.renderHeader();
      },
      changed: () => {
        this.markChanged();
        this.collab?.changed();
      },
      statusChanged: () => {
        this.renderStatus();
        this.collab?.cursorMoved();
      },
      choose: (title, message, options, preselected) => this.choose(title, message, options, preselected),
      openLink: (href) => this.openLink(href),
      folderDocuments: () => this.folderDocuments(),
      // DOC-036: tables of the open folder for a mail merge, and its results written there.
      folderDataFiles: () => this.folderRelative((p) => /\.(csv|tsv|xlsx|ods)$/i.test(p)),
      readFolderFile: async (path) => {
        const { readBytes, resolve } = await import('../fs');
        return readBytes(this.folder!.provider, resolve(this.current?.folderPath ?? '', path));
      },
      folderSnippets: async () => {
        const provider = this.folder?.provider;
        if (!provider) return [];
        const { folderSnippets } = await import('../folder/templates');
        return folderSnippets(provider);
      },
      folderWritable: () => !!this.folder?.provider.capabilities.write,
      writeFolderFile: async (path, bytes) => {
        const folder = this.folder;
        if (!folder?.provider.capabilities.write) throw new Error(t('folder.readOnly'));
        const { dirname, resolve } = await import('../fs');
        const target = resolve(this.current?.folderPath ?? '', path);
        for (let d = dirname(target), dirs: string[] = []; ; d = dirname(d)) {
          if (!d) {
            for (const x of dirs.reverse()) await folder.provider.mkdir(x).catch(() => undefined);
            break;
          }
          dirs.push(d);
        }
        await folder.provider.write(target, new Blob([bytes as BlobPart]));
        await folder.refresh();
      },
      tagColour: (tag) => (this.folder && /\.(md|markdown)$/i.test(this.current?.folderPath ?? '') ? this.folder.tagColour(tag) : null),
      completions: (kind) => (this.folder && /\.(md|markdown)$/i.test(this.current?.folderPath ?? '') ? this.folder.completions(kind, this.current?.folderPath) : undefined),
      noteStore: () => {
        const folder = this.folder;
        const path = this.current?.folderPath;
        if (!folder || path === undefined) return undefined;
        return {
          path,
          tables: () => folder.vault.indexed().then((index) => index.tables()),
          read: async (p) => (await import('../fs')).readText(folder.provider, p),
          write: async (p, text) => {
            const { dirname } = await import('../fs');
            for (let d = dirname(p), dirs: string[] = []; ; d = dirname(d)) {
              if (!d) {
                for (const x of dirs.reverse()) await folder.provider.mkdir(x).catch(() => undefined);
                break;
              }
              dirs.push(d);
            }
            await folder.provider.write(p, new Blob([text]));
            await folder.vault.changed(p).catch(() => undefined);
            void folder.refresh();
          },
          open: (p) => void this.openFromFolder(p),
        };
      },
      noteTables: () => (this.folder && this.current?.folderPath !== undefined ? this.folder.vault.indexed().then((index) => index.tables()) : undefined),
      folderProject: () => {
        const folder = this.folder;
        const path = this.current?.folderPath;
        if (!folder || !path) return undefined;
        const provider = folder.provider;
        return {
          path,
          children: async (dir) => (await provider.list(dir)).map((e) => e.name),
          walk: async (dir) => {
            const { walk } = await import('../fs');
            const out: { path: string; size?: number }[] = [];
            for await (const e of walk(provider, dir, { maxEntries: 5000 })) out.push({ path: e.path, ...(e.size !== undefined ? { size: e.size } : {}) });
            return out;
          },
          read: async (p) => (await import('../fs')).readBytes(provider, p),
        };
      },
      headerChanged: () => this.renderHeader(),
      notify: (message) => this.showNotice(message),
      fileName: () => this.current?.name,
    };
  }

  private markChanged(): void {
    if (!this.dirty) {
      this.dirty = true;
      this.renderHeader();
    }
    this.renderStatus();
    this.scheduleAutosave();
  }

  // --- real-time collaboration (COLLAB-001..COLLAB-006) ------------------------

  /** Start a session on the open document and show the invitation. */
  async startCollaboration(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.collab || (doc.kind !== 'document' && doc.kind !== 'spreadsheet') || this.collab) return;
    const { newCollabLink } = await import('../collab/link');
    const collab = await this.runCollaboration(newCollabLink(doc.kind), true);
    if (collab) void collab.invite();
  }

  /** Join the session of an invitation link (opens an empty document that fills from the others). */
  async joinCollaboration(link: import('../collab/link').CollabLink): Promise<void> {
    if (this.collab?.link.room === link.room) return;
    if (this.current && !(await this.confirmDialog(t('collab.title'), t('collab.joinConfirm', { kind: t(KIND_KEY[link.kind]) }), t('common.continue')))) {
      history.replaceState(null, '', this.collab ? this.collab.hash : `${location.pathname}${location.search}`);
      return;
    }
    this.leaveCollaboration();
    this.dirty = false;
    const format = defaultFormat(link.kind);
    const view = await newView(link.kind, this.viewContext(), format);
    this.setDocument({ name: replaceExtension(t('file.untitled', { kind: t(KIND_KEY[link.kind]) }), fileExtension(format)), format, kind: link.kind, view });
    await this.runCollaboration(link, false);
  }

  private async runCollaboration(link: import('../collab/link').CollabLink, initiator: boolean): Promise<import('../collab/ui').Collaboration | null> {
    const doc = this.current;
    const adapter = doc?.view.collab?.();
    if (!doc || !adapter) return null;
    try {
      const { Collaboration } = await import('../collab/ui');
      const collab = await Collaboration.start(link, adapter, initiator, {
        dialogHost: this.root,
        onRemote: () => this.markChanged(),
        onLeave: () => this.leaveCollaboration(),
        confirm: (title, message, ok) => this.confirmDialog(title, message, ok),
      });
      if (this.current !== doc) {
        collab.destroy();
        return null;
      }
      this.collab = collab;
      // Keep the invitation in the address: a reload rejoins the session.
      history.replaceState(null, '', `${location.pathname}${location.search}${collab.hash}`);
      this.root.insertBefore(collab.bar, this.main);
      this.renderHeader();
      return collab;
    } catch (err) {
      this.showError(t('collab.failed', { message: (err as Error).message }));
      return null;
    }
  }

  leaveCollaboration(): void {
    if (!this.collab) return;
    this.collab.destroy();
    this.collab = null;
    if (location.hash.startsWith('#collab=')) history.replaceState(null, '', `${location.pathname}${location.search}`);
    this.renderHeader();
  }

  private setDocument(doc: OpenDocument, keepConversation = false): void {
    this.leaveCollaboration();
    this.current?.view.destroy();
    this.current = doc;
    if (!keepConversation) this.assistant?.reset();
    if (!doc.view.agentTools) void this.toggleAssistant(false);
    void this.exposeAgentTools(doc);
    this.dirty = false;
    this.discardDraft();
    this.hideError();
    this.main.replaceChildren(doc.view.element);
    this.main.dataset.kind = doc.kind;
    this.renderReadOnly();
    doc.view.mounted?.();
    this.renderHeader();
    this.renderStatus();
    document.title = `${doc.name} — ${t('app.name')}`;
    doc.view.focus?.();
  }

  private showStart(): void {
    const exam = inExam();
    document.title = t('app.name');
    delete this.main.dataset.kind;
    const recent = h('section', { class: 'recent', 'aria-label': t('start.recent') });
    this.main.replaceChildren(
      h(
        'section',
        { class: 'start' },
        h('h1', {}, h('img', { class: 'start-logo', src: 'icon.svg', alt: '', 'aria-hidden': 'true', width: '64', height: '64' }), t('app.name'), ' ', h('span', { class: 'app-version-title' }, versionLabel())),
        h('p', { class: 'tagline' }, t('app.tagline')),
        // The documentation (published next to the app, under docs/, see pages.yml), the source and About, in plain sight.
        h(
          'nav',
          { class: 'start-links', 'aria-label': t('app.links') },
          h('a', { class: 'start-link', href: new URL('docs/', document.baseURI).href, target: '_blank', rel: 'noopener', 'data-icon': '📖' }, t('app.docs')),
          // The ways of keeping and moving documents, compared.
          h('a', { class: 'start-link', href: new URL('docs/guide/where.html', document.baseURI).href, target: '_blank', rel: 'noopener', 'data-icon': '🧭' }, t('app.where')),
          h('a', { class: 'start-link', href: SOURCE_URL, target: '_blank', rel: 'noopener', 'data-icon': '⌨️' }, t('app.source')),
          button(t('about.open'), () => void this.showAbout(), { className: 'start-link', title: t('about.openTitle'), icon: 'ℹ️' }),
        ),
        h(
          'div',
          { class: 'start-actions' },
          // FILE-018: starting from a template comes first.
          button(t('tpl.open'), () => void this.newFromTemplate(), { className: 'card template', icon: '🧩', title: t('tpl.openTitle') }),
          button(t('start.newDocument'), () => void this.newDocument('document'), { className: 'card doc', icon: '📝' }),
          button(t('start.newSpreadsheet'), () => void this.newDocument('spreadsheet'), { className: 'card sheet', icon: '📊' }),
          button(t('start.newPresentation'), () => void this.newDocument('presentation'), { className: 'card pres', icon: '📽️' }),
          button(t('start.newDrawing'), () => void this.newPicture('drawing'), { className: 'card drawing', icon: '✏️', title: t('draw.insertTitle') }),
          button(t('start.newPainting'), () => void this.newPicture('painting'), { className: 'card painting', icon: '🎨', title: t('paint.newTitle') }),
          button(t('start.open'), () => void this.pickAndOpen(), { className: 'card open', icon: '📂' }),
          button(t('folder.open'), () => void this.openFolder(), { className: 'card folder', icon: '📁', title: t('folder.openTitle') }),
          // FILE-031: the documents saved in this browser, as a folder to look through.
          button(t('start.browserDocs'), () => void this.openBrowserDocuments(), { className: 'card browser-docs', icon: '🗄️', title: t('start.browserDocsTitle') }),
          // CAL-002: the calendar of the events kept as notes.
          button(t('cal.title'), () => void this.openCalendarApp(), { className: 'card calendar', icon: '📅', title: t('cal.cardTitle') }),
          // CONTACT-002: the people kept as notes.
          button(t('people.title'), () => void this.openContactsApp(), { className: 'card contacts', icon: '👥', title: t('people.cardTitle') }),
          exam ? null : button(t('git.open'), () => void this.openFromRepository(), { className: 'card repo', icon: '🗂️', title: t('git.openTitle') }),
          exam ? null : button(t('share.receive'), () => void this.receiveFromDevice(), { className: 'card share', icon: '📲', title: t('share.receiveTitle') }),
          exam ? null : button(t('dav.open'), () => void this.openFromCloud(), { className: 'card cloud', icon: '☁️', title: t('dav.openCardTitle') }),
          exam ? null : button(t('grist.open'), () => void this.openFromGrist(), { className: 'card grist', icon: '🗃️', title: t('grist.openTitle') }),
          button(t('backup.button'), () => void this.openBackup(), { className: 'card backup', icon: '💾', title: t('backup.title') }),
        ),
        h('p', { class: 'hint' }, t('start.tip')),
        h('div', { class: 'start-prefs' }, this.languagePicker(), this.formatPicker()),
        this.placesList(),
        recent,
      ),
    );
    this.renderStart?.(recent);
    void this.offerDraft(recent);
    void this.offerLastFolder(recent);
    void this.offerBackup(recent);
    this.offerMove(recent);
    void this.resumeDeviceSync();
    this.startAutoBackup();
    this.renderHeader();
    this.renderStatus();
  }

  /** FILE-028: the repositories and servers used, to open them again or forget them. */
  private placesList(): HTMLElement {
    const box = h('section', { class: 'places-list', 'aria-labelledby': 'places-title' });
    const render = (): void => {
      const places = loadPlaces();
      box.hidden = !places.length;
      if (!places.length) return void box.replaceChildren();
      box.replaceChildren(
        h('h2', { id: 'places-title' }, t('places.title')),
        h(
          'ul',
          {},
          ...places.map((p) =>
            h(
              'li',
              {},
              button(`${p.kind === 'git' ? '⎇' : '☁'} ${p.label}`, () => void (p.kind === 'git' ? this.openFromRepository(p.url) : this.openFromCloud({ ...(p.accountId ? { accountId: p.accountId } : {}), ...(p.folder ? { folder: p.folder } : {}) })), { className: 'place-open', title: t('places.openTitle', { label: p.url }) }),
              button(t('places.forget', { label: p.label }), () => {
                forgetPlace(p.id);
                render();
              }, { text: '×', className: 'icon', title: t('places.forget', { label: p.label }) }),
            ),
          ),
        ),
        button(t('places.forgetAll'), () => {
          if (!window.confirm(t('places.forgetAllConfirm'))) return;
          forgetPlaces();
          render();
        }, { className: 'link' }),
      );
    };
    render();
    return box;
  }

  // --- autosave (FILE-011) -------------------------------------------------------

  private scheduleAutosave(): void {
    if (!this.options.drafts || this.autosaveTimer) return;
    this.autosaveTimer = setInterval(() => void this.autosave(), this.options.autosaveMs ?? 30_000);
  }

  private async autosave(): Promise<void> {
    const doc = this.current;
    if (!this.dirty || !doc?.view.save || !this.options.drafts) return;
    try {
      // In the background: no spinner.
      const bytes = await doc.view.save(doc.format);
      if (this.current === doc && this.dirty) await this.options.drafts.save({ name: doc.name, format: doc.format, bytes });
    } catch {
      /* autosave is best effort */
    }
  }

  // --- backups (BACKUP-001..BACKUP-005) ----------------------------------------------

  /** The backup button of the header: how old the last backup is, marked when one is due. */
  private backupButton(): HTMLElement {
    const settings = loadBackupSettings();
    const age = backupAgeText(settings);
    const due = backupDue(settings);
    const b = button(t('backup.button'), () => void this.openBackup(), { text: `💾 ${age}`, className: `backup-button${due ? ' due' : ''}`, title: t('backup.buttonTitle', { last: backupLastText(settings) }) });
    b.dataset.keywords = 'backup restore sauvegarde restaurer archive 备份 恢复';
    return b;
  }

  private async openBackup(): Promise<void> {
    const { backupDialog } = await import('../backup/ui');
    await backupDialog(this.root);
    this.renderHeader();
    this.root.querySelector('.backup-banner')?.remove();
  }

  // --- one's own devices (DEVSYNC-001..DEVSYNC-005) -----------------------------------

  /** DEVSYNC-006: `invitation`, a link this application was opened with; `invite`, show an invitation at once. */
  async openDeviceSync(opts: { invitation?: string; invite?: boolean } = {}): Promise<void> {
    const { syncDialog } = await import('../devsync/ui');
    await syncDialog(this.root, { openBackup: () => void this.openBackup(), scan: () => void this.receiveFromDevice(), openFolder: () => void this.openBrowserStorage(), openDocuments: () => void this.openBrowserDocuments(), ...opts });
  }

  /** DEVSYNC-007: on a paired device, where a document is saved: in the browser (synchronised) or as a file. */
  private async wantsSyncedSave(): Promise<boolean> {
    const { loadSyncState } = await import('../devsync/state');
    const state = loadSyncState();
    if (!state.pairing || !state.understood) return false;
    const synced = t('devsync.saveSynced');
    const choice = await this.choose(t('devsync.saveWhere'), t('devsync.saveWhereMessage'), [synced, t('devsync.saveFile')], synced, t('file.save'));
    if (!choice) throw new SaveCancelled();
    return choice === synced;
  }

  /** DEVSYNC-007: the document saved in Browser storage › Documents, the folder then open, so that the next saves go there too. */
  private async saveToSynced(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const { privateStorage, basename: base } = await import('../fs');
    const folder = await privateStorage('Documents', t('folder.browserStorage')).catch(() => null);
    if (!folder) return this.showError(t('devsync.noStorage'));
    const own = doc.kind === 'file';
    const name = base(own ? doc.name : replaceExtension(doc.name, fileExtension(doc.format)));
    try {
      const exists = await folder.list('').then((entries) => entries.some((e) => e.name === name), () => false);
      if (exists && !window.confirm(t('devsync.replaceSynced', { name }))) return;
      const bytes = await this.withBusy(async () => doc.view.save!(doc.format));
      await folder.write(name, new Blob([bytes as BlobPart]));
      const dirty = this.current;
      if (!(await this.setFolder(folder))) return;
      if (dirty) {
        dirty.folderPath = name;
        dirty.name = name;
      }
      this.folder?.setCurrent(name);
      this.keepVersion(doc, bytes);
      this.dirty = false;
      this.discardDraft();
      this.renderHeader();
      this.showNotice(t('devsync.savedSynced', { name }));
      // FILE-031: found again in the recent files, which reopen the file of the browser's storage.
      this.onFileSaved?.(new File([bytes as BlobPart], name, { type: MIME_TYPES[doc.format] }), doc.format, `${BROWSER_ORIGIN}${name}`);
      // Synchronised at once with the devices online, when synchronising by itself.
      const [{ currentSync }, { loadSyncState }] = await Promise.all([import('../devsync/live'), import('../devsync/state')]);
      if (loadSyncState().auto && currentSync()?.sync.peerCount()) void currentSync()!.sync.syncNow();
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  private syncButton(): HTMLElement {
    const devices = button(t('devsync.button'), () => void this.openDeviceSync(), { text: t('devsync.short'), icon: '🔁', className: 'sync-button', title: t('devsync.buttonTitle') });
    devices.dataset.keywords = 'sync synchronise devices appareils synchroniser synchronisation téléphone phone laptop 同步 设备';
    void import('../devsync/live').then(({ currentSync, listen }) => {
      const show = (online: number): void => {
        devices.classList.toggle('online', online > 0);
        devices.title = online ? t('devsync.buttonOnline', { n: online }) : t('devsync.buttonTitle');
      };
      show(currentSync()?.peers.length ?? 0);
      this.unlistenSync?.();
      this.unlistenSync = listen({ peers: (p) => show(p.length) });
    });
    return devices;
  }

  private unlistenSync?: () => void;

  /** DEVSYNC-011: the documents of this browser, their state on the paired devices, the trash and the history. */
  async openBrowserDocuments(): Promise<void> {
    const { privateStorage } = await import('../fs');
    const files = await privateStorage('Documents', t('folder.browserStorage')).catch(() => null);
    if (!files) return this.showError(t('devsync.noStorage'));
    const [{ showBrowserDocuments }, { loadSyncState }, live] = await Promise.all([import('../devsync/documents-ui'), import('../devsync/state'), import('../devsync/live')]);
    const state = loadSyncState();
    const paired = !!state.pairing && state.understood && !inExam();
    await showBrowserDocuments(this.root, {
      files,
      open: (path) => void this.openBrowserDocument(path),
      openFolder: () => void this.openBrowserStorage(),
      ...(paired
        ? {
            syncNow: async () => {
              const running = live.currentSync() ?? (await live.startSync(files).catch(() => undefined));
              if (!running) return t('devsync.noStorage');
              if (!running.sync.peerCount()) return t('devsync.waiting');
              await running.sync.syncNow();
              return t('docs.syncing');
            },
            listen: (done: () => void) => live.listen({ synced: done }),
          }
        : {}),
    });
  }

  /** FILE-031: a document of the browser's storage, opened from its folder (a recent file). */
  async openBrowserDocument(path: string): Promise<void> {
    await this.openBrowserStorage();
    if (this.folder?.provider.id === BROWSER_FOLDER_ID) await this.openFromFolder(path);
  }

  /**
   * FILE-032: "Go to file" — a document kept in this browser, or of the folder
   * open, found by typing part of its name or its path, the latest first.
   */
  async goToFile(): Promise<void> {
    if (this.paletteOpen || this.root.querySelector('dialog[open]')) return;
    this.paletteOpen = true;
    try {
      const [{ privateStorage, walk }, { OPENABLE }, { openPalette }] = await Promise.all([import('../fs'), import('../folder/panel'), import('./palette')]);
      const browser = await privateStorage('Documents', t('folder.browserStorage')).catch(() => null);
      const sources = [...(browser ? [browser] : []), ...(this.folder && this.folder.provider.id !== BROWSER_FOLDER_ID ? [this.folder.provider] : [])];
      if (!sources.length) return this.showError(t('devsync.noStorage'));
      const files: { path: string; modified: number; source: (typeof sources)[number] }[] = [];
      await this.withBusy(async () => {
        for (const source of sources) {
          for await (const e of walk(source, '', { maxDepth: 32, maxEntries: 50_000 })) {
            if (e.kind === 'file' && OPENABLE.test(e.path)) files.push({ path: e.path, modified: e.lastModified ?? 0, source });
          }
        }
      });
      files.sort((a, b) => b.modified - a.modified || a.path.localeCompare(b.path));
      const commands = files.map((f) => {
        const dirs = f.path.split('/').slice(0, -1);
        return {
          label: basename(f.path),
          keywords: f.path,
          where: [f.source.label, ...dirs].join(' › '),
          // The tree of folders down to it, its start and its end always shown.
          path: [f.source.label, ...dirs],
          run: () => void (f.source.id === BROWSER_FOLDER_ID ? this.openBrowserDocument(f.path) : this.openFromFolder(f.path)),
        };
      });
      this.paletteOpen = false;
      await openPalette(this.root, commands, { label: t('goto.title'), placeholder: t('goto.placeholder'), none: files.length ? t('goto.none') : t('goto.empty'), flat: 50 });
    } finally {
      this.paletteOpen = false;
    }
  }

  /**
   * CAL-002: the calendar of the events of the folder open (else of the
   * browser's storage), in place of the document.
   */
  async openCalendarApp(): Promise<void> {
    if (!this.confirmDiscard()) return;
    if (!this.folder) await this.openBrowserStorage();
    const folder = this.folder;
    if (!folder) return;
    const [{ CalendarView }, { noteName }] = await Promise.all([import('../pim/calendar-view'), import('../folder/vault')]);
    const view = new CalendarView({
      provider: folder.provider,
      open: (path) => void this.openFromFolder(path),
      openDaily: (date) => void folder.openDaily(date),
      backlinks: (path) => folder.vault.backlinks(path),
      appendToDaily: (date, line) => folder.appendToDaily(date, line),
      noteNames: () => folder.vault.index.notes().map((p) => noteName(p)),
      changed: (paths, event) => {
        void folder.refresh();
        // NOTIF-001: the reminders follow the events changed.
        void import('../pim/notify').then(({ remindersChanged }) => remindersChanged());
        // CAL-005: the daily note of its day links to it.
        if (event) void folder.linkEventToDaily(event.day, event.path);
        void Promise.all(paths.map((p) => folder.vault.changed(p))).catch(() => undefined);
      },
      error: (message) => this.showError(message),
      statusChanged: () => this.renderStatus(),
      // CAL-006, CONTACT-005: the servers' calendars and address books.
      notify: (message) => this.showNotice(message),
      addAccount: async () => {
        const { browseCloud } = await import('../webdav/ui');
        await browseCloud(this.root, 'open');
      },
      download: (name, text, type) => void saveFile(new TextEncoder().encode(text), name, 'text', { mimeType: type, extension: name.slice(name.lastIndexOf('.') + 1) }),
    });
    folder.setCurrent(undefined);
    this.setDocument({ name: t('cal.title'), format: 'text', kind: 'file', view });
  }

  /** VAULT-001: a new vault of passwords, its master password asked twice. */
  async newVault(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const { askMasterPassword } = await import('../vault/new');
    const choice = await askMasterPassword(this.root);
    if (!choice) return;
    const [{ newVault }, { VaultView }] = await Promise.all([import('../vault/kdbx'), import('../vault/view')]);
    const db = await this.withBusy(() => newVault(choice.name, choice.password));
    const name = `${choice.name}.kdbx`;
    const view = new VaultView(new Uint8Array(), this.viewContext(), name, db);
    this.setDocument({ name, format: 'kdbx', kind: formatKind('kdbx'), view });
    this.dirty = true;
    this.renderHeader();
  }

  /** DB-001: a new, empty SQLite database, to save where the user wants. */
  async newDatabase(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const name = t('sqlite.untitled');
    const view = await openView('sqlite', new Uint8Array(), this.viewContext(), name);
    this.setDocument({ name, format: 'sqlite', kind: formatKind('sqlite'), view });
    this.dirty = true;
    this.renderHeader();
  }

  /** DB-002: a new data model (an example to start from), in the folder open (else the browser's storage). */
  async newDataModel(): Promise<void> {
    if (!this.confirmDiscard()) return;
    if (!this.folder) await this.openBrowserStorage();
    const folder = this.folder;
    if (!folder) return;
    const name = window.prompt(t('dm.newName'), t('dm.format'))?.trim().replace(/[\\/:*?"<>|]/g, '-');
    if (!name) return;
    const [{ EXAMPLE_MODEL }, { readText }] = await Promise.all([import('../datamodel/model'), import('../fs')]);
    let path = `${name}.mcd`;
    for (let i = 2; await readText(folder.provider, path).then(() => true, () => false); i++) path = `${name} ${i}.mcd`;
    await folder.provider.write(path, new Blob([EXAMPLE_MODEL]));
    await folder.refresh();
    await this.openFromFolder(path);
  }

  /** NOTE-003: a new view of the notes of the folder open (else of the browser's storage), opened at once. */
  async newNotesView(): Promise<void> {
    if (!this.confirmDiscard()) return;
    if (!this.folder) await this.openBrowserStorage();
    const folder = this.folder;
    if (!folder) return;
    const name = window.prompt(t('views.newViewName'), t('views.format'))?.trim().replace(/[\\/:*?"<>|]/g, '-');
    if (!name) return;
    const [{ writeViewSpec, DEFAULT_VIEW }, { readText }] = await Promise.all([import('../folder/note-views'), import('../fs')]);
    let path = `${name}.view.yaml`;
    for (let i = 2; await readText(folder.provider, path).then(() => true, () => false); i++) path = `${name} ${i}.view.yaml`;
    await folder.provider.write(path, new Blob([writeViewSpec({ ...DEFAULT_VIEW, title: name, columns: ['name', 'tags', 'modified'], sort: ['-modified'] })]));
    await folder.refresh();
    await this.openFromFolder(path);
  }

  /** CONTACT-002: the contacts of the folder open (else of the browser's storage), in place of the document. */
  async openContactsApp(): Promise<void> {
    if (!this.confirmDiscard()) return;
    if (!this.folder) await this.openBrowserStorage();
    const folder = this.folder;
    if (!folder) return;
    const [{ ContactsView }, { noteName }] = await Promise.all([import('../pim/contacts-view'), import('../folder/vault')]);
    const view = new ContactsView({
      provider: folder.provider,
      open: (path) => void this.openFromFolder(path),
      noteNames: () => folder.vault.index.notes().map((p) => noteName(p)),
      backlinks: (path) => folder.vault.backlinks(path),
      appendToDaily: (date, line) => folder.appendToDaily(date, line),
      changed: (paths) => {
        void folder.refresh();
        void Promise.all(paths.map((p) => folder.vault.changed(p))).catch(() => undefined);
      },
      error: (message) => this.showError(message),
      statusChanged: () => this.renderStatus(),
      // CAL-006, CONTACT-005: the servers' calendars and address books.
      notify: (message) => this.showNotice(message),
      addAccount: async () => {
        const { browseCloud } = await import('../webdav/ui');
        await browseCloud(this.root, 'open');
      },
      download: (name, text, type) => void saveFile(new TextEncoder().encode(text), name, 'text', { mimeType: type, extension: name.slice(name.lastIndexOf('.') + 1) }),
    });
    folder.setCurrent(undefined);
    this.setDocument({ name: t('people.title'), format: 'text', kind: 'file', view });
  }

  /** FOLDER-027: the calendar of the notes (of the folder open, else of the browser's storage), or today's note. */
  async openCalendar(today = false): Promise<void> {
    if (!this.folder) await this.openBrowserStorage();
    if (!this.folder) return;
    this.folder.showCalendar();
    if (today) await this.folder.openDaily(new Date());
  }

  /** The documents kept in this browser (and synchronised between one's devices), as the folder. */
  async openBrowserStorage(): Promise<void> {
    const { privateStorage } = await import('../fs');
    const folder = await privateStorage('Documents', t('folder.browserStorage')).catch(() => null);
    if (folder) await this.setFolder(folder);
    else this.showError(t('devsync.noStorage'));
  }

  /** DEVSYNC-002: "Sync my devices now" of the command palette; the window when this device is not paired yet. */
  private async syncDevicesNow(): Promise<void> {
    const { loadSyncState } = await import('../devsync/state');
    const state = loadSyncState();
    if (!state.pairing || !state.understood) return this.openDeviceSync();
    const { startSync, listen } = await import('../devsync/live');
    try {
      const live = await this.withBusy(() => startSync());
      if (!live) return this.showError(t('devsync.noStorage'));
      if (!live.sync.peerCount()) return this.showNotice(t('devsync.waiting'));
      const stop = listen({
        synced: (r) => this.showNotice(t('devsync.synced', { peer: r.peer, n: r.fetched.length, d: r.trashed.length, c: r.conflicts.length, f: r.failed.length })),
        error: (m) => this.showError(m),
      });
      setTimeout(stop, 120_000);
      this.showNotice(t('devsync.done'));
      await this.withBusy(() => live.sync.syncNow());
    } catch (err) {
      this.showError((err as Error).message);
    }
  }

  private deviceSyncResumed = false;

  /** Synchronising by itself: join the paired devices when the application opens. */
  private async resumeDeviceSync(): Promise<void> {
    if (this.deviceSyncResumed || inExam()) return;
    this.deviceSyncResumed = true;
    const { loadSyncState } = await import('../devsync/state');
    const state = loadSyncState();
    if (!state.pairing || !state.auto || !state.understood) return;
    const { startSync } = await import('../devsync/live');
    await startSync().catch(() => undefined);
  }

  private backupReminded = false;

  /** BACKUP-006: backups made by themselves while the application is open, when one is due. */
  private autoBackupStarted = false;
  private startAutoBackup(): void {
    if (this.autoBackupStarted || inExam()) return;
    this.autoBackupStarted = true;
    let running = false;
    const tick = async (): Promise<void> => {
      if (running) return;
      running = true;
      try {
        const { autoBackup } = await import('../backup/ui');
        const result = await autoBackup();
        if (typeof result === 'object') {
          this.renderHeader();
          this.showNotice(t('backup.autoDone', { name: result.last!.name }));
        }
      } finally {
        running = false;
      }
    };
    setTimeout(() => void tick(), 30_000);
    setInterval(() => void tick(), 5 * 60_000);
  }

  /** A reminder on the start screen when a backup is due and there is something to back up. */
  private async offerBackup(container: HTMLElement): Promise<void> {
    const settings = loadBackupSettings();
    if (this.backupReminded || !backupDue(settings)) return;
    if (!settings.last) {
      const { listRecent } = await import('../storage/recent');
      if (!(await listRecent().catch(() => [])).length) return;
    }
    if (!container.isConnected) return;
    this.backupReminded = true;
    const banner = h(
      'div',
      { class: 'draft-banner backup-banner', role: 'status' },
      h('span', {}, t('backup.reminder', { last: backupLastText(settings) })),
      button(t('backup.now'), () => void this.openBackup(), { className: 'primary' }),
      button(t('backup.remindLater'), () => banner.remove()),
    );
    container.prepend(banner);
  }

  /** BACKUP-006: on the old site, ask to back up and restore at the new address. */
  private offerMove(container: HTMLElement): void {
    if (!movedFrom(this.options.location ?? location.href)) return;
    container.prepend(
      h(
        'div',
        { class: 'draft-banner move-banner', role: 'status' },
        h('span', {}, t('move.notice'), ' ', h('a', { href: NEW_HOME, rel: 'noopener' }, NEW_HOME)),
        h('span', {}, t('move.how')),
        button(t('backup.now'), () => void this.openBackup(), { className: 'primary' }),
      ),
    );
  }

  private discardDraft(): void {
    clearInterval(this.autosaveTimer);
    this.autosaveTimer = undefined;
    void this.options.drafts?.clear().catch(() => undefined);
  }

  private async offerDraft(container: HTMLElement): Promise<void> {
    const draft = await this.options.drafts?.load().catch(() => undefined);
    if (!draft || !container.isConnected) return;
    const when = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : '';
    container.prepend(
      h(
        'div',
        { class: 'draft-banner', role: 'status' },
        h('span', {}, t('draft.recovered', { when: when ? ` (${when})` : '' })),
        button(t('draft.restore', { name: draft.name }), () => void this.openFile(new File([draft.bytes as BlobPart], draft.name)), { className: 'primary' }),
        button(t('draft.discard'), () => {
          this.discardDraft();
          container.querySelector('.draft-banner')?.remove();
        }),
      ),
    );
  }

  private startRenderer?: (container: HTMLElement) => void;

  /** Hook used by the recent-files feature to fill the start screen. */
  set renderStart(fn: ((container: HTMLElement) => void) | undefined) {
    this.startRenderer = fn;
    const recent = this.main.querySelector<HTMLElement>('.recent');
    if (fn && recent && !this.current) fn(recent);
  }

  get renderStart(): ((container: HTMLElement) => void) | undefined {
    return this.startRenderer;
  }

  private renderHeader(): void {
    const doc = this.current;
    const items: (Node | null)[] = [
      // The icon of the application (fanned sheets: document, spreadsheet, presentation).
      h('img', { class: 'brand', src: 'icon.svg', alt: '', 'aria-hidden': 'true', width: '28', height: '28' }),
      // UI-013: version and build, like QRShare; opens the About window.
      button(versionLabel(), () => void this.showAbout(), { className: 'app-version', title: t('about.openTitle') }),
    ];
    if (doc) {
      items.push(
        this.docNameElement(doc),
        // GIT-007: the repository's branches and requests, from the document.
        doc.source ? button(`${doc.source.repo.visibility === 'internal' ? '🏢' : (doc.source.repo.visibility ?? (doc.source.repo.private ? 'private' : 'public')) === 'private' ? '🔒' : '🌐'} ${doc.source.repo.name} · ${doc.source.branch}`, () => void this.repoDocumentMenu(), { className: 'doc-source', title: t('git.branchMenu') }) : null,
        doc.grist ? h('span', { class: 'doc-source' }, `Grist · ${new URL(doc.grist.account.serverUrl).host}`) : null,
        doc.dav ? h('span', { class: 'doc-source', title: doc.dav.path }, `☁ ${new URL(doc.dav.account.url).host}`) : null,
        // FILE-029: tied to a repository or a server: can be detached.
        doc.source || doc.dav ? button(t('origin.detach'), () => this.detachOrigin(), { className: 'icon doc-detach', text: '✕', title: t('origin.detach') }) : null,
        this.dirty ? h('span', { class: 'modified', title: t('file.unsaved'), 'aria-label': t('file.unsaved') }, '●') : null,
      );
    }
    const actions = h('nav', { class: 'header-actions', 'aria-label': t('file.actions') });
    // UI-020: the file and sharing actions used less often are grouped in menus.
    const fileTools: HTMLElement[] = [];
    const shareTools: HTMLElement[] = [];
    if (this.folder) actions.append(button(t('folder.panel'), () => this.toggleFolderPanel(), { text: '📁', className: 'icon', title: t('folder.toggleTitle', { name: this.folder.provider.label }), pressed: this.root.classList.contains('with-folder') }));
    if (doc?.view.masterDocument?.()?.blocks.some((b) => b.type === 'include')) fileTools.push(button(t('master.export'), () => void this.exportAssembled(), { title: t('master.exportTitle') }));
    actions.append(button(t('file.open'), () => void this.pickAndOpen(), { title: t('file.openTitle') }));
    const exam = inExam();
    if (!exam) fileTools.push(button(t('git.open'), () => void this.openFromRepository(), { title: t('git.openTitle'), text: '⎇', className: 'icon' }));
    // FORM-002: the answers of filled forms, gathered in a spreadsheet.
    fileTools.push(button(t('form.compile'), () => void this.compileForms(), { title: t('form.compileTitle'), text: '📋', className: 'icon' }));
    if (doc?.view.save) {
      actions.append(button(t('file.save'), () => void this.save(), { className: 'keep', title: doc.source ? t('git.commitTitle') : doc.grist ? t('grist.saveTitle') : doc.dav ? t('dav.saveBackTitle', { path: doc.dav.path }) : t('file.saveTitle', { format: doc.format.toUpperCase() }) }));
      // FILE-025: the versions kept in this browser.
      fileTools.push(button(t('versions.button'), () => void this.showVersions(), { title: t('versions.title'), text: '🕘', className: 'icon' }));
      if (!doc.source && !doc.grist && !exam) fileTools.push(button(t('dav.saveToCloud'), () => void this.saveToCloud(true), { title: t('dav.saveToCloudTitle'), text: '☁', className: 'icon' }));
      if (!doc.source && !doc.grist && !exam) fileTools.push(button(t('git.commitButton'), () => void this.commitToRepository(), { title: t('git.commitTitle') }));
      const select = h(
        'select',
        { 'aria-label': t('file.saveAsFormat'), title: t('file.saveAsTitle') },
        h('option', { value: '' }, t('file.saveAs')),
        ...saveFormatsFor(doc.kind, loadFormatFamily()).map((f) => h('option', { value: f }, formatLabel(f))),
        ...(doc.view.saveVariants?.() ?? []).map((v) => h('option', { value: `variant:${v.id}` }, v.label)),
        ...(doc.kind !== 'pdf' ? [h('option', { value: 'template' }, t('tpl.saveAs'))] : []),
        ...templateBasesFor(doc.kind).map((f) => h('option', { value: `tplfile:${f}` }, t('tpl.saveFile', { ext: templateExtension(f) }))),
      );
      select.addEventListener('change', () => {
        const value = select.value;
        select.value = '';
        if (value === 'template') void this.saveAsTemplate();
        else if (value.startsWith('tplfile:')) void this.saveTemplateFile(value.slice('tplfile:'.length) as DocumentFormat);
        else if (value.startsWith('variant:')) void this.saveCopy(value.slice('variant:'.length));
        else if (value) void this.save(value as DocumentFormat);
      });
      actions.append(select);
    }
    if (doc?.view.setReadOnly && !doc.locked) fileTools.push(button(t('ro.toggle'), () => this.setReadOnly(!doc.readOnly), { title: doc.readOnly ? t('ro.allowTitle') : t('ro.lockTitle'), text: doc.readOnly ? '🔒' : '🔓', className: 'icon', pressed: !!doc.readOnly }));
    actions.append(toolGroup(t('group.file'), '🗂', fileTools));
    if (doc?.view.agentTools && !exam) actions.append(button(t('ai.open'), () => this.toggleAssistant(), { title: t('ai.openTitle'), text: '✨', className: 'icon', pressed: this.root.classList.contains('with-ai') }));
    if (doc?.view.save) shareTools.push(button(t('share.send'), () => void this.sendToDevice(), { title: t('share.sendTitle'), text: '📲', className: 'icon' }));
    if (doc?.view.collab && (doc.kind === 'document' || doc.kind === 'spreadsheet')) {
      shareTools.push(button(t('collab.start'), () => (this.collab ? this.leaveCollaboration() : void this.startCollaboration()), { title: this.collab ? t('collab.leaveTitle') : t('collab.startTitle'), text: '👥', className: 'icon', pressed: !!this.collab }));
    }
    if (doc?.view.syncable && doc.kind === 'document' && !doc.readOnly) shareTools.push(button(t('sync.open'), () => void this.syncOffline(), { title: t('sync.openTitle'), text: '🔄', className: 'icon' }));
    shareTools.push(button(t('remote.title'), () => void this.createServerLink(), { text: '🔗', className: 'icon', title: t('remote.menuTitle') }));
    // TEACH-005: nothing to share, send or synchronise in exam mode.
    if (!exam) actions.append(toolGroup(t('group.share'), '📤', shareTools));
    // DEVSYNC-001: one's own devices, peer to peer — a button of its own, always in sight, lit when another device is online.
    if (!exam) actions.append(this.syncButton());
    // BACKUP-004: the last backup, always in sight.
    actions.append(this.backupButton());
    // SET-001: the settings window.
    const settings = button(t('settings.open'), () => void this.openSettings(), { title: t('settings.openTitle'), text: '⚙', className: 'icon' });
    settings.dataset.keywords = 'settings preferences options configuration paramètres préférences réglages 设置 选项';
    actions.append(settings);
    actions.append(this.themeButton());
    // UI-022: the command palette, in sight: named in the header, and a round button on a phone.
    actions.append(button(t('palette.label'), () => void this.openPalette(), { title: t('palette.button'), text: `⌘ ${t('palette.label')}`, className: 'palette-button' }));
    if (!this.root.querySelector(':scope > .palette-fab')) {
      this.root.append(button(t('palette.label'), () => void this.openPalette(), { title: t('palette.button'), text: '⌘', className: 'palette-fab' }));
    }
    // The documentation (help) and About, always at hand.
    actions.append(
      h('a', { class: 'button-like icon', href: new URL('docs/', document.baseURI).href, target: '_blank', rel: 'noopener', title: t('app.docsTitle'), 'aria-label': t('app.docs') }, '?'),
      button(t('about.open'), () => void this.showAbout(), { title: t('about.openTitle'), text: 'ℹ', className: 'icon' }),
    );
    if (doc) {
      actions.append(
        button(t('file.print'), () => void this.print(), { title: t('file.printTitle') }),
        button(t('file.close'), () => this.close(), { title: t('file.closeTitle') }),
      );
    }
    // UI-014: on a phone, the actions other than Save go into a "⋯" menu.
    if (!doc?.view.save) actions.querySelector('button')?.classList.add('keep');
    const more = button(t('app.more'), () => {
      const open = this.header.classList.toggle('more-open');
      more.setAttribute('aria-expanded', String(open));
    }, { text: '⋯', className: 'icon more-toggle', title: t('app.moreTitle') });
    more.setAttribute('aria-expanded', 'false');
    actions.append(more);
    actions.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('button, select');
      if (target && target !== more && target.tagName === 'BUTTON' && !target.classList.contains('tool-group-toggle')) this.header.classList.remove('more-open');
    });
    actions.addEventListener('change', () => this.header.classList.remove('more-open'));
    this.header.classList.remove('more-open');
    this.header.replaceChildren(...items.filter((n): n is Node => n !== null), actions);
  }

  // --- documents on a server (SHARE-011) -----------------------------------------

  /** Open a document kept on a server, read-only. */
  async openRemote(link: import('../share/remote').RemoteLink): Promise<void> {
    if (!this.confirmDiscard()) return;
    await this.withBusy(async () => {
      const { fetchRemote, RemoteError } = await import('../share/remote');
      try {
        const file = await fetchRemote(link);
        if (!(await this.openBytes(file.name, file.bytes))) return;
        this.setReadOnly(true, true);
        this.showNotice(t(link.sha256 ? 'remote.openedPinned' : 'remote.opened', { host: new URL(link.url).host }));
      } catch (err) {
        const kind = err instanceof RemoteError ? err.kind : 'network';
        this.showError(t(`remote.error.${kind}` as MessageKey, { message: (err as Error).message, host: new URL(link.url).host }));
      }
    });
  }

  /** Make a link that opens a document of a server read-only, with its QR code. */
  async createServerLink(): Promise<void> {
    const [{ encodeRemoteLink, fetchRemote, RemoteError }, { zoomableQr }] = await Promise.all([import('../share/remote'), import('./qr')]);
    const address = h('input', { type: 'url', class: 'remote-address', 'aria-label': t('remote.address'), placeholder: 'https://example.org/report.odt', spellcheck: 'false' });
    const pin = h('input', { type: 'checkbox', checked: true });
    const result = h('div', { class: 'remote-result', 'aria-live': 'polite' });
    const dialog = h('dialog', { class: 'dialog remote-dialog', 'aria-labelledby': 'remote-title' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    const create = async (): Promise<void> => {
      result.replaceChildren(h('p', { class: 'hint' }, ...busyText(t('remote.checking'))));
      try {
        const file = await fetchRemote({ url: address.value });
        const link = encodeRemoteLink(location.origin + location.pathname, { url: address.value, ...(pin.checked ? { sha256: file.sha256 } : {}) });
        const field = h('input', { type: 'text', readonly: true, class: 'share-link', value: link, 'aria-label': t('remote.link'), spellcheck: 'false' });
        result.replaceChildren(
          h('p', {}, t('remote.ready', { name: file.name, size: `${Math.ceil(file.bytes.length / 1024)} KB` })),
          field,
          h(
            'div',
            { class: 'dialog-actions' },
            button(t('share.copyLink'), () => void navigator.clipboard?.writeText(link).then(() => this.showNotice(t('share.linkCopied')))),
            button(t('remote.try'), () => window.open(link, '_blank', 'noopener')),
          ),
          zoomableQr(() => this.root, link, t('remote.qrAlt'), 180, 'remote-qr'),
        );
      } catch (err) {
        const kind = err instanceof RemoteError ? err.kind : 'network';
        let host = '';
        try {
          host = new URL(address.value).host;
        } catch {
          /* not an address */
        }
        result.replaceChildren(h('p', { class: 'error', role: 'alert' }, t(`remote.error.${kind}` as MessageKey, { message: (err as Error).message, host })));
      }
    };
    address.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void create();
      }
    });
    dialog.append(
      h('h2', { id: 'remote-title' }, t('remote.title')),
      h('p', {}, t('remote.intro')),
      address,
      h('label', { class: 'check' }, pin, ` ${t('remote.pin')}`),
      h('p', { class: 'hint' }, t('remote.cors')),
      h('div', { class: 'dialog-actions' }, button(t('common.close'), close), button(t('remote.create'), () => void create(), { className: 'primary' })),
      result,
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    this.root.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    address.focus();
  }

  // --- read-only documents (FILE-017) -----------------------------------------------

  /** Show the open document read-only, or allow edits again; `locked` when its source cannot be written. */
  setReadOnly(readOnly: boolean, locked = false): void {
    const doc = this.current;
    if (!doc?.view.setReadOnly) return;
    doc.readOnly = readOnly;
    doc.locked = readOnly && (locked || !!doc.locked);
    doc.view.setReadOnly(readOnly);
    this.renderReadOnly();
    this.renderHeader();
  }

  /** Make the read-only document an editable, unsaved copy. */
  editCopy(): void {
    const doc = this.current;
    if (!doc) return;
    delete doc.folderPath;
    delete doc.source;
    delete doc.dav;
    delete doc.grist;
    doc.name = doc.name.replace(/(\.[^.]+)?$/, (ext) => `${t('ro.copySuffix')}${ext}`);
    doc.locked = false;
    this.folder?.setCurrent(undefined);
    this.setReadOnly(false);
    this.markChanged();
    document.title = `${doc.name} — ${t('app.name')}`;
  }

  private renderReadOnly(): void {
    const doc = this.current;
    this.roBanner.hidden = !doc?.readOnly;
    if (!doc?.readOnly) return this.roBanner.replaceChildren();
    this.roBanner.replaceChildren(
      h('span', {}, `🔒 ${doc.locked ? t('ro.lockedBanner') : t('ro.banner')}`),
      ...(doc.locked ? [] : [button(t('ro.edit'), () => this.setReadOnly(false), { title: t('ro.allowTitle') })]),
      button(t('ro.editCopy'), () => this.editCopy(), { title: t('ro.editCopyTitle'), className: doc.locked ? 'primary' : '' }),
    );
  }

  // --- folder mode (FOLDER-001..FOLDER-003) and master documents (DOC-028) ------

  /** Open a local folder as a project: its documents in a side panel. */
  async openFolder(): Promise<void> {
    const { canPickDirectory, pickDirectory, pickFileList, privateStorage } = await import('../fs');
    const { loadDavAccounts, davClient, davLabel } = await import('../webdav/ui');
    // FOLDER-006: a local folder, the browser's own storage, or a Nextcloud / WebDAV account.
    const local = canPickDirectory() ? t('folder.local') : t('folder.localReadOnly');
    const browser = t('folder.browserStorage');
    const accounts = loadDavAccounts();
    const cloud = accounts.map((a) => `☁ ${davLabel(a)}`);
    // FOLDER-007: a branch of a GitHub or GitLab repository, each change a commit.
    const { loadAccounts } = await import('../git/accounts');
    const gitAccounts = inExam() ? [] : loadAccounts();
    const git = gitAccounts.map((a) => `⎇ ${a.label} (${a.provider === 'github' ? 'GitHub' : a.provider === 'gitea' ? 'Gitea / Forgejo' : 'GitLab'})`);
    // GIT-008: any repository, by its address, adding its account if needed.
    const byAddress = t('folder.gitAddress');
    const choice = await this.choose(t('folder.open'), t('folder.where'), [local, browser, ...cloud, ...git, ...(inExam() ? [] : [byAddress])], local);
    if (!choice) return;
    let folder;
    try {
      if (choice === byAddress) folder = await this.repositoryFolderByAddress();
      else if (git.includes(choice)) folder = await this.pickRepositoryFolder(gitAccounts[git.indexOf(choice)]!);
      else if (choice === browser) folder = await privateStorage('Documents', browser);
      else if (cloud.includes(choice)) {
        const account = accounts[cloud.indexOf(choice)]!;
        const { WebDavProvider } = await import('../webdav/provider');
        folder = new WebDavProvider(davClient(account), `webdav:${account.id}`, davLabel(account));
      }
      // Writable with the File System Access API (Chromium), read-only elsewhere.
      else folder = canPickDirectory() ? await pickDirectory() : await pickFileList();
    } catch (err) {
      this.showError(t('folder.error', { message: (err as Error).message }));
      return;
    }
    if (folder) await this.setFolder(folder);
  }

  /** A repository chosen in the repository dialog — by its address first — as a folder (FOLDER-007, GIT-008). */
  private async repositoryFolderByAddress(): Promise<import('../fs').StorageProvider | undefined> {
    const [{ browseRepository }, { clientFor, rememberRepoAccount }, { GitRepoProvider }] = await Promise.all([import('../git/ui'), import('../git/accounts'), import('../git/provider')]);
    const chosen = await browseRepository(this.root, 'folder');
    // GIT-018: its address opens it with this account again.
    if (chosen) rememberRepoAccount(chosen.account, chosen.repo.name);
    return chosen ? new GitRepoProvider(clientFor(chosen.account), chosen.repo, chosen.branch) : undefined;
  }

  /** A repository and a branch of a Git account, as a folder (FOLDER-007). */
  private async pickRepositoryFolder(account: import('../git/accounts').GitAccount): Promise<import('../fs').StorageProvider | undefined> {
    const [{ clientFor }, { GitRepoProvider }] = await Promise.all([import('../git/accounts'), import('../git/provider')]);
    const client = clientFor(account);
    const repos = await this.withBusy(() => client.listRepos());
    if (!repos.length) {
      this.showError(t('folder.noRepositories'));
      return undefined;
    }
    const names = repos.map((r) => r.name);
    const name = await this.choose(t('folder.repository'), t('folder.pickRepository'), names, names[0]!);
    const repo = repos.find((r) => r.name === name);
    if (!repo) return undefined;
    const branches = await this.withBusy(() => client.listBranches(repo.id));
    const branch = branches.length > 1 ? await this.choose(t('folder.repository'), t('folder.pickBranch', { repo: repo.name }), branches, branches.includes(repo.defaultBranch) ? repo.defaultBranch : branches[0]!) : (branches[0] ?? repo.defaultBranch);
    if (!branch) return undefined;
    (await import('../git/accounts')).rememberRepoAccount(account, repo.name);
    return new GitRepoProvider(client, repo, branch);
  }

  /**
   * FOLDER-022: work on another branch of the repository, start a new one, or
   * propose the changes of this branch to the default one (pull request on
   * GitHub, merge request on GitLab).
   */
  /**
   * VER-002, VER-003: the history of the open document in its repository;
   * a version opened replaces the content (the document stays where it is),
   * a version restored is committed back.
   */
  private async showRepoHistory(client: import('../git/types').GitClient, repo: string, branch: string, path: string, folder?: import('../git/provider').GitRepoProvider): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const { historyDialog } = await import('../git/history');
    const choice = await historyDialog(this.root, { client, repo, branch, path, current: async () => doc.view.save!(doc.format) });
    if (!choice || this.current !== doc) return;
    const when = new Date(choice.commit.date).toLocaleString();
    const name = basename(path);
    if (choice.action === 'restore') {
      if (!this.confirmDiscard()) return;
      await this.withBusy(async () => {
        try {
          const message = `docs: restore ${name} as of ${choice.commit.id.slice(0, 7)}`;
          let version: string | undefined;
          if (folder) await folder.write(path, new Blob([choice.bytes as BlobPart]));
          else version = (await client.writeFile(repo, branch, path, choice.bytes, message, doc.source?.version ?? (await client.readFile(repo, branch, path)).version)).version;
          const { source, folderPath } = doc;
          if (!(await this.openBytes(name, choice.bytes))) return;
          const now = this.current;
          if (now) Object.assign(now, { ...(source ? { source: { ...source, ...(version ? { version } : {}) } } : {}), ...(folderPath ? { folderPath } : {}) });
          this.dirty = false;
          this.renderHeader();
          this.showNotice(t('history.restored', { name, when, id: choice.commit.id.slice(0, 7) }));
        } catch (err) {
          this.showError(t('error.git', { message: (err as Error).message }));
        }
      });
      return;
    }
    // Opened: in place of the content, to read it or save it as the newest version.
    if (!this.confirmDiscard()) return;
    const { source, folderPath } = doc;
    await this.withBusy(async () => {
      if (!(await this.openBytes(name, choice.bytes))) return;
      const now = this.current;
      if (!now) return;
      Object.assign(now, { ...(source ? { source } : {}), ...(folderPath ? { folderPath } : {}) });
      this.dirty = true;
      this.renderHeader();
      this.showNotice(t('history.opened', { when }));
    });
  }

  /** GIT-013: the visibility of a repository opened as a folder, the role of the account and the collaborators. */
  private async showRepoInfo(folder: import('../git/provider').GitRepoProvider): Promise<void> {
    const { repoInfo } = await import('../git/info');
    const dialog = h('dialog', { class: 'dialog git-dialog', 'aria-labelledby': 'repo-info-title' });
    const close = (): void => {
      dialog.close();
      dialog.remove();
    };
    dialog.append(
      h('h2', { id: 'repo-info-title' }, `${t('git.infoMenu')} — ${folder.repo.name}`),
      repoInfo(folder.client, folder.repo, !!folder.client.signedIn),
      h('div', { class: 'dialog-actions' }, button(t('common.close'), close, { className: 'primary' })),
    );
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    this.root.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }

  private async gitFolderMenu(folder: import('../git/provider').GitRepoProvider): Promise<void> {
    const { GitRepoProvider } = await import('../git/provider');
    const { client, repo, branch } = folder;
    const newBranch = t('git.workOnNewBranch');
    const other = t('git.switchBranch');
    const propose = t(client.provider === 'gitlab' ? 'git.proposeMerge' : 'git.proposePull', { base: repo.defaultBranch });
    const history = t('history.menu');
    const openPath = this.current?.folderPath;
    const options = [...(openPath ? [history] : []), newBranch, other, ...(branch !== repo.defaultBranch ? [propose] : [])];
    const choice = await this.choose(t('git.branchMenu'), t('git.branchMenuMessage', { repo: repo.name, branch }), options, branch !== repo.defaultBranch ? propose : newBranch, t('common.continue'));
    if (choice === history && openPath) return this.showRepoHistory(client, repo.id, branch, openPath, folder);
    if (!choice || !this.confirmDiscard()) return;
    try {
      if (choice === newBranch) {
        const name = window.prompt(t('git.newBranchPrompt', { from: branch }), `pwo/${new Date().toISOString().slice(0, 10)}`)?.trim();
        if (!name) return;
        await this.withBusy(() => client.createBranch(repo.id, branch, name));
        await this.setFolder(new GitRepoProvider(client, repo, name));
        this.showNotice(t('git.onBranch', { branch: name }));
      } else if (choice === other) {
        const branches = (await this.withBusy(() => client.listBranches(repo.id))).filter((b) => b !== branch);
        if (!branches.length) return this.showNotice(t('git.noOtherBranch'));
        const to = await this.choose(t('git.switchBranch'), t('folder.pickBranch', { repo: repo.name }), branches, branches.includes(repo.defaultBranch) ? repo.defaultBranch : branches[0]!);
        if (to) await this.setFolder(new GitRepoProvider(client, repo, to));
      } else {
        const title = window.prompt(t('git.pullTitle'), t('git.pullDefaultTitle', { branch }))?.trim();
        if (!title) return;
        const pr = await this.withBusy(() => client.createPullRequest(repo.id, branch, repo.defaultBranch, title, ''));
        this.showNotice(t('git.pullOpened', { n: pr.number, url: pr.url }));
        window.open(pr.url, '_blank', 'noopener');
      }
    } catch (err) {
      this.showError(t('folder.error', { message: (err as Error).message }));
    }
  }

  private async setFolder(folder: import('../fs').StorageProvider): Promise<boolean> {
    if (!this.confirmArchiveClose()) return false;
    const [{ FolderPanel }, { FolderIndex }, { rememberFolder }, { DirectoryHandleProvider }, { ArchiveProvider }, { GitRepoProvider }] = await Promise.all([import('../folder/panel'), import('../folder/search'), import('../storage/recent'), import('../fs'), import('../archive/provider'), import('../git/provider')]);
    this.folder?.element.remove();
    if (this.current) delete this.current.folderPath;
    // GIT-014: a folder that is a Git working copy, its branch shown.
    const { workingCopy } = await import('../git/working-copy');
    const wc = folder instanceof GitRepoProvider || folder instanceof ArchiveProvider ? undefined : await workingCopy(folder);
    // GIT-017: a writable working copy is committed to by the application itself.
    this.localRepo = wc && folder.capabilities.write ? new (await import('../git/local')).LocalRepo(folder) : undefined;
    const index = new FolderIndex(folder, async (name, bytes) => {
      const format = detectFormat(name, bytes);
      if (!format || formatKind(format) !== 'document') return undefined;
      const { readDocument } = await import('../document/io');
      return readDocument(format as import('../document/io').TextFormat, bytes);
    });
    this.folder = new FolderPanel(folder, index, {
      open: (path, query) => void this.openFromFolder(path, query),
      close: () => this.closeFolder(),
      changed: (change) => this.folderChanged(change),
      // FOLDER-017: notes rewritten by the panel (a tag renamed): the open one follows when it has no unsaved changes.
      notesChanged: async (paths) => {
        const doc = this.current;
        if (doc?.folderPath && paths.includes(doc.folderPath) && !this.dirty) {
          const path = doc.folderPath;
          delete doc.folderPath;
          await this.openFromFolder(path);
        }
      },
      tagsChanged: () => this.current?.view.tagsChanged?.(),
      openCalendar: () => void this.openCalendarApp(),
      // FOLDER-026: the backlinks under the page of the open note.
      pageBottom: (el) => {
        const view = this.current?.view;
        if (!view?.pageBottom) return false;
        view.pageBottom(el);
        return true;
      },
      error: (message) => this.showError(message),
      prompt: async (message, value) => window.prompt(message, value),
      confirm: async (message) => window.confirm(message),
      // FILE-021: an archive is written back as a whole, by download.
      ...(folder instanceof ArchiveProvider ? { actions: [button(t('zip.download'), () => void this.downloadArchive(folder), { text: '⬇', className: 'icon' })] } : {}),
      // FOLDER-022: branches and pull requests of a repository opened as a folder.
      ...(folder instanceof GitRepoProvider
        ? {
            actions: [
              button(t('git.branchMenu'), () => void this.gitFolderMenu(folder), { text: '⎇', className: 'icon' }),
              // GIT-013: who can see the repository, and who works on it.
              button(t('git.infoMenu'), () => void this.showRepoInfo(folder), { text: folder.repo.visibility === 'internal' ? '🏢' : (folder.repo.visibility ?? (folder.repo.private ? 'private' : 'public')) === 'private' ? '🔒' : '🌐', className: 'icon', title: t('git.infoMenu') }),
            ],
          }
        : wc
          ? { actions: [button(t('gitwc.button', { branch: wc.branch ?? 'Git' }), () => void this.workingCopyMenu(wc.branch ?? '—'), { text: `⎇ ${wc.branch ?? 'Git'}`, className: 'folder-git', title: t('gitwc.title') })] }
          : {}),
    });
    this.root.append(this.folder.element);
    this.root.classList.add('with-folder');
    await this.withBusy(() => this.folder!.refresh());
    if (folder instanceof DirectoryHandleProvider && folder.id.startsWith('fsa:')) void rememberFolder(folder.root);
    this.renderHeader();
    return true;
  }

  /** Open a ZIP archive as a folder (FILE-021). */
  private async openArchive(name: string, bytes: Uint8Array): Promise<boolean> {
    const { ArchiveProvider } = await import('../archive/provider');
    let archive;
    try {
      archive = new ArchiveProvider(bytes, name);
    } catch (err) {
      this.showError(t('error.open', { name, message: (err as Error).message }));
      return false;
    }
    if (!(await this.setFolder(archive))) return false;
    this.showNotice(t('zip.opened', { name }));
    return true;
  }

  /** The open archive, when it has changes not downloaded yet. */
  private archiveChanged(): import('../archive/provider').ArchiveProvider | undefined {
    const p = this.folder?.provider as Partial<import('../archive/provider').ArchiveProvider> | undefined;
    return p?.id?.startsWith('zip:') && p.modified ? (p as import('../archive/provider').ArchiveProvider) : undefined;
  }

  private confirmArchiveClose(): boolean {
    const archive = this.archiveChanged();
    return !archive || window.confirm(t('zip.discard', { name: archive.label }));
  }

  private async downloadArchive(archive: import('../archive/provider').ArchiveProvider): Promise<void> {
    await this.withBusy(async () => {
      const { archiveBytes } = await import('../archive/provider');
      try {
        const bytes = await archiveBytes(archive);
        const name = /\.zip$/i.test(archive.label) ? archive.label : `${archive.label}.zip`;
        if (await saveFile(bytes, name, 'texzip', { mimeType: 'application/zip', extension: 'zip' })) archive.modified = false;
      } catch (err) {
        this.showError(t('error.save', { message: (err as Error).message }));
      }
    });
  }

  private closeFolder(): void {
    if (!this.confirmArchiveClose()) return;
    this.folder?.element.remove();
    this.folder = null;
    this.localRepo = undefined;
    this.root.classList.remove('with-folder');
    if (this.current) delete this.current.folderPath;
    this.renderHeader();
  }

  /**
   * FILE-026: the name of the open file; a click renames it, keeping its
   * extension (the file of a folder or an archive is renamed there).
   */
  private docNameElement(doc: OpenDocument): HTMLElement {
    const where = doc.source ? `${t('git.source', { repo: doc.source.repo.name, branch: doc.source.branch })} — ${doc.source.path}` : formatLabel(doc.format);
    // A file of a repository, Grist or a server keeps the name it has there.
    if (doc.source || doc.grist || doc.dav) return h('span', { class: 'doc-name', title: where }, doc.name);
    const name = button(t('file.rename'), () => this.startRename(name), { text: doc.name, className: 'doc-name', title: `${where} — ${t('file.renameTitle')}` });
    name.setAttribute('aria-label', t('file.renameLabel', { name: doc.name }));
    return name;
  }

  private startRename(nameButton: HTMLElement): void {
    const doc = this.current;
    if (!doc) return;
    const { stem, ext } = splitExtension(doc.name);
    const input = h('input', { type: 'text', class: 'doc-rename', value: stem, 'aria-label': t('file.renameInput'), size: String(Math.max(8, stem.length + 2)) });
    const form = h('form', { class: 'doc-rename-form' }, input, ext ? h('span', { class: 'doc-ext', title: t('file.extensionKept') }, ext) : null);
    let done = false;
    const finish = (apply: boolean): void => {
      if (done) return;
      done = true;
      if (apply && input.value.trim() !== stem) void this.renameCurrent(input.value);
      else this.renderHeader();
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      finish(true);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
    nameButton.replaceWith(form);
    input.focus();
    input.select();
  }

  /** Rename the open file to `typed` plus its extension. */
  async renameCurrent(typed: string): Promise<void> {
    const doc = this.current;
    if (!doc) return;
    const name = renamedKeepingExtension(doc.name, typed);
    if (!name) {
      this.showError(t('file.renameInvalid'));
      return this.renderHeader();
    }
    const oldName = doc.name;
    const oldKey = this.versionKey(doc);
    if (doc.folderPath && this.folder) {
      const provider = this.folder.provider;
      if (!provider.capabilities.write) {
        this.showError(t('file.renameReadOnly'));
        return this.renderHeader();
      }
      const from = doc.folderPath;
      const to = from.includes('/') ? `${from.slice(0, from.lastIndexOf('/'))}/${name}` : name;
      try {
        if ((await provider.list(from.includes('/') ? from.slice(0, from.lastIndexOf('/')) : '')).some((e) => e.name === name)) throw new Error(t('file.renameExists', { name }));
        await provider.move(from, to);
      } catch (err) {
        this.showError((err as Error).message);
        return this.renderHeader();
      }
      await this.folderChanged({ type: 'rename', path: from, to, kind: 'file' });
      await this.folder.refresh();
      this.folder.setCurrent(to);
    } else {
      doc.name = name;
      this.renderHeader();
      // The recent files list it under its new name.
      await this.onFileRenamed?.(oldName, name);
    }
    // Its versions follow it.
    const newKey = this.versionKey(doc);
    if (newKey !== oldKey) await import('../storage/recent').then(({ moveVersions }) => moveVersions(oldKey, newKey, name)).catch(() => undefined);
    this.showNotice(t('file.renamed', { name }));
  }

  /** A file renamed, moved or deleted in the explorer: follow the open document (FOLDER-004). */
  private async folderChanged(change: import('../fs').ExplorerChange): Promise<void> {
    const doc = this.current;
    const { isInside } = await import('../fs');
    // FOLDER-005: links to a renamed note follow it.
    if (this.folder && change.to && change.kind === 'file' && /\.(md|markdown)$/i.test(change.path)) {
      const skip = doc?.folderPath && this.dirty ? doc.folderPath : undefined;
      const changed = await this.folder.vault.renameLinks(change.path, change.to, skip);
      if (changed.length) this.showNotice(t('vault.linksUpdated', { n: changed.length }));
      if (doc?.folderPath && changed.includes(doc.folderPath) && !this.dirty) {
        const path = doc.folderPath;
        delete doc.folderPath;
        await this.openFromFolder(path);
      }
    }
    if (!doc?.folderPath || !isInside(doc.folderPath, change.path)) return;
    if (change.type === 'remove') {
      delete doc.folderPath;
      this.dirty = true;
    } else if (change.to) {
      const oldKey = this.versionKey(doc);
      doc.folderPath = change.to + doc.folderPath.slice(change.path.length);
      doc.name = basename(doc.folderPath);
      // FILE-026: its versions follow it.
      const newKey = this.versionKey(doc);
      await import('../storage/recent').then(({ moveVersions }) => moveVersions(oldKey, newKey, doc.name)).catch(() => undefined);
    }
    this.folder?.setCurrent(doc.folderPath);
    this.renderHeader();
  }

  private toggleFolderPanel(): void {
    this.root.classList.toggle('with-folder');
    this.renderHeader();
  }

  /** On the start screen: reopen one of the folders opened last (permission is asked again) (FOLDER-001, FOLDER-015). */
  private async offerLastFolder(recent: HTMLElement): Promise<void> {
    const { recentFolders } = await import('../storage/recent');
    const folders = await recentFolders();
    if (!folders.length || this.current || !recent.isConnected) return;
    const list = h('div', { class: 'start-actions folder-reopen', role: 'list', 'aria-label': t('folder.recentFolders') });
    for (const f of folders) {
      const reopen = button(t('folder.reopen', { name: f.name }), () => {
        void (async () => {
          const { DirectoryHandleProvider } = await import('../fs');
          const folder = new DirectoryHandleProvider(f.handle);
          if (await folder.permitted(true)) await this.setFolder(folder);
          else this.showError(t('folder.denied', { name: f.name }));
        })();
      }, { className: 'card folder', icon: '📁' });
      // The offer can be removed; the folder itself is not touched.
      const item = h('div', { class: 'folder-reopen-item', role: 'listitem' }, reopen);
      item.append(
        button(t('folder.forget', { name: f.name }), () => {
          void import('../storage/recent')
            .then(({ forgetFolder }) => forgetFolder(f.id))
            .then(() => {
              item.remove();
              if (!list.childElementCount) list.remove();
            });
        }, { text: '✕', className: 'icon folder-forget', title: t('folder.forgetTitle') }),
      );
      list.append(item);
    }
    recent.before(list);
  }

  /** Open a document of the folder; `query` shows its first match. */
  async openFromFolder(path: string, query?: string): Promise<void> {
    const folder = this.folder;
    if (!folder) return;
    if (this.current?.folderPath === path) {
      if (query) this.current.view.find?.(query);
      return;
    }
    await this.withBusy(async () => {
      const { readBytes } = await import('../fs');
      const bytes = await readBytes(folder.provider, path).catch(() => undefined);
      if (!bytes) return this.showError(t('folder.missing', { path }));
      // FILE-021: an archive inside the folder opens in its turn; other files can be downloaded.
      if (isArchive(bytes)) return void (await this.openArchive(basename(path), bytes));
      if (!detectFormat(basename(path), bytes)) {
        if (window.confirm(t('folder.cannotShow', { name: basename(path) }))) {
          const ext = path.includes('.') ? path.slice(path.lastIndexOf('.') + 1) : 'bin';
          await saveFile(bytes, basename(path), 'text', { mimeType: 'application/octet-stream', extension: ext });
        }
        return;
      }
      if (!this.confirmDiscard()) return;
      const images = /\.(md|markdown)$/i.test(path) ? await this.noteImages(path, new TextDecoder().decode(bytes), (p) => readBytes(folder.provider, p)) : undefined;
      if (!(await this.openBytes(basename(path), bytes, undefined, images && ((src) => images.get(src)), true))) return;
      if (this.current && !this.current.fromTemplate) this.current.folderPath = path;
      // FILE-031: a document of the browser's storage goes into the recent files.
      if (this.current && folder.provider.id === BROWSER_FOLDER_ID) this.onFileOpened?.(new File([bytes as BlobPart], basename(path), { type: MIME_TYPES[this.current.format] }), this.current.format, `${BROWSER_ORIGIN}${path}`);
      // FOLDER-023: now a note of the folder, its #tags are shown.
      this.current?.view.tagsChanged?.();
      if (this.current && !folder.provider.capabilities.write) this.setReadOnly(true, true);
      folder.setCurrent(path);
      void folder.showBacklinks(path);
      this.renderHeader();
      if (query) this.current?.view.find?.(query);
    });
  }

  /** Save into the folder, in place or next to it in another format. */
  private async saveToFolder(format?: DocumentFormat): Promise<void> {
    const doc = this.current;
    const folder = this.folder;
    if (!doc?.view.save || !doc.folderPath || !folder) return;
    const target = format ?? doc.format;
    const path = format ? replaceExtension(doc.folderPath, fileExtension(target)) : doc.folderPath;
    try {
      const bytes = await this.withBusy(async () => doc.view.save!(target));
      await folder.provider.write(path, new Blob([bytes as BlobPart]));
      if (this.archiveChanged()) this.showNotice(t('zip.savedInside'));
      doc.folderPath = path;
      doc.name = basename(path);
      doc.format = target;
      this.keepVersion(doc, bytes);
      this.dirty = false;
      this.discardDraft();
      if (format) await folder.refresh();
      // FOLDER-025: the note saved, read again by the index of the notes (its links, its tags).
      void folder.vault.changed(path).then(() => folder.showBacklinks(path)).catch(() => undefined);
      folder.setCurrent(path);
      if (folder.provider.id === BROWSER_FOLDER_ID) this.onFileSaved?.(new File([bytes as BlobPart], basename(path), { type: MIME_TYPES[target] }), target, `${BROWSER_ORIGIN}${path}`);
      this.renderHeader();
      // GIT-017: in a Git working copy, the save is offered as a commit.
      if (this.localRepo && (await import('../git/local-ui')).asksToCommit(folder.provider.id)) await this.commitLocal([path], true);
    } catch (err) {
      this.showError(t('error.save', { message: (err as Error).message }));
    }
  }

  /** GIT-014, GIT-017: what can be done in a Git working copy. */
  private async workingCopyMenu(branch: string): Promise<void> {
    const repo = this.localRepo;
    if (!repo) return this.showNotice(t('gitwc.info', { branch }));
    const doc = this.current;
    const commitDoc = t('gitwc.commitDoc');
    const commitAll = t('gitwc.commitAll');
    const history = t('history.menu');
    const ask = t('gitwc.askOnSave');
    const dontAsk = t('gitwc.dontAskOnSave');
    const { asksToCommit, setAsksToCommit } = await import('../git/local-ui');
    const asking = asksToCommit(repo.provider.id);
    const options = [...(doc?.folderPath ? [commitDoc, history] : []), commitAll, asking ? dontAsk : ask];
    const choice = await this.choose(t('gitwc.title'), t('gitwc.menuMessage', { branch }), options, options[0]!, t('common.continue'));
    if (choice === commitDoc && doc?.folderPath) return this.commitLocal([doc.folderPath]);
    if (choice === commitAll) return this.commitLocal();
    if (choice === history) return this.localHistory();
    if (choice === ask || choice === dontAsk) {
      setAsksToCommit(repo.provider.id, choice === ask);
      this.showNotice(t(choice === ask ? 'gitwc.askingOn' : 'gitwc.askingOff'));
    }
  }

  /** GIT-017: a commit of some files (or of every change) of the working copy. */
  private async commitLocal(paths?: string[], afterSave = false): Promise<void> {
    const repo = this.localRepo;
    if (!repo) return;
    try {
      const [{ localCommitDialog, setAsksToCommit }, { commentAuthor }] = await Promise.all([import('../git/local-ui'), import('./author')]);
      const all = await repo.changes();
      const files = paths ? all.filter((c) => paths.includes(c.path)) : all;
      if (!files.length) return afterSave ? undefined : this.showNotice(t('gitwc.nothing'));
      const branch = (await repo.branch()) ?? '—';
      const first = files[0]!.path;
      const message = files.length === 1 ? `docs: ${files[0]!.status === 'new' ? 'add' : files[0]!.status === 'deleted' ? 'remove' : 'update'} ${basename(first)}` : `docs: update ${files.length} files`;
      const choice = await localCommitDialog(this.root, { branch, message, files, afterSave });
      if (!choice) return;
      if (choice.stopAsking) setAsksToCommit(repo.provider.id, false);
      const id = await this.withBusy(async () => repo.commit(choice.paths, choice.message, await repo.author(commentAuthor())));
      this.showNotice(t('gitwc.committed', { n: choice.paths.length, branch, id: id.slice(0, 7) }));
    } catch (err) {
      this.showError(t('error.git', { message: (err as Error).message }));
    }
  }

  /** GIT-017, VER-002: the local commits of the open document, compared, opened or restored. */
  private async localHistory(): Promise<void> {
    const repo = this.localRepo;
    const doc = this.current;
    const path = doc?.folderPath;
    if (!repo || !doc?.view.save || !path) return;
    const { historyDialog } = await import('../git/history');
    const client = {
      provider: 'github',
      listCommits: (_repo: string, _ref: string, p: string) => repo.listCommits(p),
      readFile: async (_repo: string, ref: string, p: string) => ({ bytes: await repo.readAt(ref, p), version: ref }),
    } as unknown as import('../git/types').GitClient;
    const choice = await historyDialog(this.root, { client, repo: '', branch: (await repo.branch()) ?? '', path, current: async () => doc.view.save!(doc.format) });
    if (!choice || this.current !== doc) return;
    if (!this.confirmDiscard()) return;
    const name = basename(path);
    const when = new Date(choice.commit.date).toLocaleString();
    await this.withBusy(async () => {
      try {
        if (choice.action === 'restore') {
          // A new commit putting the old version back; the history stays as it is.
          await repo.provider.write(path, new Blob([choice.bytes as BlobPart]));
          const { commentAuthor } = await import('./author');
          await repo.commit([path], `docs: restore ${name} as of ${choice.commit.id.slice(0, 7)}`, await repo.author(commentAuthor()));
        }
        if (!(await this.openBytes(name, choice.bytes))) return;
        const now = this.current;
        if (now) now.folderPath = path;
        this.dirty = choice.action === 'open';
        this.renderHeader();
        this.showNotice(t(choice.action === 'restore' ? 'history.restored' : 'history.opened', { name, when, id: choice.commit.id.slice(0, 7) }));
      } catch (err) {
        this.showError(t('error.git', { message: (err as Error).message }));
      }
    });
  }

  /** A link relative to the open document, opened from the folder (FOLDER-003). */
  private openLink(href: string): boolean {
    if (href.startsWith('wiki:')) {
      void this.openWikiLink(href.slice('wiki:'.length).replace(/^!/, ''));
      return true;
    }
    const folder = this.folder;
    if (!folder || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('//')) return false;
    const from = this.current?.folderPath ?? '';
    const target = decodeURI(href.replace(/[#?].*$/, ''));
    void import('../document/master').then(({ resolvePath }) => this.openFromFolder(resolvePath(from, target)));
    return true;
  }

  /** FOLDER-005: follow `[[note#heading]]`; a missing note can be created. */
  private async openWikiLink(ref: string): Promise<void> {
    const folder = this.folder;
    if (!folder) return this.showNotice(t('vault.noFolder'));
    const hash = ref.indexOf('#');
    const target = hash >= 0 ? ref.slice(0, hash) : ref;
    const heading = hash >= 0 ? ref.slice(hash + 1) : '';
    const from = this.current?.folderPath ?? '';
    let path = target ? await folder.vault.resolve(target, from) : from;
    if (!path) {
      if (!window.confirm(t('vault.create', { name: target }))) return;
      const { join, dirname } = await import('../fs');
      path = join(target.includes('/') ? '' : dirname(from), `${target}.md`);
      await folder.provider.write(path, new Blob([`# ${target.split('/').pop()}\n`]));
      await folder.refresh();
    }
    await this.openFromFolder(path, heading || undefined);
  }

  /**
   * Pictures referenced by a note (`![](img.png)`, `<img src>`, `![[img.png]]`, MD-018):
   * read next to it with `readRelative` (folder, server), or from the web.
   */
  private async noteImages(path: string, text: string, readRelative?: (path: string) => Promise<Uint8Array | undefined>): Promise<Map<string, { data: Uint8Array; mediaType: string; name: string }>> {
    const out = new Map<string, { data: Uint8Array; mediaType: string; name: string }>();
    const [{ imageRefs }, { mediaTypeForName }, { resolve }] = await Promise.all([import('../document/markdown-reader'), import('../document/model'), import('../fs')]);
    const refs = imageRefs(text);
    const folder = this.folder;
    let all: string[] | undefined;
    for (const ref of refs) {
      let decoded = ref;
      try {
        decoded = decodeURI(ref);
      } catch {
        /* kept */
      }
      let bytes: Uint8Array | undefined;
      if (/^https?:\/\//i.test(ref)) {
        // A picture on the web: embedded when the server allows it, so that exports keep it.
        bytes = await fetchPicture(ref);
      } else if (!/^(data:|[a-z][a-z0-9+.-]*:)/i.test(ref)) {
        let target: string | undefined;
        try {
          target = resolve(path, decoded.replace(/^\.\//, ''));
        } catch {
          target = undefined;
        }
        if (target && readRelative) bytes = await readRelative(target).catch(() => undefined);
        if (!bytes && folder && !decoded.includes('/')) {
          // An embed names a picture anywhere in the folder.
          const { listFiles, readBytes } = await import('../fs');
          all ??= await listFiles(folder.provider);
          const found = all.find((p) => p.split('/').pop()!.toLowerCase() === decoded.toLowerCase());
          if (found) bytes = await readBytes(folder.provider, found).catch(() => undefined);
        }
      }
      if (bytes) out.set(ref, { data: bytes, mediaType: mediaTypeForName(decoded.replace(/[?#].*$/, '')), name: decoded.split('/').pop()!.replace(/[?#].*$/, '') });
    }
    return out;
  }

  /** Tell when pictures next to a note could not be read (it was opened without its folder). */
  private async missingPictures(note: string, found: Map<string, unknown>): Promise<void> {
    const { imageRefs, isRelativeImage } = await import('../document/markdown-reader');
    const missing = imageRefs(note).filter((r) => isRelativeImage(r) && !found.has(r));
    if (missing.length) this.showNotice(t('md.picturesMissing', { n: missing.length }));
  }

  /** The folder's documents, relative to the open document (to include them, DOC-028). */
  private folderDocuments(): Promise<string[]> | undefined {
    const docs = this.folderRelative((p) => /\.(docx|odt|odm|md|markdown|mdz|tex)$/i.test(p) && p !== this.current?.folderPath);
    return docs && Promise.resolve(docs);
  }

  /** Files of the folder kept by `keep`, relative to the open document. */
  private folderRelative(keep: (path: string) => boolean): string[] | undefined {
    const folder = this.folder;
    if (!folder) return undefined;
    const from = (this.current?.folderPath ?? '').split('/').slice(0, -1);
    return (
      folder
        .files()
        .filter(keep)
        .map((p) => {
          const parts = p.split('/');
          let common = 0;
          while (common < from.length && common < parts.length - 1 && from[common] === parts[common]) common++;
          return [...Array(from.length - common).fill('..'), ...parts.slice(common)].join('/');
        })
    );
  }

  /** Assemble a master document with its sub-documents and save it as one file (DOC-028). */
  async exportAssembled(): Promise<void> {
    const doc = this.current;
    const master = doc?.view.masterDocument?.();
    if (!doc || !master) return;
    const formats = saveFormatsFor('document', loadFormatFamily()).filter((f) => f !== 'mdz');
    const labels = formats.map((f) => formatLabel(f));
    const choice = await this.choose(t('master.export'), t('master.exportMessage'), labels, labels[0]!, t('file.save'));
    if (!choice) return;
    const format = formats[labels.indexOf(choice)]!;
    await this.withBusy(async () => {
      const [{ assemble }, { readDocument, writeDocumentAsync }] = await Promise.all([import('../document/master'), import('../document/io')]);
      const provider = this.folder?.provider;
      const { readBytes } = await import('../fs');
      const { doc: assembled, missing } = await assemble(master, doc.folderPath ?? doc.name, async (path) => {
        const bytes = provider ? await readBytes(provider, path).catch(() => undefined) : undefined;
        const fmt = bytes ? detectFormat(path, bytes) : null;
        return bytes && fmt && formatKind(fmt) === 'document' ? readDocument(fmt as import('../document/io').TextFormat, bytes) : undefined;
      });
      const bytes = await writeDocumentAsync(assembled, format as import('../document/io').TextFormat);
      const name = replaceExtension(doc.name.replace(/(\.[^.]+)$/, '-assembled$1'), fileExtension(format));
      await saveFile(bytes, name, format);
      if (missing.length) this.showError(t('master.missing', { files: missing.join(', ') }));
    });
  }

  /** Every action of the screen, found by name (UI-018). */
  private paletteOpen = false;

  /** The settings window (SET-001). */
  async openSettings(category?: import('../settings/dialog').SettingsCategory): Promise<void> {
    if (this.root.querySelector('dialog[open]')) return;
    const { openSettings } = await import('../settings/dialog');
    openSettings(this.root, {
      locale: () => {
        if (!this.current) this.showStart();
        this.renderHeader();
      },
      theme: () => this.renderHeader(),
    }, category);
  }

  /** FORM-002: gather the answers of filled PDF forms (picked, or those of the open folder) into a new workbook. */
  async compileForms(): Promise<void> {
    let fromFolder = false;
    if (this.folder) {
      const choice = await this.choose(t('form.compile'), t('form.compileSource'), [t('form.compileFolder'), t('form.compilePick')], t('form.compileFolder'));
      if (!choice) return;
      fromFolder = choice === t('form.compileFolder');
    }
    let files: { name: string; read(): Promise<Uint8Array> }[];
    if (fromFolder && this.folder) {
      const provider = this.folder.provider;
      const { listFiles, readBytes } = await import('../fs');
      const { FORM_FILES } = await import('../forms/collect');
      files = (await listFiles(provider)).filter((p) => FORM_FILES.test(p)).map((p) => ({ name: p, read: () => readBytes(provider, p) }));
    } else {
      const picked = await new Promise<File[]>((resolve) => {
        const input = h('input', { type: 'file', accept: '.pdf,.odt,.docx,.md,application/pdf', multiple: '' });
        input.addEventListener('change', () => resolve(Array.from(input.files ?? [])));
        input.addEventListener('cancel', () => resolve([]));
        input.click();
      });
      files = picked.map((f) => ({ name: f.name, read: async () => new Uint8Array(await f.arrayBuffer()) }));
    }
    if (!files.length) return;
    const { answersTable, answersWorkbook, readFormAnswers } = await import('../forms/collect');
    const forms = await this.withBusy(() => Promise.all(files.map(async (f) => readFormAnswers(f.name, await f.read()))));
    const read = forms.filter((f) => !f.error && f.answers.length);
    if (!read.length) return void this.showNotice(t('form.compileNone'));
    const table = answersTable(read, t('form.file'));
    const failed = forms.filter((f) => f.error).length;
    // FORM-004: into a spreadsheet, or into a table of a Grist document.
    const toSheet = t('form.toSheet');
    const toGrist = t('form.toGrist');
    const where = await this.choose(t('form.compile'), t('form.compileWhere', { n: read.length }), [toSheet, toGrist], toSheet, t('common.continue'));
    if (!where) return;
    if (where === toGrist) {
      const [{ pickGristDocument, gristClient, gristErrorMessage }, { sendAnswersToGrist }] = await Promise.all([import('../grist/ui'), import('../forms/grist')]);
      const choice = await pickGristDocument(this.root);
      if (!choice) return;
      const name = window.prompt(t('form.gristTable'), 'Form_answers')?.trim();
      if (!name) return;
      try {
        const sent = await this.withBusy(() => sendAnswersToGrist(gristClient(choice.account), choice.doc.id, table, name));
        this.showNotice(t('form.gristSent', { n: sent.added, table: sent.tableId, doc: choice.doc.name }) + (sent.skipped ? ` ${t('form.gristSkipped', { n: sent.skipped })}` : '') + (failed ? ` ${t('form.compileErrors', { n: failed })}` : ''));
      } catch (err) {
        this.showError(gristErrorMessage(err));
      }
      return;
    }
    await this.withBusy(async () => {
      const wb = answersWorkbook(table, t('form.sheet'));
      const format = defaultFormat('spreadsheet');
      const view = await newView('spreadsheet', this.viewContext(), format, { kind: 'spreadsheet', wb });
      this.setDocument({ name: `${t('form.sheet')}.${fileExtension(format)}`, format, kind: 'spreadsheet', view });
      if (failed) this.showNotice(t('form.compileErrors', { n: failed }));
    });
  }

  async openPalette(): Promise<void> {
    // DRAW-022: an editor that has the whole window (drawing, painting) has its own commands, like any other.
    const editors = Array.from(this.root.querySelectorAll<HTMLDialogElement>('dialog.draw-full[open]'));
    const editor = editors[editors.length - 1];
    const others = Array.from(this.root.querySelectorAll('dialog[open]')).filter((d) => d !== editor && !editor?.contains(d));
    if (this.paletteOpen || others.length || (editor && editor.querySelector('dialog[open]'))) return;
    this.paletteOpen = true;
    const { collectCommands, openPalette } = await import('./palette');
    if (editor) {
      try {
        await openPalette(editor, collectCommands(editor));
      } finally {
        this.paletteOpen = false;
      }
      return;
    }
    try {
      const shown = collectCommands(this.root);
      // UI-018: the view's own commands, such as the review mode, even when no button shows them.
      const labels = new Set(shown.map((c) => c.label));
      const extra = (this.current?.view.commands?.() ?? []).filter((c) => !labels.has(c.label));
      // DEVSYNC-006: one's own devices, without going through their window.
      const where = t('devsync.title');
      const keywords = 'sync synchronise devices appareils synchroniser téléphone phone qr scan invitation 同步 设备 扫描';
      // UI-024: back to the start screen, the document closed (asked first when it has changes).
      const home = this.current ? [{ label: t('home.title'), where: t('home.where'), keywords: 'home start welcome close accueil démarrage début fermer 主页 首页 开始', run: () => this.close() }] : [];
      const devices = inExam() ? [] : [
        { label: t('devsync.cmdNow'), where, keywords, run: () => void this.syncDevicesNow() },
        { label: t('devsync.cmdInvite'), where, keywords, run: () => void this.openDeviceSync({ invite: true }) },
        { label: t('devsync.cmdScan'), where, keywords, run: () => void this.receiveFromDevice() },
        { label: t('docs.title'), where, keywords: `${keywords} documents history historique trash corbeille 历史`, run: () => void this.openBrowserDocuments() },
        { label: t('people.title'), where: t('daily.notes'), keywords: 'contacts people address book persons contacts personnes carnet d’adresses 联系人 通讯录', run: () => void setTimeout(() => void this.openContactsApp()) },
        { label: t('cal.title'), where: t('daily.notes'), keywords: 'calendar events agenda month week journal calendrier événements agenda mois semaine 日历 事件', run: () => void setTimeout(() => void this.openCalendarApp()) },
        { label: t('daily.todayNote'), where: t('daily.notes'), keywords: 'calendar journal daily notes day today calendrier note du jour quotidien aujourd’hui 日历 每日 今天', run: () => void setTimeout(() => void this.openCalendar(true)) },
        { label: t('pw.new'), where: t('pw.format'), keywords: 'password vault passwords kdbx otp totp mot de passe coffre 密码 保险库', run: () => void setTimeout(() => void this.newVault()) },
        { label: t('sqlite.new'), where: 'SQLite', keywords: 'sqlite database base de données table sql db 数据库', run: () => void setTimeout(() => void this.newDatabase()) },
        { label: t('dm.new'), where: t('dm.format'), keywords: 'data model database mcd mld mpd merise entity association sql schema modèle de données base entité 数据模型 实体', run: () => void setTimeout(() => void this.newDataModel()) },
        { label: t('views.new'), where: t('daily.notes'), keywords: 'view table cards board kanban query database base vue tableau cartes requête base de données 视图 表格 看板', run: () => void setTimeout(() => void this.newNotesView()) },
        { label: t('goto.title'), where: t('folder.browserStorage'), keys: ['Ctrl+Shift+O'], keywords: 'go to file open quick aller ouvrir fichier rapide 转到 打开 文件', run: () => void setTimeout(() => void this.goToFile()) },
      ].filter((c) => !labels.has(c.label));
      // TEACH-005: the exam mode, from the palette too.
      const exam = inExam() ? [] : [{ label: t('exam.startButton'), where: t('settings.title'), keywords: 'exam test examen contrôle kiosk kiosque 考试', run: async () => {
        const { chooseStartExam } = await import('../exam/ui');
        if (await chooseStartExam(this.root)) location.reload();
      } }];
      await openPalette(this.root, [...home, ...extra, ...shown, ...devices, ...exam]);
    } finally {
      this.paletteOpen = false;
    }
  }

  // --- local version history (FILE-025) -------------------------------------------

  /** Where a document lives, to group its versions. */
  private versionKey(doc: OpenDocument): string {
    if (doc.source) return `git:${doc.source.repo.id}:${doc.source.path}`;
    if (doc.dav) return `dav:${doc.dav.account.id}:${doc.dav.path}`;
    if (doc.folderPath && this.folder) return `folder:${this.folder.provider.id}:${doc.folderPath}`;
    return `file:${doc.name}`;
  }

  /** Keep what was just saved as a version (in the background). */
  private keepVersion(doc: OpenDocument, bytes: Uint8Array, label?: string): void {
    void import('../storage/recent').then(({ saveVersion }) => saveVersion(this.versionKey(doc), doc.name, doc.format, bytes, label)).catch(() => undefined);
  }

  /** The versions of the open document: save one, open one, download or delete one. */
  async showVersions(): Promise<void> {
    const doc = this.current;
    if (!doc?.view.save) return;
    const [{ listVersions, loadVersion, deleteVersion, saveVersion }, { chooseVersion }] = await Promise.all([import('../storage/recent'), import('./versions-dialog')]);
    const key = this.versionKey(doc);
    for (;;) {
      const choice = await chooseVersion(this.root, doc.name, await listVersions(key).catch(() => []));
      if (!choice) return;
      if (choice.action === 'save') {
        const bytes = await this.withBusy(async () => doc.view.save!(doc.format));
        await saveVersion(key, doc.name, doc.format, bytes, choice.label || undefined);
        this.showNotice(t('versions.saved'));
        continue;
      }
      const v = choice.version!;
      if (choice.action === 'delete') {
        await deleteVersion(v.id);
        continue;
      }
      const bytes = await loadVersion(v.id);
      if (!bytes) return this.showError(t('versions.missing'));
      if (choice.action === 'compare') {
        const [{ versionView }, { showDiff }] = await Promise.all([import('../diff/views'), import('../diff/ui')]);
        const now = await this.withBusy(async () => doc.view.save!(doc.format));
        const [before, after] = await Promise.all([versionView(v.name, bytes), versionView(doc.name, now)]);
        await showDiff(this.root, t('diff.title', { name: doc.name }), [new Date(v.savedAt).toLocaleString(), t('history.now')], before, after);
        continue;
      }
      if (choice.action === 'download') {
        const stamp = new Date(v.savedAt).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
        await saveFile(bytes, v.name.replace(/(\.[^.]+)?$/, `-${stamp}$1`), v.format);
        continue;
      }
      // Open: the version replaces the content; the document stays where it is.
      if (!this.confirmDiscard()) continue;
      const { source, dav, folderPath, grist } = doc;
      await this.withBusy(async () => {
        if (!(await this.openBytes(v.name, bytes))) return;
        const now = this.current;
        if (!now) return;
        Object.assign(now, { ...(source ? { source } : {}), ...(dav ? { dav } : {}), ...(folderPath ? { folderPath } : {}), ...(grist ? { grist } : {}) });
        this.dirty = true;
        this.renderHeader();
        this.showNotice(t('versions.opened', { date: new Date(v.savedAt).toLocaleString() }));
      });
      return;
    }
  }

  /** About window (UI-012). */
  async showAbout(): Promise<void> {
    const { showAbout } = await import('./about');
    showAbout(this.root);
  }

  /** Cycles System → Light → Dark (UI-011). */
  private themeButton(): HTMLButtonElement {
    const theme = loadTheme();
    const icons = { system: '◐', light: '☀', dark: '☾' } as const;
    return button(
      t('theme.label', { mode: t(`theme.${theme}`) }),
      () => {
        const next = nextTheme(loadTheme());
        saveTheme(next);
        applyTheme(next);
        this.renderHeader();
        this.header.querySelector<HTMLButtonElement>('.theme-toggle')?.focus();
      },
      { text: icons[theme], className: 'icon theme-toggle' },
    );
  }

  private renderStatus(): void {
    const doc = this.current;
    this.statusBar.textContent = doc ? `${doc.view.formatLabel?.() ?? formatLabel(doc.format)}${doc.view.status ? ' · ' + doc.view.status() : ''}` : t('app.ready');
  }

  private async pickAndOpen(): Promise<void> {
    const file = await pickFile();
    if (file) await this.openFile(file);
  }

  private confirmDiscard(): boolean {
    return !this.dirty || window.confirm(t('file.discardConfirm'));
  }

  /** Format of new documents: open standards by default (FILE-016). */
  private formatPicker(): HTMLElement {
    const labels: Record<FormatFamily, string> = { open: t('formats.open'), microsoft: t('formats.microsoft') };
    const select = h('select', { 'aria-label': t('formats.label'), class: 'language', title: t('formats.title') }, ...FORMAT_FAMILIES.map((f) => h('option', { value: f, selected: f === loadFormatFamily() }, labels[f])));
    select.addEventListener('change', () => saveFormatFamily(select.value as FormatFamily));
    return h('label', { class: 'language-picker' }, `📄 ${t('formats.label')} `, select);
  }

  private languagePicker(): HTMLElement {
    const select = h('select', { 'aria-label': t('app.language'), class: 'language' }, ...LOCALES.map((l) => h('option', { value: l.code, selected: l.code === getLocale() }, l.label)));
    select.addEventListener('change', () => {
      setLocale(select.value as Locale);
      if (!this.current) this.showStart();
    });
    return h('label', { class: 'language-picker' }, `🌐 ${t('app.language')} `, select);
  }

  /** Modal choice dialog (MD-017). */
  choose(title: string, message: string, options: string[], preselected: string, okLabel = t('common.open')): Promise<string | null> {
    return new Promise((resolve) => {
      const name = 'choice';
      const list = h('div', { class: 'choices', role: 'radiogroup', 'aria-label': title });
      for (const opt of options) {
        const input = h('input', { type: 'radio', name, value: opt, checked: opt === preselected });
        list.append(h('label', { class: 'choice' }, input, ` ${opt}`));
      }
      const dialog = h('dialog', { class: 'dialog', 'aria-labelledby': 'dlg-title' });
      const finish = (value: string | null): void => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      const ok = button(okLabel, () => {
        const checked = dialog.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`);
        finish(checked?.value ?? null);
      }, { className: 'primary' });
      dialog.append(
        h('h2', { id: 'dlg-title' }, title),
        h('p', {}, message),
        list,
        h('div', { class: 'dialog-actions' }, button(t('common.cancel'), () => finish(null)), ok),
      );
      dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(null);
      });
      this.root.append(dialog);
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
      dialog.querySelector<HTMLInputElement>('input:checked')?.focus();
    });
  }

  private showNotice(message: string): void {
    this.showError(message);
    this.alert.classList.add('notice');
  }

  private showError(message: string): void {
    this.alert.classList.remove('notice');
    this.alert.hidden = false;
    this.alert.replaceChildren(
      h('span', {}, message),
      button(t('common.dismiss'), () => this.hideError(), { text: '×', className: 'icon' }),
    );
  }

  private hideError(): void {
    this.alert.hidden = true;
    this.alert.replaceChildren();
  }

  /** Tasks running: nested ones share the indicator, hidden when the last one ends. */
  private busyCount = 0;

  private async withBusy<T>(task: () => Promise<T>): Promise<T> {
    if (this.busyCount++ === 0) this.busyTimer = setTimeout(() => (this.busy.hidden = false), 300);
    try {
      return await task();
    } finally {
      if (--this.busyCount === 0) {
        clearTimeout(this.busyTimer);
        this.busy.hidden = true;
      }
    }
  }

  /** FILE-027: dropped files or a dropped folder in the folder panel; the first document opens. */
  private async openDroppedFolder(drop: import('../fs/drop').CapturedDrop): Promise<void> {
    const folder = await this.withBusy(() => droppedFolder(drop, (n) => t('drop.several', { n }))).catch((err: Error) => {
      this.showError(t('folder.error', { message: err.message }));
      return null;
    });
    if (!folder || !(await this.setFolder(folder))) return;
    const { listFiles } = await import('../fs');
    const { OPENABLE } = await import('../folder/panel');
    // In the order of the drop, top-level files first.
    const order = (drop.entries.some(Boolean) ? drop.entries.map((e) => e?.name ?? '') : drop.files.map((f) => f.name));
    const rank = (p: string): number => (order.includes(p) ? order.indexOf(p) : order.length + p.split('/').length);
    const first = (await listFiles(folder)).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).find((p) => OPENABLE.test(p));
    if (first && !this.current) await this.openFromFolder(first);
  }

  private installDropZone(): void {
    this.root.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        this.root.classList.add('dragging');
      }
    });
    this.root.addEventListener('dragleave', (e) => {
      if (e.target === this.root || !this.root.contains(e.relatedTarget as Node)) this.root.classList.remove('dragging');
    });
    this.root.addEventListener('drop', (e) => {
      this.root.classList.remove('dragging');
      // Files dropped on the folder explorer are imported there (FOLDER-010).
      if (!e.dataTransfer || e.defaultPrevented) return;
      // FILE-027: several files or a folder open as a folder; what a drop carries is only reachable now.
      const drop = captureDrop(e.dataTransfer);
      const file = drop.files[0];
      if (!file) return;
      e.preventDefault();
      if (isFolderDrop(drop)) void this.openDroppedFolder(drop);
      else void this.openFile(file);
    });
    // DRAW-022: the ⌘ button of an editor taking the whole window.
    window.addEventListener('pwo:palette', () => void this.openPalette());
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = e.key.toLowerCase();
      // UI-018: the command palette.
      if (key === 'p' && e.shiftKey) {
        e.preventDefault();
        void this.openPalette();
        return;
      }
      if (key === 's') {
        e.preventDefault();
        void this.save();
      } else if (key === 'o' && e.shiftKey) {
        // FILE-032: a document of the browser's storage, by its name.
        e.preventDefault();
        void this.goToFile();
      } else if (key === 'o') {
        e.preventDefault();
        void this.pickAndOpen();
      }
    });
  }
}

/** A picture from the web, when its server allows it (CORS), within 20 MB and 10 s. */
async function fetchPicture(url: string): Promise<Uint8Array | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), credentials: 'omit' });
    if (!res.ok || !/^image\//.test(res.headers.get('content-type') ?? 'image/')) return undefined;
    const data = new Uint8Array(await res.arrayBuffer());
    return data.length <= 20 * 1024 * 1024 ? data : undefined;
  } catch {
    return undefined;
  }
}

/** The user closed the question of where to save. */
class SaveCancelled extends Error {}
