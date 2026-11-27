import { describe, expect, it } from 'vitest';
import { applyMatches, commonFromCorpus, corpusStats, createDetector, type Person, type TextUnit } from '../src/pseudo/engine';
import { fold, nameTokens } from '../src/pseudo/normalize';
import { PEOPLE_WITH_PSEUDONYMS } from './pseudo-fixtures';

const people: Person[] = PEOPLE_WITH_PSEUDONYMS;
const ps = (key: string): string => people.find((p) => p.key === key)!.pseudonym;

const unit = (text: string, extra: Partial<TextUnit> = {}): TextUnit => ({ text, where: 'test', role: 'body', ...extra });

function run(texts: string | string[], opts: Parameters<typeof createDetector>[0] extends infer C ? Partial<C> : never = {}, fileName?: string) {
  const units = (Array.isArray(texts) ? texts : [texts]).map((t) => unit(t));
  const d = createDetector({ people, ...opts });
  const r = d.scan(units, { fileName });
  const out = units.map((u, i) => applyMatches(u.text, r.matches.filter((m) => m.unit === i)));
  return { ...r, out, detector: d };
}

describe('PSEUDO-006 folding keeps the positions of the original', () => {
  it('folds case, accents, apostrophes, hyphens and spaces', () => {
    expect(fold('Maëlle LE GALL — D’Alembert\u00a0x').text).toBe("maelle le gall - d'alembert x");
    expect(nameTokens("Jean-Pierre D'Alembert")).toEqual(['jean', 'pierre', 'd', 'alembert']);
  });
  it('maps a decomposed text back to its original positions', () => {
    const s = 'Lefe\u0300vre!';
    const f = fold(s);
    expect(f.text).toBe('lefevre!');
    expect(f.map[f.text.indexOf('!')]).toBe(s.indexOf('!'));
  });
});

describe('PSEUDO-006 forms of a name', () => {
  it.each([
    ['Léa Martin', 'lea'],
    ['MARTIN Léa', 'lea'],
    ['Martin, Léa', 'lea'],
    ['L. Martin', 'lea'],
    ['Martin L.', 'lea'],
    ['Jean-Pierre D’Alembert', 'jp'],
    ['J.-P. D\'Alembert', 'jp'],
    ['JP D\'Alembert', 'jp'],
    ['Maëlle Le Gall', 'maelle'],
    ['Maelle LEGALL', 'maelle'],
    ['Anaïs Lefèvre', 'anais'],
  ])('%s', (text, key) => {
    expect(run(`Texte de ${text} ici.`).out[0]).toBe(`Texte de ${ps(key)} ici.`);
  });
  it('finds a decomposed name (NFD document, NFC list) and keeps the rest decomposed', () => {
    const text = 'Relu par Ana\u0131\u0308s Lefe\u0300vre, re\u0301sultat.'.replace('\u0131', 'i');
    const { out } = run(text);
    expect(out[0]).toBe(`Relu par ${ps('anais')}, re\u0301sultat.`);
  });
  it('finds a name of an NFD list in an NFC document', () => {
    const nfdPeople = people.map((p) => ({ ...p, lastName: p.lastName.normalize('NFD'), firstName: p.firstName.normalize('NFD') }));
    const d = createDetector({ people: nfdPeople });
    const r = d.scan([unit('Relu par Anaïs Lefèvre.')]);
    expect(applyMatches('Relu par Anaïs Lefèvre.', r.matches)).toBe(`Relu par ${ps('anais')}.`);
  });
  it('replaces a last name alone only when it is written with a capital', () => {
    expect(run('Lefèvre a mesuré.').out[0]).toBe(`${ps('anais')} a mesuré.`);
    expect(run('Option off', { lastNameAlone: false }).out[0]).toBe('Option off');
    expect(run('Lefèvre seul', { lastNameAlone: false }).out[0]).toBe('Lefèvre seul');
  });
});

