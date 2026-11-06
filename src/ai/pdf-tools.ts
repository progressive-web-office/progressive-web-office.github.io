/**
 * AI-010: tools for AI agents on an open PDF file — read its pages, list and
 * fill its form fields, list its annotations, place notes, highlight text.
 * Pages are numbered from 1 for the agent. Inputs come from a model: each
 * value is checked against what the field accepts.
 */
import type { FormField } from '../pdf/forms';
import type { AgentTool } from './tools';

export interface PdfAgentHost {
  pageCount(): number;
  /** The text of each page. */
  pageTexts(): Promise<string[]>;
  fields(): FormField[];
  value(field: FormField): string | boolean | string[];
  setValue(name: string, value: string | boolean | string[]): void;
  /** Set when the file cannot be changed (encrypted, XFA). */
  readOnlyReason?: string;
  annotations(): { page: number; kind: string; author?: string; text: string }[];
  /** `page` from 0. */
  addNote(page: number, text: string): Promise<void>;
  /** Highlights the occurrences of `text` (on one page, from 0, or all); resolves with their number. */
  highlight(page: number | undefined, text: string, comment: string): Promise<number>;
}

/** The longest text read at once; the agent asks for later pages. */
const MAX_TEXT = 40_000;

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** The value a field takes from what an agent gives, or why it does not. */
export function fieldValue(field: FormField, raw: string): { value: string | boolean | string[] } | { error: string } {
  if (field.readOnly) return { error: 'read-only' };
  const pick = (): string | undefined => field.options?.find((o) => fold(o) === fold(raw));
  switch (field.type) {
    case 'checkbox': {
      const v = fold(raw);
      if (['true', 'yes', 'on', '1', 'checked', 'x'].includes(v)) return { value: true };
      if (['false', 'no', 'off', '0', 'unchecked', ''].includes(v)) return { value: false };
      return { error: 'must be true or false' };
    }
    case 'radio':
    case 'dropdown': {
      const option = pick();
      if (option !== undefined) return { value: option };
      if (field.type === 'dropdown' && field.editable) return { value: raw };
      return { error: `must be one of ${(field.options ?? []).join(', ')}` };
    }
    case 'list': {
      const option = pick();
      return option !== undefined ? { value: [option] } : { error: `must be one of ${(field.options ?? []).join(', ')}` };
    }
    case 'text':
      if (field.maxLength && raw.length > field.maxLength) return { error: `at most ${field.maxLength} characters` };
      return { value: raw };
    default:
      return { error: 'cannot be filled here' };
  }
}

