/**
 * CAS-006: the computer algebra example — math cells, each followed by its
 * result computed in advance by SymPy (checked by `tests/cas.test.ts`), run
 * again with ▶ or ⏩.
 */
import type { TemplateLang } from './content';

/** The cells, the same in every language: LaTeX of a math field. */
export const CAS_CELLS = {
  exact: '\\frac{1}{3}+\\frac{1}{6}',
  simplify: '\\operatorname{simplify}\\left(\\frac{x^2-1}{x-1}\\right)',
  expand: '\\operatorname{expand}\\left(\\left(a+b\\right)^3\\right)',
  factor: '\\operatorname{factor}\\left(x^3-x\\right)',
  solve: '\\operatorname{solve}\\left(x^2-5x+6=0,x\\right)',
  define: 'f(x):=x^2e^{-x}',
  diff: '\\frac{\\mathrm{d}}{\\mathrm{d}x}\\left(f(x)\\right)',
  integrate: '\\int_0^{\\infty}f(x)\\,\\mathrm{d}x',
  limit: '\\lim_{x\\to0}\\frac{\\sin x}{x}',
  series: '\\operatorname{series}\\left(\\cos x,x,0,6\\right)',
  sum: '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}',
  matrix: '\\begin{pmatrix}2&1\\\\1&3\\end{pmatrix}^{-1}',
  numeric: '\\operatorname{N}\\left(\\sqrt{2}\\right)',
} as const;

export type CasCell = keyof typeof CAS_CELLS;

/** The results, as SymPy writes them. */
export const CAS_OUTPUTS: Record<CasCell, string> = {
  exact: '\\frac{1}{2}',
  simplify: 'x + 1',
  expand: 'a^{3} + 3 a^{2} b + 3 a b^{2} + b^{3}',
  factor: 'x \\left(x - 1\\right) \\left(x + 1\\right)',
  solve: '\\left[ 2, \\  3\\right]',
  define: 'f{\\left(x \\right)} = x^{2} e^{- x}',
  diff: '- x^{2} e^{- x} + 2 x e^{- x}',
  integrate: '2',
  limit: '1',
  series: '1 - \\frac{x^{2}}{2} + \\frac{x^{4}}{24} + O\\left(x^{6}\\right)',
  sum: '\\frac{\\pi^{2}}{6}',
  matrix: '\\left[\\begin{matrix}\\frac{3}{5} & - \\frac{1}{5}\\\\- \\frac{1}{5} & \\frac{2}{5}\\end{matrix}\\right]',
  numeric: '1.4142135623731',
};

interface Texts {
  title: string;
  intro: string;
  sections: [heading: string, text: string, cells: CasCell[]][];
  outro: string;
}

const TEXTS: Record<TemplateLang, Texts> = {
  en: {
    title: 'Computer algebra',
    intro:
      'Each **math cell** below holds an expression written in a math field, computed by **SymPy**. The results were computed in advance: press **⏩** to compute every cell again in your browser (the first run downloads Python and SymPy, then it works offline), or click a cell to change it — its dialog offers the operations (simplify, solve, integrate…) and shows the code sent to SymPy.',
    sections: [
      ['Exact arithmetic', 'Fractions stay exact.', ['exact']],
      ['Simplify, expand, factor', 'The operations of the dialog wrap the expression in their notation.', ['simplify', 'expand', 'factor']],
      ['Equations', 'Solving for a variable gives every solution.', ['solve']],
      ['Definitions', 'A name or a function defined with `:=` is known to the next cells, which run after it.', ['define', 'diff', 'integrate']],
      ['Limits, series and sums', '', ['limit', 'series', 'sum']],
      ['Matrices and numbers', 'A matrix written in the math field, and a numerical value.', ['matrix', 'numeric']],
    ],
    outro: 'Insert a math cell with **Insert → Math cell**, or by typing ```` ```math {run} ```` on an empty line. In a Markdown file, a math cell is a `math {run sympy}` fence followed by its result.',
  },
  fr: {
    title: 'Calcul formel',
    intro:
      'Chaque **cellule de calcul** ci-dessous contient une expression écrite dans un champ mathématique, calculée par **SymPy**. Les résultats ont été calculés à l’avance : appuyez sur **⏩** pour recalculer toutes les cellules dans votre navigateur (la première exécution télécharge Python et SymPy, ensuite tout fonctionne hors ligne), ou cliquez sur une cellule pour la modifier — sa boîte de dialogue propose les opérations (simplifier, résoudre, intégrer…) et montre le code envoyé à SymPy.',
    sections: [
      ['Calcul exact', 'Les fractions restent exactes.', ['exact']],
      ['Simplifier, développer, factoriser', 'Les opérations de la boîte de dialogue entourent l’expression de leur notation.', ['simplify', 'expand', 'factor']],
      ['Équations', 'Résoudre selon une variable donne toutes les solutions.', ['solve']],
      ['Définitions', 'Un nom ou une fonction défini avec `:=` est connu des cellules suivantes, qui s’exécutent après lui.', ['define', 'diff', 'integrate']],
      ['Limites, développements et sommes', '', ['limit', 'series', 'sum']],
      ['Matrices et nombres', 'Une matrice écrite dans le champ mathématique, et une valeur numérique.', ['matrix', 'numeric']],
    ],
    outro: 'Insérez une cellule de calcul avec **Insérer → Cellule de calcul**, ou en tapant ```` ```math {run} ```` sur une ligne vide. Dans un fichier Markdown, une cellule de calcul est un bloc `math {run sympy}` suivi de son résultat.',
  },
};

const fence = (body: string, info: string): string => `\`\`\`${info}\n${body}\n\`\`\``;

/** The example as Markdown: cells followed by their stored results (CAS-005). */
export function casMarkdown(lang: TemplateLang): string {
  const T = TEXTS[lang];
  const parts = [`# ${T.title}`, T.intro];
  for (const [heading, text, cells] of T.sections) {
    parts.push(`## ${heading}`);
    if (text) parts.push(text);
    for (const c of cells) {
      parts.push(fence(CAS_CELLS[c], 'math {run sympy}'));
      if (CAS_OUTPUTS[c]) parts.push(fence(CAS_OUTPUTS[c], 'math {output}'));
    }
  }
  parts.push(T.outro);
  return `${parts.join('\n\n')}\n`;
}
