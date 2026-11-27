import { describe, expect, it, vi } from 'vitest';
import { CanvasView, relativePath } from '../src/canvas/view';
import type { ProjectSource, ViewContext } from '../src/app/views';
import { SAMPLE } from './canvas-fixtures';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 30));

function context(project?: ProjectSource): ViewContext & { changed: ReturnType<typeof vi.fn>; openLink: ReturnType<typeof vi.fn> } {
  return {
    changed: vi.fn(),
    statusChanged: () => {},
    choose: async (_t: string, _m: string, options: string[]) => options[0] ?? null,
    openLink: vi.fn(() => true),
    notify: () => {},
    ...(project ? { folderProject: () => project } : {}),
  } as unknown as ViewContext & { changed: ReturnType<typeof vi.fn>; openLink: ReturnType<typeof vi.fn> };
}

const folder = (files: Record<string, string>): ProjectSource => ({
  path: 'Boards/plan.canvas',
  children: async () => [],
  walk: async () => Object.keys(files).map((path) => ({ path })),
  read: async (p) => {
    if (!(p in files)) throw new Error('missing');
    return enc(files[p]!);
  },
});

const open = (text = SAMPLE, project?: ProjectSource) => {
  const ctx = context(project);
  const view = new CanvasView(enc(text), ctx, 'plan.canvas');
  document.body.append(view.element);
  return { view, ctx, el: view.element };
};