export function pdfTools(host: PdfAgentHost): AgentTool[] {
  const count = host.pageCount();
  const pageOf = (n: unknown, what = 'page'): number => {
    const p = Number(n);
    if (!Number.isInteger(p) || p < 1 || p > count) throw new Error(`${what} must be between 1 and ${count}`);
    return p;
  };
  const read: AgentTool[] = [
    {
      name: 'read_pdf',
      description: `Read the text of the pages of the open PDF file (${count} pages), each under a "--- Page n of N ---" line. Ask for a range of pages for a long file.`,
      input_schema: {
        type: 'object',
        properties: {
          first_page: { type: 'integer', description: 'First page to read, from 1 (default 1).' },
          last_page: { type: 'integer', description: 'Last page to read (default the last one).' },
        },
      },
      mutates: false,
      run: async (input) => {
        const first = input.first_page === undefined ? 1 : pageOf(input.first_page, 'first_page');
        const last = input.last_page === undefined ? count : pageOf(input.last_page, 'last_page');
        const texts = await host.pageTexts();
        let out = '';
        for (let p = first; p <= last; p++) {
          const part = `${out ? '\n\n' : ''}--- Page ${p} of ${count} ---\n${(texts[p - 1] ?? '').trim()}`;
          if (out.length + part.length > MAX_TEXT && out) return `${out}\n\n[Stopped before page ${p}: read the next pages with first_page: ${p}.]`;
          out += part;
        }
        return out;
      },
    },
    {
      name: 'list_pdf_fields',
      description: 'List the form fields of the PDF file as JSON: name, type (text, checkbox, radio, dropdown, list), current value, choices, whether required or read-only, description and page.',
      input_schema: { type: 'object', properties: {} },
      mutates: false,
      run: () =>
        JSON.stringify(
          host.fields().map((f) => ({
            name: f.name,
            type: f.type,
            value: host.value(f),
            ...(f.options?.length ? { options: f.options } : {}),
            ...(f.tooltip ? { description: f.tooltip } : {}),
            ...(f.required ? { required: true } : {}),
            ...(f.readOnly ? { readOnly: true } : {}),
            ...(f.maxLength ? { maxLength: f.maxLength } : {}),
            ...(f.widgets[0] ? { page: f.widgets[0].page + 1 } : {}),
          })),
        ),
    },
    {
      name: 'list_pdf_annotations',
      description: 'List the highlights and notes of the PDF file, with their page, author and comment.',
      input_schema: { type: 'object', properties: {} },
      mutates: false,
      run: () => {
        const all = host.annotations();
        return all.length ? all.map((a) => `Page ${a.page + 1}, ${a.kind}${a.author ? ` by ${a.author}` : ''}: ${a.text || '(no comment)'}`).join('\n') : 'No annotations.';
      },
    },
  ];
  if (host.readOnlyReason) return read;
  return [
    ...read,
    {
      name: 'fill_pdf_fields',
      description: 'Fill form fields of the PDF file. A checkbox takes true or false, a radio button, drop-down or list one of its options. Fields not accepting the value are left as they were and reported.',
      input_schema: {
        type: 'object',
        properties: {
          fields: {
            type: 'array',
            description: 'The fields to fill.',
            items: { type: 'object', properties: { name: { type: 'string', description: 'Field name, as listed by list_pdf_fields.' }, value: { type: 'string', description: 'Its new value.' } }, required: ['name', 'value'] },
          },
        },
        required: ['fields'],
      },
      mutates: true,
      run: (input) => {
        const byName = new Map(host.fields().map((f) => [f.name, f]));
        const problems: string[] = [];
        let filled = 0;
        for (const { name, value } of input.fields as { name: string; value: string }[]) {
          const f = byName.get(name);
          if (!f) {
            problems.push(`${name}: no such field`);
            continue;
          }
          const v = fieldValue(f, value);
          if ('error' in v) problems.push(`${name}: ${v.error}`);
          else {
            host.setValue(name, v.value);
            filled++;
          }
        }
        return [`Filled ${filled} field(s).`, ...(problems.length ? ['Not filled:', ...problems] : [])].join('\n');
      },
    },
    {
      name: 'add_pdf_note',
      description: 'Place a note (a comment shown as an icon) at the top of a page of the PDF file.',
      input_schema: { type: 'object', properties: { page: { type: 'integer', description: 'Page, from 1.' }, text: { type: 'string', description: 'The comment.' } }, required: ['page', 'text'] },
      mutates: true,
      run: async (input) => {
        const p = pageOf(input.page);
        await host.addNote(p - 1, String(input.text));
        return `Note placed on page ${p}.`;
      },
    },
    {
      name: 'highlight_pdf_text',
      description: 'Highlight a text of the PDF file wherever it is found (ignoring case), on one page or all, with an optional comment. The text must be on one line.',
      input_schema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'The text to highlight.' }, page: { type: 'integer', description: 'Only on this page, from 1.' }, comment: { type: 'string', description: 'A comment for the highlight.' } },
        required: ['text'],
      },
      mutates: true,
      run: async (input) => {
        const text = String(input.text);
        if (!text.trim()) throw new Error('text must not be empty');
        const p = input.page === undefined ? undefined : pageOf(input.page);
        const n = await host.highlight(p === undefined ? undefined : p - 1, text, String(input.comment ?? ''));
        return n ? `Highlighted ${n} occurrence(s) of "${text}".` : `"${text}" was not found${p ? ` on page ${p}` : ''}.`;
      },
    },
  ];
}

/** A text item of pdf.js: its string, where it starts (transform) and its width, in points. */
interface TextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
}

/**
 * The boxes [x1, y1, x2, y2] (PDF points) of the occurrences of `text` in the
 * text items of a page, ignoring case; an occurrence must be inside one item
 * (one line). Its place in the item is taken in proportion of the characters.
 */
export function textBoxes(items: readonly unknown[], text: string): [number, number, number, number][] {
  const needle = text.toLowerCase();
  const out: [number, number, number, number][] = [];
  if (!needle) return out;
  for (const raw of items) {
    const item = raw as TextItemLike;
    if (typeof item.str !== 'string' || !item.transform || !item.width || !item.str.length) continue;
    const [a = 0, b = 0, c = 0, d = 0, x = 0, y = 0] = item.transform;
    const size = Math.hypot(c, d) || Math.hypot(a, b) || 12;
    const hay = item.str.toLowerCase();
    for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + needle.length)) {
      const x1 = x + (item.width * at) / item.str.length;
      const x2 = x + (item.width * (at + needle.length)) / item.str.length;
      out.push([x1, y - size * 0.25, x2, y + size * 0.85]);
    }
  }
  return out;
}
