import { describe, expect, it } from 'vitest';
import { createReidentifier } from '../src/pseudo/reidentify';
import { PEOPLE_WITH_PSEUDONYMS as people } from './pseudo-fixtures';

const lea = people[0]!;
const r = createReidentifier(people, 'ETU-');
const n = lea.pseudonym.slice(4);

describe('PSEUDO-030 re-identification of a text', () => {
  it.each([
    [`ETU-${n}`],
    [`ETU ${n}`],
    [`etu-${n}`],
    [`ETU‑${n}`], // non-breaking hyphen
    [`ETU–${n}`],
    [`ETU_${n}`],
    [`ETU${n}`],
    [`ETU-0${n}`],
  ])('%s', (written) => {
    expect(r.text(`Copie de ${written}, très bien.`).text).toBe('Copie de Léa Martin, très bien.');
  });
  it('keeps the emphasis around a pseudonym', () => {
    expect(r.text(`**ETU-${n}** et _ETU-${n}_`).text).toBe('**Léa Martin** et _Léa Martin_');
  });
  it('lists the pseudonym-like texts that are not in the table, and leaves them', () => {
    const out = r.text('ETU-999 et ETU-1234');
    expect(out.text).toBe('ETU-999 et ETU-1234');
    expect(out.unknown).toEqual(['ETU-999', 'ETU-1234']);
  });
  it('counts the replacements', () => {
    expect(r.text(`ETU-${n} ETU-${n}`).replaced.get(lea.pseudonym)).toBe(2);
  });
  it('does not take a pseudonym inside a word', () => {
    expect(r.text(`XETU-${n} ETU-${n}9`).text).toBe(`XETU-${n} ETU-${n}9`);
  });
});
