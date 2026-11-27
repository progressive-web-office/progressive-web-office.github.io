// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { parseLatex, mathDeps, CasSyntaxError } from '../src/cas/latex';
import { readSympyOutput, sympyCell, SYMPY_PRELUDE } from '../src/cas/sympy';
import { CAS_OPS, wrapOp } from '../src/cas/ops';

/** The local Python with SymPy, when there is one: the generated code is run for real. */
const python = ((): boolean => {
  try {
    return spawnSync('python3', ['-c', 'import sympy'], { encoding: 'utf8' }).status === 0;
  } catch {
    return false;
  }
})();

/** Run cells one after the other in one interpreter; the LaTeX of each result. */
function run(cells: string[]): string[] {
  const functions = new Set<string>();
  for (const c of cells) for (const f of mathDeps(parseLatex(c, { functions })).functions) functions.add(f);
  const script = [SYMPY_PRELUDE, ...cells.map((c, i) => `print('\\x1d${i}')\n${sympyCell(c, { functions })}`)].join('\n');
  const r = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout
    .split('\x1d')
    .slice(1)
    .map((part) => readSympyOutput(part.slice(part.indexOf('\n') + 1)).latex.join('\n'));
}

describe('CAS-002 LaTeX of a math field read as an expression', () => {
  it('reads implicit products, powers, fractions and functions', () => {
    expect(parseLatex('2x+1')).toMatchObject({ k: 'add' });
    expect(parseLatex('\\frac{1}{2}')).toMatchObject({ k: 'div' });
    expect(parseLatex('\\sin^2 x')).toMatchObject({ k: 'pow', base: { k: 'fn', name: 'sin' } });
    expect(parseLatex('x_1+\\alpha')).toMatchObject({ k: 'add', args: [{ k: 'sym', name: 'x_1' }, { k: 'sym', name: 'alpha' }] });
    expect(parseLatex('\\left(x+1\\right)^{2}')).toMatchObject({ k: 'pow' });
  });

  it('reads integrals, derivatives, limits, sums and their variables', () => {
    expect(parseLatex('\\int_0^1 x^2\\,\\mathrm{d}x')).toMatchObject({ k: 'int', v: 'x' });
    expect(parseLatex('\\int t\\,dt')).toMatchObject({ k: 'int', v: 't' });
    expect(parseLatex('\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(x^3\\right)')).toMatchObject({ k: 'diff', v: 'x', n: 1 });
    expect(parseLatex('\\frac{d^2}{dx^2}\\sin x')).toMatchObject({ k: 'diff', v: 'x', n: 2 });
    expect(parseLatex('\\lim_{x\\to0}\\frac{\\sin x}{x}')).toMatchObject({ k: 'lim', v: 'x' });
    expect(parseLatex('\\sum_{n=1}^{\\infty}\\frac{1}{n^2}')).toMatchObject({ k: 'sum', v: 'n' });
  });

  it('reads definitions, and calls of functions defined or usual (f, g, h)', () => {
    expect(parseLatex('a:=3')).toMatchObject({ k: 'assign', target: { k: 'sym', name: 'a' } });
    expect(parseLatex('f(x)\\coloneq x^2')).toMatchObject({ k: 'assign', target: { k: 'call', name: 'f' } });
    expect(parseLatex('F(x):=2x')).toMatchObject({ k: 'assign', target: { k: 'call', name: 'F' } });
    expect(parseLatex('F(2)', { functions: ['F'] })).toMatchObject({ k: 'call', name: 'F' });
    expect(parseLatex('x(x+1)')).toMatchObject({ k: 'mul' });
  });

  it('says where the expression cannot be read', () => {
    expect(() => parseLatex('\\frac{1}{')).toThrow(CasSyntaxError);
    expect(() => parseLatex('x+')).toThrow(CasSyntaxError);
  });

  it('gives what a cell defines and uses, bound variables left out (CAS-004)', () => {
    expect(mathDeps(parseLatex('f(x):=x^2+a'))).toEqual({ defs: ['f'], refs: ['a'], functions: ['f'] });
    expect(mathDeps(parseLatex('\\int_0^b f(t)\\,dt', { functions: ['f'] }))).toEqual({ defs: [], refs: ['b', 'f'], functions: [] });
    expect(mathDeps(parseLatex('e^{i\\pi}')).refs).toEqual([]);
  });
});

