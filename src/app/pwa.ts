/** Service worker registration, update prompt (PLT-005), file handling (PLT-006) and app shortcuts (PLT-009). */
import { t } from '../i18n';
import type { App } from './app';
import { inExam } from '../exam/mode';
import { openNewFromShortcut } from './shortcuts';
import type { WindowLike } from '../share/handoff';

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

export function installPwa(app: App): void {
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    void import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        onNeedRefresh() {
          showUpdateBanner(() => void updateSW(true));
        },
      });
    });
  }
  void openSharedFile(app);
  void openNewFromShortcut(app);
  void openHandedOffFile(app);
  void openLinkedDocument(app);
  // A document link pasted in the address bar of an open tab only changes the fragment.
  addEventListener('hashchange', () => void openLinkedDocument(app));
  const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(async (params) => {
    const handle = params.files[0];
    if (handle) await app.openFile(await handle.getFile());
  });
}

/** Rebuild a document carried in the URL fragment (SHARE-010). */
async function openLinkedDocument(app: App): Promise<void> {
  // TEACH-005: no pairing, session or document from elsewhere in exam mode.
  if (inExam() && /^#(pwo-pair|collab|url|doc)=/.test(location.hash)) {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    app.notifyError(t('exam.linkBlocked'));
    return;
  }
  if (location.hash.startsWith('#pwo-pair=')) {
    // DEVSYNC-006: an invitation to pair this device, out of the address at once (history, bookmarks).
    const invitation = location.hash;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    await app.openDeviceSync({ invitation });
    return;
  }
  if (location.hash.startsWith('#collab=')) {
    // COLLAB-001: an invitation to a real-time session.
    const { decodeCollabLink } = await import('../collab/link');
    const link = decodeCollabLink(location.hash);
    if (link) await app.joinCollaboration(link);
    else app.notifyError(t('share.linkInvalid'));
    return;
  }
  if (location.hash.startsWith('#url=')) {
    // SHARE-011: a document kept on a server, shown read-only. The address stays, so a reload shows it again.
    const { decodeRemoteLink } = await import('../share/remote');
    try {
      const link = decodeRemoteLink(location.hash);
      if (link) await app.openRemote(link);
    } catch (err) {
      app.notifyError(t('remote.error.address', { message: (err as Error).message }));
    }
    return;
  }
  if (!location.hash.startsWith('#doc=')) return;
  const { decodeDocumentLink, decodeEncryptedLink, isEncryptedLink } = await import('../share/link');
  if (isEncryptedLink(location.hash)) {
    // SHARE-014: asked until it opens or the user gives up; the link stays in the address meanwhile.
    const hash = location.hash;
    const { askLinkPassword } = await import('../share/ui');
    for (let wrong = false; ; wrong = true) {
      const password = await askLinkPassword(document.body, wrong);
      if (password === null) break;
      const opened = await decodeEncryptedLink(hash, password);
      if (!opened) continue;
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      await app.openFile(new File([opened.bytes as BlobPart], opened.name));
      return;
    }
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    return;
  }
  const linked = decodeDocumentLink(location.hash);
  // The document stays open; drop it from the address so that a reload does not reopen it.
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (!linked) {
    app.notifyError(t('share.linkInvalid'));
    return;
  }
  await app.openFile(new File([linked.bytes as BlobPart], linked.name));
}

/** Pick up a file received through the Web Share Target (SHARE-003, see public/share-target.js). */
async function openSharedFile(app: App): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.get('shared') !== '1' || !('caches' in window)) return;
  params.delete('shared');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  const cache = await caches.open('pwo-share-target');
  const key = new URL('shared-file', document.baseURI).href;
  const res = await cache.match(key);
  if (!res) return;
  await cache.delete(key);
  const name = decodeURIComponent(res.headers.get('x-file-name') ?? 'shared');
  const blob = await res.blob();
  await app.openReceived(new File([blob], name, { type: blob.type }), { app: 'system' });
}

/**
 * Opened by QRShare's "Open in …" button (SHARE-008): announce readiness to the
 * opener and open the file it hands over, from the configured QRShare only.
 */
async function openHandedOffFile(app: App): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.get('handoff') !== 'qrshare' || inExam()) return;
  params.delete('handoff');
  const query = params.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  if (!window.opener) return;
  const [{ receiveFromOpener }, { loadShareSettings, qrshareOrigin }] = await Promise.all([import('../share/handoff'), import('../share/qrshare')]);
  const received = await receiveFromOpener(window as unknown as WindowLike, [qrshareOrigin(loadShareSettings().url)], 60_000);
  // SHARE-013: checked, and shown with where it comes from, before it is opened.
  if (received) await app.openReceived(received.file, { app: 'qrshare', origin: received.origin });
}

function showUpdateBanner(reload: () => void): void {
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = t('pwa.update');
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.textContent = t('common.reload');
  ok.addEventListener('click', reload);
  const later = document.createElement('button');
  later.type = 'button';
  later.textContent = t('common.later');
  later.addEventListener('click', () => banner.remove());
  banner.append(text, ok, later);
  document.body.append(banner);
}
