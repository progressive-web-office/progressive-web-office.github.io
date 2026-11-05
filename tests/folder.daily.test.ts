import { beforeEach, describe, expect, it } from 'vitest';
import { dailyPath, dailyText, dateOfNote, DEFAULT_DAILY, DEFAULT_DAILY_TEMPLATE, fillTemplate, formatDate, isoWeek, loadDailySettings, saveDailySettings } from '../src/folder/daily';

// FOLDER-027: daily notes.

const day = new Date(2026, 9, 4, 9, 5); // Sunday 4 October 2026, 09:05

describe('FOLDER-027 daily notes', () => {
  beforeEach(() => localStorage.clear());

  it('writes a date in a format', () => {
    expect(formatDate(day, 'YYYY-MM-DD')).toBe('2026-10-04');
    expect(formatDate(day, 'YY/M/D')).toBe('26/10/4');
    expect(formatDate(day, 'YYYY/MM/YYYY-MM-DD')).toBe('2026/10/2026-10-04');
    expect(formatDate(day, 'dddd D MMMM YYYY', 'fr')).toBe('dimanche 4 octobre 2026');
    expect(formatDate(day, '[Week] ww, HH:mm')).toBe('Week 40, 09:05');
    expect(isoWeek(new Date(2027, 0, 1))).toBe(53);
  });

  it('names the note of a day, in its folder, a / making sub-folders', () => {
    // A folder per year and month, by default.
    expect(dailyPath(day, DEFAULT_DAILY)).toBe('Daily notes/2026/10/2026-10-04.md');
    expect(dailyPath(day, { ...DEFAULT_DAILY, folder: '' })).toBe('2026/10/2026-10-04.md');
    expect(dailyPath(day, { ...DEFAULT_DAILY, format: 'YYYY-MM-DD' })).toBe('Daily notes/2026-10-04.md');
    expect(dailyPath(day, { ...DEFAULT_DAILY, folder: '/Journal/', format: 'YYYY/MM/YYYY-MM-DD' })).toBe('Journal/2026/10/2026-10-04.md');
  });

  it('finds the day of a note again by its name', () => {
    expect(dateOfNote('Daily notes/2026/10/2026-10-04.md', DEFAULT_DAILY)).toBe('2026-10-04');
    expect(dateOfNote('Daily notes/2026-10-04.md', DEFAULT_DAILY)).toBeUndefined();
    expect(dateOfNote('2026-10-04.md', { ...DEFAULT_DAILY, folder: '', format: 'YYYY-MM-DD' })).toBe('2026-10-04');
    expect(dateOfNote('notes/2026/10/2026-10-04.md', DEFAULT_DAILY)).toBeUndefined();
    expect(dateOfNote('Daily notes/2026/10/Project.md', DEFAULT_DAILY)).toBeUndefined();
    expect(dateOfNote('Daily notes/2026/02/2026-02-30.md', DEFAULT_DAILY)).toBeUndefined();
    const journal = { ...DEFAULT_DAILY, folder: 'Journal', format: 'YYYY/MM/[Day] DD.MM.YYYY' };
    expect(dateOfNote(dailyPath(day, journal), journal)).toBe('2026-10-04');
    const named = { ...DEFAULT_DAILY, format: 'dddd D MMMM YYYY' };
    expect(dateOfNote('dimanche 4 octobre 2026.md', named)).toBeUndefined(); // no month number: not a day it can read
    expect(dateOfNote('4.10.26.md', { ...DEFAULT_DAILY, folder: '', format: 'D.M.YY' })).toBe('2026-10-04');
  });

  it('fills the template of a new daily note', () => {
    expect(fillTemplate('---\ndate: {{date:YYYY-MM-DD}}\n---\n# {{title}}\n\nAt {{time}}', day, '2026-10-04', DEFAULT_DAILY)).toMatch(/^---\ndate: 2026-10-04\n---\n# 2026-10-04\n\nAt \d\d:\d\d$/);
    // Without a template: the properties built in, the day and the year filled.
    const text = dailyText(day, DEFAULT_DAILY, undefined, 'en'); // the language pinned: the default follows the machine's
    expect(text).toMatch(/^---\ndate: 2026-10-04\ntimestamp: "2026-10-04T\d\d:\d\d"\nyear: "\[\[2026\]\]"\nMOC:\ntype: "\[\[Daily note\]\]"\ntitle:\ndescription:\ntags:\n {2}- "#daily"\nsee also:\npreviously:\nevents:\nreferences:\nsubsequently:\n---\n\n# Sunday, October 4, 2026\n\n$/);
    // The title: the date in the words of the language and region, or by a format.
    expect(dailyText(day, { ...DEFAULT_DAILY, heading: 'long' }, '# {{heading}}', 'fr')).toBe('# 4 octobre 2026');
    expect(dailyText(day, DEFAULT_DAILY, '# {{heading}}', 'fr')).toBe('# Dimanche 4 octobre 2026');
    expect(dailyText(day, { ...DEFAULT_DAILY, heading: 'dddd D MMMM' }, '# {{heading}}', 'fr')).toBe('# dimanche 4 octobre');
    expect(dailyText(day, DEFAULT_DAILY, '# {{heading:YYYY-MM-DD}}')).toBe('# 2026-10-04');
    expect(DEFAULT_DAILY_TEMPLATE).toContain('{{date:YYYY}}');
    expect(dailyText(day, DEFAULT_DAILY, '# {{ date }}')).toBe('# 2026-10-04');
  });

  it('keeps its settings', () => {
    expect(loadDailySettings()).toEqual(DEFAULT_DAILY);
    saveDailySettings({ format: 'DD.MM.YYYY', folder: ' Journal/ ', template: 'Templates/Day.md', heading: 'long' });
    expect(loadDailySettings()).toEqual({ format: 'DD.MM.YYYY', folder: 'Journal', template: 'Templates/Day.md', heading: 'long' });
    // The root of the folder, when chosen, stays the root.
    saveDailySettings({ ...DEFAULT_DAILY, folder: '' });
    expect(loadDailySettings().folder).toBe('');
  });
});