describe('PSEUDO-007 identifiers', () => {
  it('replaces e-mails, phones, INE, numbers and user names in paths', () => {
    const { out, attribution } = run('lea.martin@etu.example.org, 06 39 98 00 01, +33 6 39 98 00 02, INE 0123456789A, n° 21900101, C:\\Users\\hmartin\\x.docx, /home/hmartin/a');
    expect(out[0]).toBe('[COURRIEL], [TÉLÉPHONE], [TÉLÉPHONE], INE [INE], n° [NUMÉRO], C:\\Users\\[UTILISATEUR]\\x.docx, /home/[UTILISATEUR]/a');
    expect(attribution.people[0]?.key).toBe('lea');
  });
});

describe('PSEUDO-008 labelled values', () => {
  it('replaces a value after a label, even when it is not in the list', () => {
    expect(run('Nom : Paul Dupuis').out[0]).toBe('Nom : [NOM]');
    expect(run('Binôme : Théo Petit et Paul Dupuis').out[0]).toBe(`Binôme : ${ps('theo')} et [NOM]`);
    expect(run('Nom : MARTIN, Léa').out[0]).toBe(`Nom : ${ps('lea')}`);
    expect(run('Présenté par Maëlle Le Gall').out[0]).toBe(`Présenté par ${ps('maelle')}`);
  });
  it('stops a labelled value at a tab, a line end and the sixth word', () => {
    expect(run("Nom : Chloé Masse\tSujet : calcul de la masse d'une poutre").out[0]).toBe(`Nom : ${ps('chloe')}\tSujet : calcul de la masse d'une poutre`);
    expect(run('Nom : Paul Dupuis\nLa Masse Volumique').out[0]).toBe('Nom : [NOM]\nLa Masse Volumique');
    expect(run('Nom : A B C D E F G H').out[0]).toBe('Nom : [NOM] G H');
  });
  it('does not take particles or lower-case words for names', () => {
    expect(run('Fait par la machine.').out[0]).toBe('Fait par la machine.');
    expect(run('Nom : de la masse').out[0]).toBe('Nom : de la masse');
    expect(run('Nom : Jean de La Fontaine').out[0]).toBe('Nom : [NOM]');
  });
  it('does not replace a value that does not look like names, and lists it to check', () => {
    const r = run('Nom : masse volumique ρ = 7850 kg/m³');
    expect(r.out[0]).toBe('Nom : masse volumique ρ = 7850 kg/m³');
    expect(r.checks).toHaveLength(1);
    expect(run('Nom :\tmasse volumique').out[0]).toBe('Nom :\tmasse volumique');
  });
  it('takes the cell to the right of a label, or the column below a header row', () => {
    const d = createDetector({ people });
    const cells: TextUnit[] = [
      unit('Nom', { cell: { table: 't', row: 0, col: 0 } }),
      unit('Martin Léa', { cell: { table: 't', row: 0, col: 1 } }),
      unit('Binôme :', { cell: { table: 't', row: 1, col: 0 } }),
      unit('Théo Petit', { cell: { table: 't', row: 1, col: 1 } }),
      unit('Rédigé par', { cell: { table: 'u', row: 0, col: 0 } }),
      unit('Inès Blanc', { cell: { table: 'u', row: 1, col: 0 } }),
      unit('Nom', { cell: { table: 'v', row: 0, col: 0 } }),
      unit('Note', { cell: { table: 'v', row: 0, col: 1 } }),
      unit('Paul Dupuis', { cell: { table: 'v', row: 1, col: 0 } }),
      unit('15', { cell: { table: 'v', row: 1, col: 1 } }),
      unit('masse', { cell: { table: 'v', row: 2, col: 0 } }),
    ];
    const r = d.scan(cells);
    const out = cells.map((u, i) => applyMatches(u.text, r.matches.filter((m) => m.unit === i)));
    expect(out).toEqual(['Nom', ps('lea'), 'Binôme :', ps('theo'), 'Rédigé par', ps('ines'), 'Nom', 'Note', '[NOM]', '15', 'masse']);
  });
});

describe('PSEUDO-009 first names alone (option)', () => {
  it('is off by default, and on replaces unique first names only', () => {
    expect(run('Merci Léa et Noé.').out[0]).toBe('Merci Léa et Noé.');
    expect(run('Merci Léa et Noé.', { firstNameAlone: true }).out[0]).toBe(`Merci ${ps('lea')} et Noé.`);
  });
});

