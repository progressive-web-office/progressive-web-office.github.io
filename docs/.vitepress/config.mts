import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

// The app is published one level above the documentation (see pages.yml).
const APP_URL = process.env.DOCS_URL ? process.env.DOCS_URL.replace(/\/docs\/?$/, '/') : 'https://progressive-web-office.github.io/';

export default defineConfig({
  // The appearance in three positions (system, light, dark) in place of the default two.
  vite: {
    // The local search index grows with the guide (design note Q22): above the default 500 kB.
    build: { chunkSizeWarningLimit: 1000 },
    resolve: {
      alias: [{ find: /^.*\/VPSwitchAppearance\.vue$/, replacement: fileURLToPath(new URL('./theme/AppearanceSwitch.vue', import.meta.url)) }],
    },
  },
  title: 'Progressive Web Office (PWO)',
  description: 'A simple office suite that runs entirely in your browser.',
  base: process.env.DOCS_BASE ?? '/',
  cleanUrls: true,
  lastUpdated: false,
  // Visual identity: the application's icon and colours (theme/style.css).
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${process.env.DOCS_BASE ?? '/'}logo.svg` }],
    ['meta', { name: 'theme-color', content: '#1f5fbf' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Progressive Web Office' }],
    ['meta', { property: 'og:description', content: 'A simple, private office suite that runs entirely in your browser.' }],
    ['meta', { property: 'og:image', content: `${APP_URL}docs/screenshots/document.png` }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'PWO',
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Formats', link: '/formats/' },
      { text: 'Requirements', link: '/requirements' },
      { text: 'Development', link: '/development' },
      { text: 'Open the app', link: APP_URL, target: '_self' },
    ],
    sidebar: [
      {
        text: 'User guide',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Where are my documents?', link: '/guide/where' },
          { text: 'Text documents', link: '/guide/documents' },
          { text: 'Equations', link: '/guide/equations' },
          { text: 'Diagrams', link: '/guide/diagrams' },
          { text: 'Drawings and schematics', link: '/guide/drawing' },
          { text: 'Canvases', link: '/guide/canvas' },
          { text: 'Code cells (Python, JavaScript)', link: '/guide/code' },
          { text: 'LaTeX', link: '/guide/latex' },
          { text: 'Templates and examples', link: '/guide/templates' },
          { text: 'Spreadsheets', link: '/guide/spreadsheets' },
          { text: 'Presentations', link: '/guide/presentations' },
          { text: 'PDF', link: '/guide/pdf' },
          { text: 'Forms', link: '/guide/forms' },
          { text: 'Reading and reviewing', link: '/guide/review' },
          { text: 'Settings', link: '/guide/settings' },
          { text: 'Exam mode', link: '/guide/exam' },
          { text: 'Printing', link: '/guide/printing' },
          { text: 'Folders and master documents', link: '/guide/folders' },
          { text: 'Calendar and contacts', link: '/guide/calendar' },
          { text: 'Calculator', link: '/guide/calculator' },
          { text: 'Databases and data models', link: '/guide/data-model' },
          { text: 'ZIP archives and source files', link: '/guide/archives' },
          { text: 'Git repositories', link: '/guide/git' },
          { text: 'Nextcloud / WebDAV', link: '/guide/cloud' },
          { text: 'Backups', link: '/guide/backup' },
          { text: 'Locking the application', link: '/guide/lock' },
          { text: 'Passwords', link: '/guide/passwords' },
          { text: 'Pseudonymising documents', link: '/guide/pseudonymisation' },
          { text: 'Syncing my devices', link: '/guide/device-sync' },
          { text: 'Grist', link: '/guide/grist' },
          { text: 'Real-time collaboration', link: '/guide/collaboration' },
          { text: 'Synchronising without a network', link: '/guide/offline-sync' },
          { text: 'Sending to another device', link: '/guide/sharing' },
          { text: 'AI assistant', link: '/guide/assistant' },
        ],
      },
      {
        text: 'Formats',
        items: [
          { text: 'Supported formats', link: '/formats/' },
          { text: 'MDZ packages', link: '/formats/mdz' },
        ],
      },
      {
        text: 'Project',
        items: [
          { text: 'Requirements', link: '/requirements' },
          { text: 'Development', link: '/development' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Offline synchronisation', link: '/offline-sync' },
          { text: 'Plugins (proposal)', link: '/plugins' },
          { text: 'Pseudonymisation (design)', link: '/design/pseudonymisation' },
          { text: 'DigitalSignalix', link: '/digitalsignalix' },
          { text: 'Brand', link: '/brand' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/progressive-web-office/progressive-web-office.github.io' }],
    search: { provider: 'local' },
  },
});
