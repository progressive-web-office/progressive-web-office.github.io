import { describe, expect, it } from 'vitest';
import { fieldValue, pdfTools, type PdfAgentHost } from '../src/ai/pdf-tools';
import { folderTools, type FolderAgentHost } from '../src/ai/folder-tools';
import { validateInput, type AgentTool } from '../src/ai/tools';
import type { FormField } from '../src/pdf/forms';

// AI-010: tools for AI agents on a PDF file; AI-011: on the notes of an open folder.

const field = (f: Partial<FormField> & Pick<FormField, 'name' | 'type'>): FormField => ({ value: '', readOnly: false, widgets: [{ page: 0, rect: [0, 0, 10, 10] }], ...f });

function pdfHost(): PdfAgentHost & { values: Record<string, unknown>; notes: { page: number; text: string }[]; marks: { page?: number; text: string; comment: string }[] } {
  const fields = [
    field({ name: 'name', type: 'text', maxLength: 10, tooltip: 'Your name' }),
    field({ name: 'accept', type: 'checkbox', value: false }),
    field({ name: 'size', type: 'radio', options: ['Small', 'Large'] }),
    field({ name: 'country', type: 'dropdown', options: ['France', 'China'] }),
    field({ name: 'id', type: 'text', readOnly: true, value: 'X1' }),
  ];
  const host = {
    values: {} as Record<string, unknown>,
    notes: [] as { page: number; text: string }[],
    marks: [] as { page?: number; text: string; comment: string }[],
    pageCount: () => 3,
    pageTexts: async () => ['Hello page 1.', 'Second page.', 'Third and last.'],
    fields: () => fields,
    value: (f: FormField) => (f.name in host.values ? (host.values[f.name] as string | boolean) : f.value),
    setValue: (name: string, v: string | boolean | string[]) => void (host.values[name] = v),
    annotations: () => [{ page: 1, kind: 'note', author: 'Ann', text: 'Check this' }],
    addNote: async (page: number, text: string) => void host.notes.push({ page, text }),
    highlight: async (page: number | undefined, text: string, comment: string) => {
      host.marks.push({ page, text, comment });
      return text === 'missing' ? 0 : 1;
    },
  };
  return host;
}

const tool = (tools: AgentTool[], name: string): AgentTool => tools.find((t) => t.name === name)!;
const run = async (t: AgentTool, input: Record<string, unknown>): Promise<string> => {
  const problem = validateInput(t.input_schema, input);
  if (problem) throw new Error(problem);
  return t.run(input);
};

describe('AI-010 tools on a PDF file', () => {
  it('reads the text of the pages, a range of them', async () => {
    const tools = pdfTools(pdfHost());
    expect(tool(tools, 'read_pdf').mutates).toBe(false);
    expect(await run(tool(tools, 'read_pdf'), {})).toBe('--- Page 1 of 3 ---\nHello page 1.\n\n--- Page 2 of 3 ---\nSecond page.\n\n--- Page 3 of 3 ---\nThird and last.');
    expect(await run(tool(tools, 'read_pdf'), { first_page: 2, last_page: 2 })).toBe('--- Page 2 of 3 ---\nSecond page.');
    await expect(run(tool(tools, 'read_pdf'), { first_page: 4 })).rejects.toThrow(/between 1 and 3/);
  });

  it('lists the fields with their values and choices', async () => {
    const list = JSON.parse(await run(tool(pdfTools(pdfHost()), 'list_pdf_fields'), {})) as Record<string, unknown>[];
    expect(list[0]).toEqual({ name: 'name', type: 'text', value: '', description: 'Your name', maxLength: 10, page: 1 });
    expect(list[2]).toMatchObject({ name: 'size', type: 'radio', options: ['Small', 'Large'] });
    expect(list[4]).toMatchObject({ name: 'id', readOnly: true, value: 'X1' });
  });

  it('fills the fields with values they accept only', async () => {
    const host = pdfHost();
    const fill = tool(pdfTools(host), 'fill_pdf_fields');
    expect(fill.mutates).toBe(true);
    const out = await run(fill, { fields: [{ name: 'name', value: 'Ada' }, { name: 'accept', value: 'yes' }, { name: 'size', value: 'large' }, { name: 'country', value: 'Peru' }, { name: 'id', value: 'Y' }, { name: 'nope', value: '1' }] });
    expect(host.values).toEqual({ name: 'Ada', accept: true, size: 'Large' });
    expect(out).toContain('Filled 3 field(s)');
    expect(out).toContain('country: must be one of France, China');
    expect(out).toContain('id: read-only');
    expect(out).toContain('nope: no such field');
  });

  it('tells what a field accepts', () => {
    expect(fieldValue(field({ name: 'n', type: 'text', maxLength: 3 }), 'abcd')).toEqual({ error: 'at most 3 characters' });
    expect(fieldValue(field({ name: 'c', type: 'checkbox' }), 'off')).toEqual({ value: false });
    expect(fieldValue(field({ name: 'c', type: 'checkbox' }), 'maybe')).toEqual({ error: 'must be true or false' });
    expect(fieldValue(field({ name: 'd', type: 'dropdown', options: ['A'], editable: true }), 'Other')).toEqual({ value: 'Other' });
    expect(fieldValue(field({ name: 'l', type: 'list', options: ['A', 'B'] }), 'b')).toEqual({ value: ['B'] });
  });

  it('lists the annotations, places notes and highlights texts', async () => {
    const host = pdfHost();
    const tools = pdfTools(host);
    expect(await run(tool(tools, 'list_pdf_annotations'), {})).toBe('Page 2, note by Ann: Check this');
    expect(tool(tools, 'add_pdf_note').mutates).toBe(true);
    expect(await run(tool(tools, 'add_pdf_note'), { page: 2, text: 'Sign here' })).toBe('Note placed on page 2.');
    expect(host.notes).toEqual([{ page: 1, text: 'Sign here' }]);
    expect(await run(tool(tools, 'highlight_pdf_text'), { text: 'Second', comment: 'Why?' })).toBe('Highlighted 1 occurrence(s) of "Second".');
    expect(host.marks).toEqual([{ page: undefined, text: 'Second', comment: 'Why?' }]);
    expect(await run(tool(tools, 'highlight_pdf_text'), { text: 'missing', page: 1 })).toBe('"missing" was not found on page 1.');
  });

  it('offers only reading when the file cannot be changed', () => {
    const names = pdfTools({ ...pdfHost(), readOnlyReason: 'encrypted' }).map((t) => t.name);
    expect(names).toEqual(['read_pdf', 'list_pdf_fields', 'list_pdf_annotations']);
  });
});