describe('PSEUDO-010 exclusions', () => {
  it('keeps the names of scientists alone, replaces them in full names', () => {
    const r = run('Pascal Young a mesuré le module de Young et la loi de Poisson, 100 Pa (pascal).');
    expect(r.out[0]).toBe(`${ps('pascal')} a mesuré le module de Young et la loi de Poisson, 100 Pa (pascal).`);
    expect(r.detector.notes.find((n) => n.kind === 'excluded')?.people).toEqual(expect.arrayContaining(['pascal', 'zoe', 'jp']));
  });
  it('takes names added by the user', () => {
    expect(run('Lefèvre', { exclusions: ['Lefèvre'] }).out[0]).toBe('Lefèvre');
  });
});

describe('PSEUDO-011 names that are common words', () => {
  it('keeps "la masse vaut 2 kg" and does not attribute on it', () => {
    const r = run(['La masse vaut 2 kg.', 'Masse est grande.', 'Chloé Masse a pesé.']);
    expect(r.out).toEqual(['La masse vaut 2 kg.', 'Masse est grande.', `${ps('chloe')} a pesé.`]);
    expect(run(['La Masse vaut 2 kg.', 'Masse']).attribution.status).toBe('none');
    expect(r.detector.notes.find((n) => n.kind === 'common-word')?.people).toEqual(expect.arrayContaining(['chloe', 'theo', 'ines', 'noem', 'lucas']));
  });
  it('learns common words from the documents (lower-case uses)', () => {
    const stats = corpusStats(['la lefèvre est un outil'], people);
    expect(commonFromCorpus(stats, people)).toEqual(['Lefèvre']);
    expect(run('Lefèvre seul', { commonWords: commonFromCorpus(stats, people) }).out[0]).toBe('Lefèvre seul');
  });
});

describe('PSEUDO-012 short last names', () => {
  it('matches "Wei Li" and warns, never "Li" alone', () => {
    const r = run('Wei Li, une batterie Li-ion, Minh Ng et Awa Ba.');
    expect(r.out[0]).toBe(`${ps('wei')}, une batterie Li-ion, ${ps('minh')} et ${ps('awa')}.`);
    expect(r.detector.notes.find((n) => n.kind === 'short')?.people).toEqual(['wei', 'minh', 'awa']);
  });
});

describe('PSEUDO-013 shared names', () => {
  it('replaces a shared last name alone by a common marker, without attribution', () => {
    const r = run('Martin a écrit, Léa Martin aussi.');
    expect(r.out[0]).toBe(`[PERSONNE] a écrit, ${ps('lea')} aussi.`);
    expect(r.detector.notes.find((n) => n.kind === 'shared-last')?.people).toEqual(['lea', 'hugo']);
  });
});

describe('PSEUDO-014 attribution over the whole document', () => {
  it('attributes a document whose name appears once in the header and once in the body', () => {
    const d = createDetector({ people });
    const r = d.scan([unit('Anaïs Lefèvre — TP3', { role: 'header' }), unit('Texte'), unit('Relu par Anaïs Lefèvre.')]);
    expect(r.attribution.status).toBe('single');
    expect(r.attribution.people[0]?.key).toBe('anais');
  });
  it('uses the file name and labels, and names a group', () => {
    const d = createDetector({ people });
    const r = d.scan([unit('Nom : Théo Petit'), unit('Binôme : Inès Blanc')], { fileName: 'tp3_petit_theo.docx' });
    expect(r.attribution.status).toBe('group');
    expect(r.attribution.people.map((p) => p.key)).toEqual(['theo', 'ines']);
  });
  it('says none when nobody is found', () => {
    expect(run('Rien ici.').attribution.status).toBe('none');
  });
  it('replaces an author field by the pseudonym, or empties it', () => {
    const d = createDetector({ people });
    const units = [unit('Hugo Martin', { role: 'author' }), unit('Paul Dupuis', { role: 'author' })];
    const r = d.scan(units);
    expect(units.map((u, i) => applyMatches(u.text, r.matches.filter((m) => m.unit === i)))).toEqual([ps('hugo'), '']);
  });
  it('counts text already shaped like a pseudonym', () => {
    expect(run('la référence ETU-123 du catalogue').pseudonymLike).toBe(1);
  });
});
