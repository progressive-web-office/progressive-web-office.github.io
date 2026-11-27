/**
 * Notes written to other formats (Word, OpenDocument, LaTeX, PDF): the
 * comments of a note (MD-024) are left out, and tasks (MD-020) are shown with
 * their check box as a character, since these formats have no task lists.
 */
import { taskDone, type Block, type Paragraph, type RichDocument, type Run } from './model';

const isComment = (r: Run): boolean => 'text' in r && !!r.mdComment;

function paragraph(p: Paragraph): Paragraph | null {
  if (p.raw === 'comment') return null;
  let runs = p.runs.some(isComment) ? p.runs.filter((r) => !isComment(r)) : p.runs;
  if (p.task !== undefined) runs = [{ text: taskDone(p.task) ? '☑ ' : '☐ ' }, ...runs];
  if (runs === p.runs && !p.raw) return p;
  const { raw: _raw, ...rest } = p;
  // MD-023: raw HTML stays as its text, in a code paragraph.
  return { ...rest, ...(p.raw === 'html' ? { style: 'code' as const } : {}), runs };
}

function blocks(list: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of list) {
    if (b.type === 'paragraph') {
      const p = paragraph(b);
      if (p) out.push(p);
    } else if (b.type === 'table') {
      out.push({ ...b, rows: b.rows.map((row) => row.map((cell) => ({ ...cell, blocks: cell.blocks.map((p) => paragraph(p) ?? { ...p, runs: [] }) }))) });
    } else out.push(b);
  }
  return out;
}

/** The document as written to a format other than Markdown. */
export function forExport(doc: RichDocument): RichDocument {
  const touched = JSON.stringify(doc.blocks).match(/"(?:mdComment|task|raw)":/);
  return touched ? { ...doc, blocks: blocks(doc.blocks) } : doc;
}
