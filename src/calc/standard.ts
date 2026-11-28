/**
 * CALC-002: the Standard mode, in decimal: + − × ÷, integer powers,
 * parentheses, the change of sign, percentages and the last answer (`ans`).
 */
import { Dec } from './decimal';
import { CalcError, type CalcNode } from './expr';

const HUNDRED = Dec.of(100n);

/** `ans` is the last answer, as written by the calculator. */
export function evaluateStandard(node: CalcNode, ans?: string): Dec {
  const walk = (n: CalcNode): Dec => {
    switch (n.k) {
      case 'num':
        return Dec.parse(n.text);
      case 'id':
        if (n.name.toLowerCase() === 'ans') return ans ? Dec.parse(ans) : Dec.of(0n);
        throw new CalcError('notInMode', n.name);
      case 'neg':
        return walk(n.a).neg();
      case 'post':
        if (n.op === '%') return walk(n.a).div(HUNDRED);
        throw new CalcError('notInMode', n.op);
      case 'bin': {
        const a = walk(n.a);
        // a + b% adds b percent of a; a × b% takes b percent.
        if (n.b.k === 'post' && n.b.op === '%' && (n.op === '+' || n.op === '-')) {
          const part = a.mul(walk(n.b.a)).div(HUNDRED);
          return n.op === '+' ? a.add(part) : a.sub(part);
        }
        const b = walk(n.b);
        if (n.op === '+') return a.add(b);
        if (n.op === '-') return a.sub(b);
        if (n.op === '*') return a.mul(b);
        if (n.op === '/') return a.div(b);
        if (n.op === '^') return a.pow(b);
        throw new CalcError('notInMode', n.op);
      }
      default:
        throw new CalcError('notInMode', n.k);
    }
  };
  return walk(node);
}