describe('CAS-002 operations of the dialog', () => {
  it('wraps the expression in the notation of the operation', () => {
    expect(CAS_OPS.map((o) => o.id)).toEqual(['simplify', 'expand', 'factor', 'solve', 'diff', 'integrate', 'limit', 'series', 'numeric']);
    expect(wrapOp('x^2-1', 'factor', {})).toBe('\\operatorname{factor}\\left(x^2-1\\right)');
    expect(wrapOp('x^2-1=0', 'solve', { v: 'x' })).toBe('\\operatorname{solve}\\left(x^2-1=0,x\\right)');
    expect(wrapOp('x^3', 'diff', { v: 'x' })).toBe('\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(x^3\\right)');
    expect(wrapOp('x^2', 'integrate', { v: 'x', from: '0', to: '1' })).toBe('\\int_{0}^{1}\\left(x^2\\right)\\,\\mathrm{d}x');
    expect(wrapOp('x^2', 'integrate', { v: 'x' })).toBe('\\int\\left(x^2\\right)\\,\\mathrm{d}x');
    expect(wrapOp('\\frac{\\sin x}{x}', 'limit', { v: 'x', to: '0' })).toBe('\\lim_{x\\to 0}\\left(\\frac{\\sin x}{x}\\right)');
    expect(wrapOp('\\sin x', 'series', { v: 'x', to: '0', n: '5' })).toBe('\\operatorname{series}\\left(\\sin x,x,0,5\\right)');
    expect(wrapOp('\\pi', 'numeric', {})).toBe('\\operatorname{N}\\left(\\pi\\right)');
  });
});

