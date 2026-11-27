import { describe, expect, it } from 'vitest';
import { highlightCode } from '@lezer/highlight';
import { readMarkdown } from '../src/document/markdown-reader';
import { writeMarkdown } from '../src/document/markdown-writer';
import { blocksToDom, domToBlocks } from '../src/document/html';
import { ALL_LANGS, CELL_LANGS, isRunLang, LANG_LABEL, RUN_LANGS, SHOW_LANGS } from '../src/document/code-langs';
import { cellLanguage, highlighter } from '../src/code/highlight';
import { wordSources } from '../src/code/lang-words';
import type { CodeCellRun, CodeLang } from '../src/document/model';

// CODE-020: code cells in any language — run in the browser, or shown in colour and written with completion.

const cellsOf = (md: string): CodeCellRun[] =>
  readMarkdown(md).blocks.flatMap((b) => (b.type === 'paragraph' ? b.runs.filter((r): r is CodeCellRun => 'cell' in r) : []));

/** The token classes of some code, as the cells show it. */
async function classes(lang: CodeLang, code: string): Promise<Set<string>> {
  const language = await cellLanguage(lang);
  const out = new Set<string>();
  highlightCode(code, language.parser.parse(code), highlighter, (_text, cls) => cls && out.add(cls), () => undefined);
  return out;
}

describe('CODE-020 languages of code cells', () => {
  it('knows the languages run here, and those shown only, with their names and usual aliases', () => {
    expect(RUN_LANGS).toEqual(['python', 'javascript', 'sql', 'r', 'lua', 'cpp', 'math']);
    expect(SHOW_LANGS).toEqual(expect.arrayContaining(['bash', 'powershell', 'julia', 'java', 'csharp', 'vb', 'rust', 'fortran', 'go', 'pascal', 'php', 'asm', 'ada', 'swift', 'objc', 'cobol']));
    for (const lang of ALL_LANGS) expect(LANG_LABEL[lang], lang).toBeTruthy();
    expect(new Set(ALL_LANGS).size).toBe(ALL_LANGS.length);
    expect([CELL_LANGS.sh, CELL_LANGS.zsh, CELL_LANGS.ps1, CELL_LANGS.pwsh, CELL_LANGS.jl, CELL_LANGS.cs, CELL_LANGS['c#'], CELL_LANGS.delphi, CELL_LANGS.py, CELL_LANGS.c]).toEqual(['bash', 'bash', 'powershell', 'powershell', 'julia', 'csharp', 'csharp', 'pascal', 'python', 'cpp']);
    expect(isRunLang('python')).toBe(true);
    expect(isRunLang('bash')).toBe(false);
  });

  it('colours the code of every language', async () => {
    for (const lang of ALL_LANGS) {
      const language = await cellLanguage(lang);
      expect(language.parser, lang).toBeTruthy();
    }
    expect(await classes('bash', '# list\nfor f in *.md; do echo "$f"; done')).toEqual(new Set(['tok-comment', 'tok-keyword', 'tok-string']));
    expect(await classes('powershell', '# list\nGet-ChildItem | Where-Object { $_.Length -gt 1kb }')).toContain('tok-comment');
    expect([...(await classes('julia', 'function f(x)\n  "two" # double\nend'))]).toEqual(expect.arrayContaining(['tok-keyword', 'tok-string', 'tok-comment']));
    expect([...(await classes('ada', 'procedure Hello is -- greet\nbegin\n   Put_Line ("Hello"); X := 16#FF#;\nend Hello;'))]).toEqual(expect.arrayContaining(['tok-keyword', 'tok-comment', 'tok-string', 'tok-number']));
    expect([...(await classes('java', 'class A { int x = 1; // one\n}'))]).toEqual(expect.arrayContaining(['tok-keyword', 'tok-comment', 'tok-number']));
  });

  it('completes with the words of the language, else those of the code', () => {
    expect(wordSources('bash')).toHaveLength(2);
    expect(wordSources('powershell')).toHaveLength(2);
    expect(wordSources('julia')).toHaveLength(2);
    expect(wordSources('toml')).toHaveLength(1);
    expect(wordSources('bash')).toBe(wordSources('bash'));
  });

  it('reads and writes a cell shown only as a {cell} fence, a cell run here staying {run}', () => {
    const cells = cellsOf('```sh {cell}\nls -la\n```\n\n```PowerShell {cell hide}\nGet-Date\n```\n\n```python {run}\nprint(1)\n```\n\n```julia {run}\nx = 1\n```\n\n```bash\nplain block\n```\n');
    expect(cells.map((c) => [c.lang, c.cell, !!c.hidden])).toEqual([
      ['bash', 'ls -la', false],
      ['powershell', 'Get-Date', true],
      ['python', 'print(1)', false],
      ['julia', 'x = 1', false],
    ]);
    const md = writeMarkdown(readMarkdown('```sh {cell}\nls -la\n```\n\n```ps1 {run}\nGet-Date\n```\n\n```py {run}\nprint(1)\n```\n'));
    expect(md).toContain('```bash {cell}\nls -la\n```');
    expect(md).toContain('```powershell {cell}\nGet-Date\n```');
    expect(md).toContain('```python {run}\nprint(1)\n```');
    expect(writeMarkdown(readMarkdown('```julia {run}\nx = 1\n```\n'))).toContain('```julia {run}');
  });

  it('keeps the language of a cell shown only through the editor', () => {
    const blocks = readMarkdown('```rust {cell}\nfn main() {}\n```\n').blocks;
    const div = document.createElement('div');
    div.append(blocksToDom(blocks, document, () => undefined));
    const back = domToBlocks(div, () => undefined);
    expect(back.flatMap((b) => (b.type === 'paragraph' ? b.runs : []))).toEqual([expect.objectContaining({ cell: 'fn main() {}', lang: 'rust' })]);
  });
});
