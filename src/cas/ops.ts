/**
 * CAS-002: the operations of the dialog of a math cell. Each wraps the
 * expression in its notation, so that the LaTeX of the cell says it all
 * (and is read again, written and exported as an equation).
 */

export type CasOpId = 'simplify' | 'expand' | 'factor' | 'solve' | 'diff' | 'integrate' | 'limit' | 'series' | 'numeric';

/** Arguments of an operation: the variable, bounds (`from`, `to`) or the point, and the order of a series. */
export interface OpArgs {
  v?: string;
  from?: string;
  to?: string;
  n?: string;
}

export interface CasOp {
  id: CasOpId;
  /** The arguments the dialog asks for. */
  args: (keyof OpArgs)[];
}

export const CAS_OPS: readonly CasOp[] = [
  { id: 'simplify', args: [] },
  { id: 'expand', args: [] },
  { id: 'factor', args: [] },
  { id: 'solve', args: ['v'] },
  { id: 'diff', args: ['v'] },
  { id: 'integrate', args: ['v', 'from', 'to'] },
  { id: 'limit', args: ['v', 'to'] },
  { id: 'series', args: ['v', 'to', 'n'] },
  { id: 'numeric', args: [] },
];

const group = (latex: string): string => `\\left(${latex}\\right)`;
const word = (name: string, args: string[]): string => `\\operatorname{${name}}\\left(${args.join(',')}\\right)`;

/** The LaTeX of `latex` with the operation applied. */
export function wrapOp(latex: string, op: CasOpId, args: OpArgs): string {
  const v = args.v?.trim() || 'x';
  switch (op) {
    case 'simplify':
    case 'expand':
    case 'factor':
      return word(op, [latex]);
    case 'numeric':
      return word('N', [latex]);
    case 'solve':
      return word('solve', [latex, v]);
    case 'diff':
      return `\\frac{\\mathrm{d}}{\\mathrm{d}${v}}${group(latex)}`;
    case 'integrate': {
      const bounds = args.from?.trim() && args.to?.trim() ? `_{${args.from.trim()}}^{${args.to.trim()}}` : '';
      return `\\int${bounds}${group(latex)}\\,\\mathrm{d}${v}`;
    }
    case 'limit':
      return `\\lim_{${v}\\to ${args.to?.trim() || '0'}}${group(latex)}`;
    case 'series':
      return word('series', [latex, v, args.to?.trim() || '0', args.n?.trim() || '6']);
  }
}