describe('CAS-001 SymPy: the text sent and its result', () => {
  it('writes exact numbers, and never Python integer division', () => {
    expect(sympyCell('\\frac{1}{2}')).toContain('_sp.Integer(1)');
    expect(readSympyOutput('noise\n\x1e\\frac{5}{6}\n')).toEqual({ latex: ['\\frac{5}{6}'], text: 'noise' });
  });

  it.skipIf(!python)('computes with SymPy', () => {
    const cells: [string, string][] = [
      ['\\frac{1}{2}+\\frac{1}{3}', '\\frac{5}{6}'],
      ['\\int_0^1 x^2\\,\\mathrm{d}x', '\\frac{1}{3}'],
      ['\\int x\\sin x\\,dx', '- x \\cos{\\left(x \\right)} + \\sin{\\left(x \\right)}'],
      ['\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(x^3\\right)', '3 x^{2}'],
      ['\\lim_{x\\to0}\\frac{\\sin x}{x}', '1'],
      ['\\sum_{n=1}^{\\infty}\\frac{1}{n^2}', '\\frac{\\pi^{2}}{6}'],
      ['\\operatorname{solve}\\left(x^2-1=0,x\\right)', '\\left[ -1, \\  1\\right]'],
      ['\\operatorname{factor}\\left(x^2-1\\right)', '\\left(x - 1\\right) \\left(x + 1\\right)'],
      ['\\operatorname{expand}\\left((x+1)^2\\right)', 'x^{2} + 2 x + 1'],
      ['e^{i\\pi}', '-1'],
      ['\\sqrt{8}', '2 \\sqrt{2}'],
      ['5!', '120'],
      ['\\operatorname{N}\\left(\\pi\\right)', '3.14159265358979'],
      ['\\operatorname{series}\\left(\\sin x,x,0,5\\right)', 'x - \\frac{x^{3}}{6} + O\\left(x^{5}\\right)'],
      ['\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}^{-1}', '\\left[\\begin{matrix}-2 & 1\\\\\\frac{3}{2} & - \\frac{1}{2}\\end{matrix}\\right]'],
      ['\\left|-3\\right|+\\ln\\left(e^2\\right)', '5'],
    ];
    expect(run(cells.map((c) => c[0]))).toEqual(cells.map((c) => c[1]));
  });

  it.skipIf(!python)('computes the operations of the dialog', () => {
    const cases: [string, Parameters<typeof wrapOp>[1], Parameters<typeof wrapOp>[2], string][] = [
      ['\\frac{x^2-1}{x-1}', 'simplify', {}, 'x + 1'],
      ['x^3', 'diff', { v: 'x' }, '3 x^{2}'],
      ['x^2', 'integrate', { v: 'x', from: '0', to: '1' }, '\\frac{1}{3}'],
      ['\\frac{\\sin x}{x}', 'limit', { v: 'x', to: '0' }, '1'],
      ['\\frac{1}{x}', 'limit', { v: 'x', to: '0^+' }, '\\infty'],
      ['t^2-4=0', 'solve', { v: 't' }, '\\left[ -2, \\  2\\right]'],
    ];
    expect(run(cases.map(([l, op, args]) => wrapOp(l, op, args)))).toEqual(cases.map((c) => c[3]));
  });

  it.skipIf(!python)('shares definitions between cells (CAS-004)', () => {
    expect(run(['a:=3', 'f(x):=x^2+a', 'f(2)', '\\gamma+\\lambda'])).toEqual(['a = 3', 'f{\\left(x \\right)} = x^{2} + 3', '7', '\\gamma + \\lambda']);
  });

  it.skipIf(!python)('reports an error of the engine', () => {
    const script = `${SYMPY_PRELUDE}\n${sympyCell('\\frac{1}{0}+\\operatorname{nosuchop}\\left(x\\right)')}`;
    const r = spawnSync('python3', ['-c', script], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
  });
});

describe('CAS-005 math cells in files', () => {
  it('reads and writes a math cell and its result as math fences, also through the editor', async () => {
    const { readMarkdown } = await import('../src/document/markdown-reader');
    const { writeMarkdown } = await import('../src/document/markdown-writer');
    const { blocksToPm, pmToBlocks } = await import('../src/document/pm/convert');
    const md = 'Avant\n\n```math {run sympy}\n\\frac{1}{3}+\\frac{1}{6}\n```\n\n```math {output}\n\\frac{1}{2}\n```\n\n```math {run sympy hide}\nx\n```\n';
    const doc = readMarkdown(md);
    const cell = (doc.blocks[1] as { runs: unknown[] }).runs[0];
    expect(cell).toEqual({ cell: '\\frac{1}{3}+\\frac{1}{6}', lang: 'math', engine: 'sympy', output: { text: '\\frac{1}{2}\n' } });
    expect(writeMarkdown(doc)).toBe(md);
    expect(writeMarkdown({ ...doc, blocks: pmToBlocks(blocksToPm(doc.blocks)) })).toBe(md);
    // An error is text.
    expect(writeMarkdown(readMarkdown('```math {run sympy}\nx+\n```\n\n```text {output error}\nmissing operand\n```\n'))).toContain('```text {output error}');
  });

  it('writes a math cell to other formats as its equation, then that of its result', async () => {
    const { readMarkdown } = await import('../src/document/markdown-reader');
    const { forExport } = await import('../src/document/note-export');
    const doc = forExport(readMarkdown('```math {run sympy}\nx^2\n```\n\n```math {output}\nx^{2}\n```\n\n```math {run sympy hide}\n1+1\n```\n\n```math {output}\n2\n```\n'));
    expect(doc.blocks.map((b) => (b as { runs: unknown[] }).runs)).toEqual([
      [{ math: 'x^2', display: true }, { math: 'x^{2}', display: true }],
      [{ math: '2', display: true }],
    ]);
  });
});

describe('CAS-006 the computer algebra example', () => {
  it.skipIf(!python)('holds the results SymPy gives', async () => {
    const { CAS_CELLS, CAS_OUTPUTS } = await import('../src/templates/cas');
    const keys = Object.keys(CAS_CELLS) as (keyof typeof CAS_CELLS)[];
    expect(run(keys.map((k) => CAS_CELLS[k]))).toEqual(keys.map((k) => CAS_OUTPUTS[k]));
  });

  it('is a document of math cells with their results', async () => {
    const { casMarkdown } = await import('../src/templates/cas');
    const { readMarkdown } = await import('../src/document/markdown-reader');
    for (const lang of ['en', 'fr'] as const) {
      const cells = readMarkdown(casMarkdown(lang)).blocks.flatMap((b) => ('runs' in b ? b.runs : [])).filter((r) => 'cell' in r);
      expect(cells.length).toBe(13);
      expect(cells.every((c) => 'cell' in c && c.lang === 'math' && !!c.output?.text)).toBe(true);
    }
  });
});
