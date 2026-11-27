import { describe, expect, it } from 'vitest';
import { entryNote, notesOf } from '../src/archive/entry';
import { detectFormat, isArchive } from '../src/core/format';
import { makeZip } from './helpers';

describe('FILE-033 a ZIP of Markdown notes is a folder, opened at its entry note', () => {
  it('opens a ZIP of several notes, or a vault with its hidden settings folder, as a folder', () => {
    const vault = makeZip({ 'R1.14/00-Accueil.md': '# Accueil', 'R1.14/Cours/01-Intro.md': '# Intro', 'R1.14/img/a.png': 'png' });
    expect(detectFormat('vault.zip', vault)).toBeNull();
    expect(isArchive(vault)).toBe(true);
    const vault2 = makeZip({ 'Notes/Seule.md': '# x', 'Notes/.notes-app/app.json': '{}' });
    expect(isArchive(vault2)).toBe(true);
  });
  it('MD-014 still imports a ZIP holding a single Markdown file as a document', () => {
    expect(detectFormat('note.zip', makeZip({ 'notes/readme.md': '# x', 'notes/img.png': 'png' }))).toBe('mdz');
  });
  it.each([
    [['R1.14-Fondamentaux-IA/00-Accueil.md', 'R1.14-Fondamentaux-IA/Cours/01.md', 'R1.14-Fondamentaux-IA/Cours/02.md'], 'R1.14-Fondamentaux-IA/00-Accueil.md'],
    [['index.md', 'README.md', 'a.md'], 'index.md'],
    [['README.md', 'Home.md', 'b/c.md'], 'README.md'],
    [['notes/Welcome.markdown', 'notes/x/y.md'], 'notes/Welcome.markdown'],
    [['Seule.md', 'dossier/a.md', 'dossier/b.md'], 'Seule.md'],
    [['a.md', 'b.md'], undefined],
    [['v/a.md', 'w/b.md'], undefined],
  ])('%j → %s', (paths, entry) => {
    expect(entryNote(paths)).toBe(entry);
  });
  it('leaves out hidden folders and junk', () => {
    expect(notesOf(['a.md', '.notes-app/x.md', '__MACOSX/a.md', 'v/.trash/b.md', 'c.txt'])).toEqual(['a.md']);
    expect(entryNote(['vault/.notes-app/workspace.json', 'vault/Home.md', 'vault/x/y.md'])).toBe('vault/Home.md');
  });
});
