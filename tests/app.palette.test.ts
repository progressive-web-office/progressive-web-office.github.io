import { describe, expect, it } from 'vitest';
import { filterCommands, splitShortcut } from '../src/app/palette';

describe('UI-018 command palette', () => {
  const commands = ['Insert table', 'Insert image', 'Table of contents', 'Bold', 'Créer une note', 'Save as format: Word document (.docx)'].map((label) => ({ label }));
  it('finds commands by words in any order, ignoring case and accents', () => {
    expect(filterCommands(commands, 'table').map((c) => c.label)).toEqual(['Table of contents', 'Insert table']);
    expect(filterCommands(commands, 'img ins').map((c) => c.label)).toEqual([]);
    expect(filterCommands(commands, 'image ins').map((c) => c.label)).toEqual(['Insert image']);
    expect(filterCommands(commands, 'creer').map((c) => c.label)).toEqual(['Créer une note']);
    expect(filterCommands(commands, 'docx').map((c) => c.label)).toEqual(['Save as format: Word document (.docx)']);
    expect(filterCommands(commands, '  ')).toHaveLength(6);
  });
});

describe('UI-018 keywords in the command palette', () => {
  it('finds a command by its keywords, in any language', () => {
    const commands = [{ label: 'Review mode', keywords: 'correction relecture proofreading' }, { label: 'Bold' }];
    expect(filterCommands(commands, 'correction').map((c) => c.label)).toEqual(['Review mode']);
    expect(filterCommands(commands, 'mode relec').map((c) => c.label)).toEqual(['Review mode']);
    expect(filterCommands(commands, 'bold').map((c) => c.label)).toEqual(['Bold']);
  });
});

describe('UI-018 shortcuts in the command palette', () => {
  it('finds the keyboard shortcut at the end of a tooltip', () => {
    expect(splitShortcut('Comment (Ctrl+Alt+M)')).toEqual({ label: 'Comment', keys: ['Ctrl+Alt+M'] });
    expect(splitShortcut('Find (Ctrl+F, Ctrl+H)')).toEqual({ label: 'Find', keys: ['Ctrl+F', 'Ctrl+H'] });
    expect(splitShortcut('Next page (k)')).toEqual({ label: 'Next page', keys: ['k'] });
    expect(splitShortcut('Zoom out (-)')).toEqual({ label: 'Zoom out', keys: ['-'] });
    expect(splitShortcut('Previous page (Page Up)')).toEqual({ label: 'Previous page', keys: ['Page Up'] });
    expect(splitShortcut('Full screen (f; Esc to leave)')).toEqual({ label: 'Full screen', keys: ['f'] });
  });

  it('leaves other parentheses alone', () => {
    expect(splitShortcut('Markdown package (.mdz)')).toEqual({ label: 'Markdown package (.mdz)', keys: [] });
    expect(splitShortcut('Sources (BibTeX)')).toEqual({ label: 'Sources (BibTeX)', keys: [] });
    expect(splitShortcut('Save')).toEqual({ label: 'Save', keys: [] });
  });
});

describe('UI-022 commands by category', () => {
  it('finds the commands folded in the menus of a toolbar, with their menu as category', async () => {
    const { collectCommands } = await import('../src/app/palette');
    const { toolGroup } = await import('../src/app/tool-groups');
    const { button, h } = await import('../src/app/dom');
    const bar = h('div', { role: 'toolbar', 'aria-label': 'Formatting' }, button('Bold', () => undefined, { text: 'B' }), toolGroup('Insert', '＋', [button('Table', () => undefined, { text: '▦' })], 'compact'));
    document.body.append(bar);
    // jsdom lays nothing out: every element counts as shown.
    for (const el of bar.querySelectorAll<HTMLElement>('*')) Object.defineProperty(el, 'offsetParent', { get: () => (el.closest('[hidden]') ? null : document.body) });
    const commands = collectCommands(document.body);
    expect(commands.map((c) => [c.category, c.label])).toEqual([
      ['Formatting', 'Bold'],
      ['Insert', 'Table'],
    ]);
    bar.remove();
  });

  it('finds the header actions folded behind "More actions" on a phone (UI-014)', async () => {
    const { collectCommands } = await import('../src/app/palette');
    const { toolGroup } = await import('../src/app/tool-groups');
    const { button, h } = await import('../src/app/dom');
    const more = button('More actions', () => undefined, { text: '⋯', className: 'icon more-toggle' });
    const nav = h('nav', { class: 'header-actions', 'aria-label': 'File actions' }, button('Print', () => undefined), toolGroup('File', '🗂', [button('Pseudonymise…', () => undefined)], 'compact'), more);
    document.body.append(nav);
    // Only the "More actions" button is laid out (when `moreShown`): the other actions are folded behind it.
    const layOut = (moreShown: boolean): void => {
      for (const el of nav.querySelectorAll<HTMLElement>('*')) Object.defineProperty(el, 'offsetParent', { configurable: true, get: () => (moreShown && el.closest('.more-toggle') ? document.body : null) });
    };
    layOut(true);
    expect(collectCommands(document.body).map((c) => c.label)).toEqual(['Print', 'Pseudonymise…', 'More actions']);
    // Nothing in sight, not even "More actions": nothing is offered.
    layOut(false);
    expect(collectCommands(document.body)).toEqual([]);
    nav.remove();
  });

  it('finds a command by its category, and lists them all by category', async () => {
    const { filterCommands, groupByCategory } = await import('../src/app/palette');
    const cmds = [
      { label: 'Send by QR code', category: 'Share', where: 'Header', run: () => undefined },
      { label: 'Table', category: 'Insert', where: 'Formatting', run: () => undefined },
      { label: 'Collaborate', category: 'Share', where: 'Header', run: () => undefined },
    ];
    expect(filterCommands(cmds, 'share').map((c) => c.label)).toEqual(['Collaborate', 'Send by QR code']);
    expect(groupByCategory(cmds).map((c) => c.label)).toEqual(['Collaborate', 'Send by QR code', 'Table']);
  });
});
