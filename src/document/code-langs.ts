/**
 * Languages of code cells (CODE-001, CODE-020): those run in the browser,
 * and the others — shown in colour and written with completion, but run
 * elsewhere (a terminal, an IDE, a notebook). Their names, and the names
 * a Markdown fence may give them (`sh`, `ps1`, `jl`…).
 */

/** Run in the browser (CODE-001, CODE-018). */
export const RUN_LANGS = ['python', 'javascript', 'sql', 'r', 'lua', 'cpp', 'math'] as const;

/** CAS-001: a math cell, its source an equation of a math field, run by a computer algebra engine. */
export const MATH_LANG = 'math';

/** CAS-001: the engines of math cells. */
export type CasEngine = 'sympy';

/** Shown and edited only: the most used languages (TIOBE index), shells, and the usual formats. */
export const SHOW_LANGS = [
  'bash',
  'powershell',
  'julia',
  'java',
  'csharp',
  'typescript',
  'vb',
  'rust',
  'fortran',
  'go',
  'pascal',
  'php',
  'asm',
  'ada',
  'swift',
  'objc',
  'cobol',
  'kotlin',
  'scala',
  'dart',
  'ruby',
  'perl',
  'matlab',
  'haskell',
  'ocaml',
  'fsharp',
  'erlang',
  'clojure',
  'lisp',
  'scheme',
  'groovy',
  'tcl',
  'vhdl',
  'verilog',
  'modelica',
  'mathematica',
  'sas',
  'html',
  'css',
  'xml',
  'json',
  'yaml',
  'toml',
  'latex',
  'dockerfile',
  'cmake',
  'nginx',
  'protobuf',
  'diff',
] as const;

export type RunLang = (typeof RUN_LANGS)[number];
export type ShowLang = (typeof SHOW_LANGS)[number];

export const ALL_LANGS: readonly (RunLang | ShowLang)[] = [...RUN_LANGS, ...SHOW_LANGS];

export const LANG_LABEL: Record<RunLang | ShowLang, string> = {
  python: 'Python',
  javascript: 'JavaScript',
  sql: 'SQL',
  r: 'R',
  lua: 'Lua',
  cpp: 'C/C++',
  math: 'Math',
  bash: 'Bash',
  powershell: 'PowerShell',
  julia: 'Julia',
  java: 'Java',
  csharp: 'C#',
  typescript: 'TypeScript',
  vb: 'Visual Basic',
  rust: 'Rust',
  fortran: 'Fortran',
  go: 'Go',
  pascal: 'Pascal / Delphi',
  php: 'PHP',
  asm: 'Assembly',
  ada: 'Ada',
  swift: 'Swift',
  objc: 'Objective-C',
  cobol: 'COBOL',
  kotlin: 'Kotlin',
  scala: 'Scala',
  dart: 'Dart',
  ruby: 'Ruby',
  perl: 'Perl',
  matlab: 'MATLAB / Octave',
  haskell: 'Haskell',
  ocaml: 'OCaml',
  fsharp: 'F#',
  erlang: 'Erlang',
  clojure: 'Clojure',
  lisp: 'Common Lisp',
  scheme: 'Scheme',
  groovy: 'Groovy',
  tcl: 'Tcl',
  vhdl: 'VHDL',
  verilog: 'Verilog',
  modelica: 'Modelica',
  mathematica: 'Mathematica',
  sas: 'SAS',
  html: 'HTML',
  css: 'CSS',
  xml: 'XML',
  json: 'JSON',
  yaml: 'YAML',
  toml: 'TOML',
  latex: 'LaTeX',
  dockerfile: 'Dockerfile',
  cmake: 'CMake',
  nginx: 'nginx',
  protobuf: 'Protocol Buffers',
  diff: 'Diff',
};

/** Other names of a language in Markdown fences (lower case). */
const ALIASES: Partial<Record<RunLang | ShowLang, string[]>> = {
  python: ['py', 'python3'],
  javascript: ['js', 'mjs'],
  cpp: ['c', 'c++', 'cc', 'cxx', 'h', 'hpp'],
  bash: ['sh', 'shell', 'zsh', 'console', 'shellscript'],
  powershell: ['ps1', 'pwsh', 'ps'],
  julia: ['jl'],
  csharp: ['cs', 'c#'],
  typescript: ['ts', 'tsx'],
  vb: ['vbnet', 'vb.net', 'visualbasic', 'vba', 'vbscript'],
  rust: ['rs'],
  fortran: ['f90', 'f95', 'f03', 'f'],
  go: ['golang'],
  pascal: ['delphi', 'pas', 'objectpascal'],
  asm: ['assembly', 'nasm', 's', 'gas', 'x86asm', 'armasm'],
  ada: ['adb', 'ads'],
  objc: ['objective-c', 'objectivec'],
  cobol: ['cbl', 'cob'],
  kotlin: ['kt', 'kts'],
  ruby: ['rb'],
  perl: ['pl'],
  matlab: ['octave'],
  haskell: ['hs'],
  ocaml: ['ml'],
  fsharp: ['fs', 'f#'],
  erlang: ['erl'],
  clojure: ['clj', 'cljs'],
  lisp: ['commonlisp', 'cl', 'elisp', 'emacs-lisp'],
  scheme: ['racket', 'scm'],
  verilog: ['systemverilog', 'sv'],
  mathematica: ['wolfram', 'wl'],
  html: ['htm', 'xhtml'],
  xml: ['svg', 'xsl'],
  json: ['jsonc', 'json5'],
  yaml: ['yml'],
  latex: ['tex'],
  dockerfile: ['docker'],
  protobuf: ['proto'],
  diff: ['patch'],
};

/** A fence's language name (`py`, `sh`, `PowerShell`…) → the cell language. */
export const CELL_LANGS: Record<string, RunLang | ShowLang> = Object.fromEntries(
  ALL_LANGS.flatMap((lang) => [[lang, lang] as const, ...(ALIASES[lang] ?? []).map((alias) => [alias, lang] as const)]),
);

export const isRunLang = (lang: string): lang is RunLang => (RUN_LANGS as readonly string[]).includes(lang);
export const isCellLang = (lang: string): lang is RunLang | ShowLang => (ALL_LANGS as readonly string[]).includes(lang);
