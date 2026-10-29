import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { SANDBOX_BOOTSTRAP } from './src/code/sandbox-html.ts';
import { runtimeDependencies } from './src/app/dependencies.ts';

/** Hash of the code sandbox bootstrap, the only inline script the policy allows (CODE-003). */
const SANDBOX_HASH = `'sha256-${createHash('sha256').update(SANDBOX_BOOTSTRAP).digest('base64')}'`;
/** Hash of the widget view runtime, the inline script of widget frames (CODE-016). */
const VIEW_HASH = `'sha256-${createHash('sha256').update(readFileSync(resolve(import.meta.dirname, 'src/code/widgets/view-runtime.js'), 'utf8')).digest('base64')}'`;

/** Build information shown in the About window (UI-012). */
const PKG = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string };
function gitCommit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

/** Content-Security-Policy injected in production builds only (PLT-008). */
const CSP = [
  "default-src 'self'",
  // blob: and the bootstrap hash are for the code sandbox, whose own policy is stricter (CODE-003).
  `script-src 'self' 'wasm-unsafe-eval' blob: ${SANDBOX_HASH} ${VIEW_HASH}`,
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  // https: for git hosting APIs (GitHub, GitLab, self-hosted) and the AI provider.
  // Local AI servers (Ollama, LM Studio) run over plain HTTP on the user's machine (AI-007).
  // wss: for the Nostr relays that introduce collaborating browsers (COLLAB-001).
  "connect-src 'self' data: blob: https: wss: http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

const csp = (): Plugin => ({
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
});

/**
 * Serve (dev) and emit (build) pdf.js runtime assets under `pdfjs/`:
 * CMaps, standard fonts, ICC profiles and WebAssembly decoders, so that PDF
 * rendering works offline without any CDN (PLT-002, PLT-004).
 */
const PDFJS_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
const pdfjsRoot = resolve(import.meta.dirname, 'node_modules/pdfjs-dist');
const pdfjsAssets = (): Plugin => ({
  name: 'pdfjs-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/pdfjs\/([a-z_]+)\/([^/?]+)/.exec(req.url ?? '');
      if (!m || !PDFJS_DIRS.includes(m[1]!)) return next();
      const file = join(pdfjsRoot, m[1]!, m[2]!);
      if (!existsSync(file) || !statSync(file).isFile()) return next();
      if (file.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      createReadStream(file).pipe(res);
    });
  },
  generateBundle() {
    for (const dir of PDFJS_DIRS) {
      for (const name of readdirSync(join(pdfjsRoot, dir))) {
        if (name.startsWith('quickjs')) continue; // PDF JavaScript is never executed (PDF-004)
        this.emitFile({ type: 'asset', fileName: `pdfjs/${dir}/${name}`, source: readFileSync(join(pdfjsRoot, dir, name)) });
      }
    }
  },
});

/**
 * Serve (dev) and emit (build) the Python runtime under `pyodide/` (CODE-002).
 * It is cached by the service worker on first use rather than precached.
 */
const PYODIDE_FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const pyodideRoot = resolve(import.meta.dirname, 'node_modules/pyodide');
const pyodideAssets = (): Plugin => ({
  name: 'pyodide-assets',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const m = /^\/pyodide\/([^/?]+)/.exec(req.url ?? '');
      if (!m || !PYODIDE_FILES.includes(m[1]!)) return next();
      if (m[1]!.endsWith('.wasm')) res.setHeader('Content-Type', 'application/wasm');
      createReadStream(join(pyodideRoot, m[1]!)).pipe(res);
    });
  },
  generateBundle() {
    for (const name of PYODIDE_FILES) this.emitFile({ type: 'asset', fileName: `pyodide/${name}`, source: readFileSync(join(pyodideRoot, name)) });
  },
});