describe('AI-011 tools on the notes of an open folder', () => {
  const host: FolderAgentHost = {
    label: 'Notes',
    files: async () => ['ideas.md', 'work/plan.md', 'work/budget.xlsx', 'photo.png'],
    search: async (query) => (query === 'plan' ? [{ path: 'work/plan.md', snippets: ['the …plan… for May'], count: 2 }] : []),
    read: async (path) => (path === 'work/plan.md' ? '# Plan\n\nMay.' : undefined),
  };

  it('lists the notes and documents, read-only', async () => {
    const tools = folderTools(host);
    expect(tools.every((t) => !t.mutates)).toBe(true);
    expect(await run(tool(tools, 'list_notes'), {})).toBe('Folder "Notes":\nideas.md\nwork/plan.md\nwork/budget.xlsx\nphoto.png');
    expect(await run(tool(tools, 'list_notes'), { under: 'work' })).toBe('Folder "Notes":\nwork/plan.md\nwork/budget.xlsx');
  });

  it('searches them, with extracts', async () => {
    const tools = folderTools(host);
    expect(await run(tool(tools, 'search_notes'), { query: 'plan' })).toBe('work/plan.md (2 matches)\n  the …plan… for May');
    expect(await run(tool(tools, 'search_notes'), { query: 'zzz' })).toBe('No note contains "zzz".');
  });

  it('reads a note of the folder only', async () => {
    const tools = folderTools(host);
    expect(await run(tool(tools, 'read_note'), { path: 'work/plan.md' })).toBe('# Plan\n\nMay.');
    await expect(run(tool(tools, 'read_note'), { path: '../secret.md' })).rejects.toThrow(/not a file of the folder/);
    await expect(run(tool(tools, 'read_note'), { path: 'photo.png' })).rejects.toThrow(/cannot be read as text/);
  });
});

describe('AI-010 where a text found is on the page', () => {
  it('gives a box for each occurrence, in the points of the page', async () => {
    const { textBoxes } = await import('../src/ai/pdf-tools');
    // "Hello world" at (72, 760), 24 points high, 120 points wide; a marked content item ignored.
    const items = [{ str: 'Hello world', transform: [24, 0, 0, 24, 72, 760], width: 120, height: 24 }, { type: 'beginMarkedContent' }];
    const [box] = textBoxes(items, 'WORLD');
    expect(box![0]).toBeCloseTo(72 + (120 * 6) / 11);
    expect(box![2]).toBeCloseTo(72 + 120);
    expect(box![1]).toBeLessThan(760);
    expect(box![3]).toBeGreaterThan(760 + 12);
    expect(textBoxes(items, 'o')).toHaveLength(2);
    expect(textBoxes(items, 'nope')).toEqual([]);
  });
});