describe('CANVAS-001 a canvas shown', () => {
  it('draws the cards (groups behind), the edges with their arrow heads and labels', async () => {
    const { el } = open();
    const nodes = [...el.querySelectorAll<HTMLElement>('.canvas-node')];
    expect(nodes.map((n) => n.dataset.id)).toEqual(['g1', 't1', 'f1', 'l1', 'x1']);
    expect(el.querySelector('.canvas-group-label')!.textContent).toBe('Ideas');
    expect(el.querySelector('.canvas-link-url')!.textContent).toBe('https://example.org');
    expect(el.querySelector('.canvas-unknown-type')!.textContent).toContain('sticker');
    expect(el.querySelectorAll('.canvas-edge')).toHaveLength(2);
    expect(el.querySelectorAll('.canvas-edge polygon')).toHaveLength(2);
    expect(el.querySelector('.canvas-edge-label')!.textContent).toBe('leads to');
    // The colours: a preset on the group, any #RRGGBB on the file card.
    expect(nodes[0]!.style.getPropertyValue('--canvas-colour')).toMatch(/^#/);
    expect(nodes[2]!.style.getPropertyValue('--canvas-colour')).toBe('#123abc');
    await vi.waitFor(() => expect(el.querySelector('.canvas-text .canvas-md h1')?.textContent).toBe('Hello'), { timeout: 5000 });
    expect(el.querySelector('.canvas-text .canvas-md strong')?.textContent).toBe('bold');
  });
  it('shows a note of the folder as its text, a picture as a picture, a missing file as such', async () => {
    const text = JSON.stringify({
      nodes: [
        { id: 'a', type: 'file', file: 'Notes/Plan.md', x: 0, y: 0, width: 200, height: 200 },
        { id: 'b', type: 'file', file: 'pics/a.png', x: 300, y: 0, width: 200, height: 200 },
        { id: 'c', type: 'file', file: 'gone.md', x: 600, y: 0, width: 200, height: 200 },
      ],
      edges: [],
    });
    const { el } = open(text, folder({ 'Notes/Plan.md': '# The plan\n\nGoals.', 'pics/a.png': 'png' }));
    const cards = el.querySelectorAll('.canvas-file');
    await vi.waitFor(() => expect(cards[0]!.querySelector('h1')?.textContent).toBe('The plan'), { timeout: 5000 });
    await flush();
    expect(cards[1]!.querySelector('img')).not.toBeNull();
    expect(cards[2]!.textContent).toContain('gone.md');
  });
  it('says the folder is needed to see the files', () => {
    const { el } = open();
    expect(el.querySelector('.canvas-file')!.textContent).toContain('folder');
  });
  it('shows a canvas that cannot be read, read-only, and saves it unchanged', () => {
    const { view, el } = open('{ broken');
    expect(el.querySelector('.canvas-message')!.textContent).toMatch(/cannot be read/);
    expect(new TextDecoder().decode(view.save())).toBe('{ broken');
    view.addText('x');
    expect(view.canvas.nodes).toHaveLength(0);
  });
});

describe('CANVAS-002 opening files and links', () => {
  it('opens the file of a file card relative to the canvas', async () => {
    const { view, ctx } = open(SAMPLE, folder({ 'Notes/Plan.md': '# Plan' }));
    view.openFile(view.canvas.nodes[2]!);
    await vi.waitFor(() => expect(ctx.openLink).toHaveBeenCalledWith('../Notes/Plan.md'));
  });

  it('finds the file of a card whose path starts at the root of notes kept in a folder (FOLDER-033)', async () => {
    const project = { ...folder({ 'Vault/Notes/Plan.md': '# Plan from the vault', 'Vault/Boards/plan.canvas': '' }), path: 'Vault/Boards/plan.canvas' };
    const { view, ctx, el } = open(SAMPLE, project);
    await vi.waitFor(() => expect(el.textContent).toContain('Plan from the vault'));
    view.openFile(view.canvas.nodes[2]!);
    await vi.waitFor(() => expect(ctx.openLink).toHaveBeenCalledWith('../Notes/Plan.md'));
  });
  it('finds the path of a file seen from a folder', () => {
    expect(relativePath('Boards', 'Notes/Plan.md')).toBe('../Notes/Plan.md');
    expect(relativePath('', 'Notes/Plan.md')).toBe('Notes/Plan.md');
    expect(relativePath('Notes', 'Notes/Plan.md')).toBe('Plan.md');
  });
  it('asks before opening a web address, and refuses other schemes', () => {
    const { view } = open();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    view.openUrl('https://example.org');
    expect(confirm).toHaveBeenCalled();
    expect(opened).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    view.openUrl('https://example.org');
    expect(opened).toHaveBeenCalledWith('https://example.org', '_blank', 'noopener,noreferrer');
    opened.mockClear();
    view.openUrl('javascript:alert(1)');
    expect(opened).not.toHaveBeenCalled();
    confirm.mockRestore();
    opened.mockRestore();
  });
});

describe('CANVAS-003 editing', () => {
  it('moves a group with the cards inside it, undoes and redoes', () => {
    const { view, ctx } = open();
    view.moveNodes(['g1'], 100, 50);
    const at = (id: string) => view.canvas.nodes.find((n) => n.id === id)!;
    expect([at('g1').x, at('t1').x, at('f1').y, at('l1').x]).toEqual([60, 100, 50, 0]);
    expect(ctx.changed).toHaveBeenCalled();
    view.undo();
    expect([at('g1').x, at('t1').x]).toEqual([-40, 0]);
    view.redo();
    expect(at('t1').x).toBe(100);
  });
  it('adds cards of every kind, connects them, colours and deletes them', async () => {
    const { view } = open('', folder({ 'Notes/Plan.md': '# x' }));
    const a = view.addText('One');
    const b = view.addText('Two');
    expect(view.canvas.nodes.map((n) => n.text)).toEqual(['One', 'Two']);
    const edge = view.connect(a.id, 'right', b.id, 'left')!;
    expect(view.canvas.edges).toEqual([edge]);
    view.setEdgeLabel(edge.id, 'then');
    expect(view.canvas.edges[0]!.label).toBe('then');
    view.select([a.id]);
    view.setColour('2');
    expect(view.canvas.nodes[0]!.color).toBe('2');
    view.setColour('#00ff00');
    expect(view.canvas.nodes[0]!.color).toBe('#00ff00');
    view.select([]);
    const g = view.addGroup();
    expect(view.canvas.nodes[0]).toBe(g);
    view.setGroupLabel(g.id, 'Steps');
    expect(g.label).toBe('Steps');
    await view.addFile();
    expect(view.canvas.nodes.at(-1)).toMatchObject({ type: 'file', file: 'Notes/Plan.md' });
    // Deleting a card deletes its edges; undo brings both back.
    view.select([a.id]);
    view.deleteSelection();
    expect(view.canvas.nodes.some((n) => n.id === a.id)).toBe(false);
    expect(view.canvas.edges).toHaveLength(0);
    view.undo();
    expect(view.canvas.edges).toHaveLength(1);
  });
  it('edits the text of a card in place', () => {
    const { view, el } = open('');
    const n = view.addText('Old');
    view.editText(n);
    const area = el.querySelector<HTMLTextAreaElement>('.canvas-edit')!;
    area.value = 'New **text**';
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }));
    expect(view.canvas.nodes[0]!.text).toBe('New **text**');
    view.undo();
    expect(view.canvas.nodes[0]!.text).toBe('Old');
  });
  it('deletes with the Delete key and undoes with Ctrl+Z', () => {
    const { view, el } = open();
    view.select(['l1']);
    const scroller = el.querySelector<HTMLElement>('.canvas-scroller')!;
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(view.canvas.nodes.some((n) => n.id === 'l1')).toBe(false);
    expect(view.canvas.edges.map((e) => e.id)).toEqual(['e1']);
    scroller.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(view.canvas.nodes.some((n) => n.id === 'l1')).toBe(true);
  });
  it('changes nothing when read-only', () => {
    const { view } = open();
    view.setReadOnly(true);
    view.moveNodes(['t1'], 10, 10);
    expect(view.canvas.nodes[1]!.x).toBe(0);
  });
});

describe('CANVAS-004 saving', () => {
  it('saves the JSON Canvas with the new cards in the order of the format, unknown fields kept', () => {
    const { view } = open();
    view.addText('Added');
    const back = JSON.parse(new TextDecoder().decode(view.save()));
    const added = back.nodes.at(-1);
    expect(Object.keys(added)).toEqual(['id', 'type', 'text', 'x', 'y', 'width', 'height']);
    expect(back.nodes[0].futureField).toBe(true);
    expect(back.nodes.find((n: { id: string }) => n.id === 'x1').emoji).toBe('*');
    expect(back.meta).toEqual({ version: '1.0' });
  });
});