const fileTypes = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
  'text/csv': ['.csv', '.tsv'],
  'text/markdown': ['.md', '.markdown'],
  'application/x-mdz': ['.mdz'],
  'application/x-tex': ['.tex'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.oasis.opendocument.presentation': ['.odp'],
  // FILE-020: templates open as new documents.
  'application/vnd.oasis.opendocument.text-template': ['.ott'],
  'application/vnd.oasis.opendocument.spreadsheet-template': ['.ots'],
  'application/vnd.oasis.opendocument.presentation-template': ['.otp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.template': ['.dotx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.template': ['.xltx'],
  'application/vnd.openxmlformats-officedocument.presentationml.template': ['.potx'],
  'application/pdf': ['.pdf'],
};

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(PKG.version),
    __GIT_COMMIT__: JSON.stringify(gitCommit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    // UI-017: the open-source components and their installed versions.
    __DEPENDENCIES__: JSON.stringify(runtimeDependencies(import.meta.dirname)),
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' },
  plugins: [
    csp(),
    pdfjsAssets(),
    pyodideAssets(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Progressive Web Office',
        short_name: 'PWO',
        description: 'Documents, spreadsheets, presentations, PDF, notes and live code, in your browser — your files on your device unless you choose to share them.',
        start_url: './',
        scope: './',
        lang: 'en',
        dir: 'ltr',
        orientation: 'any',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        theme_color: '#1f5fbf',
        background_color: '#ffffff',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        // PLT-009: the actions of the icon of the installed application (handled by src/app/pwa.ts).
        shortcuts: [
          { name: 'New document', short_name: 'Document', url: './?new=document', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'New spreadsheet', short_name: 'Spreadsheet', url: './?new=spreadsheet', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'New presentation', short_name: 'Presentation', url: './?new=presentation', icons: [{ src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        // The same screenshots as the documentation, for the install dialog of the browsers and the stores.
        screenshots: [
          { src: 'screenshots/start.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'The start screen of the application' },
          { src: 'screenshots/document.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'A lab report with an equation and a table in the word processor' },
          { src: 'screenshots/spreadsheet.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'A spreadsheet with formulas' },
          { src: 'screenshots/phone-start.png', sizes: '393x851', type: 'image/png', form_factor: 'narrow', label: 'The start screen on a phone' },
          { src: 'screenshots/phone.png', sizes: '393x851', type: 'image/png', form_factor: 'narrow', label: 'A lab report on a phone' },
          { src: 'screenshots/phone-spreadsheet.png', sizes: '393x851', type: 'image/png', form_factor: 'narrow', label: 'A spreadsheet on a phone' },
        ],
        // PLT-006: File Handling API (Chromium). Not yet in the manifest typings.
        ...({
          file_handlers: [{ action: './', accept: fileTypes, launch_type: 'single-client' }],
          // SHARE-003: receive files from QRShare or any app (handled by public/share-target.js).
          share_target: {
            action: './share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'file', accept: [...Object.keys(fileTypes), 'application/zip', 'application/x-zip-compressed', 'text/plain', ...Object.values(fileTypes).flat(), '.zip'] }] },
          },
        } as object),
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,wasm,bcmap,pfb,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // The Python runtime (~13 MB) and the TypeScript language service (~4 MB)
        // are cached on first use instead (CODE-002, CODE-008).
        globIgnores: ['pyodide/**', 'python/**', 'brand/**', 'screenshots/**', 'progressive-web-office/**', 'assets/ts.worker-*.js', 'assets/lib.*.d-*.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/pyodide/') && url.origin === self.location.origin,
            handler: 'CacheFirst',
            options: { cacheName: 'pyodide-runtime', expiration: { maxEntries: 16 } },
          },
          {
            // CODE-016: the widget packages bundled with the application.
            urlPattern: ({ url }) => url.origin === self.location.origin && /\/python\/[^/]+\.(whl|json)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'python-widgets', expiration: { maxEntries: 16 } },
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\/assets\/(ts\.worker-|lib\..+\.d-)[\w-]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'ts-service', expiration: { maxEntries: 120 } },
          },
          {
            urlPattern: ({ url }) => url.href.startsWith('https://cdn.jsdelivr.net/pyodide/'),
            handler: 'CacheFirst',
            options: { cacheName: 'pyodide-packages', expiration: { maxEntries: 200 }, cacheableResponse: { statuses: [200] } },
          },
        ],
        navigateFallback: 'index.html',
        // The documentation is published under /docs/ on the same origin.
        navigateFallbackDenylist: [/\/docs(\/|$)/],
        importScripts: ['share-target.js'],
      },
    }),
  ],
});
