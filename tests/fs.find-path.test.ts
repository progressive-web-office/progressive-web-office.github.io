import { describe, expect, it } from 'vitest';
import { findPath, nearestPath } from '../src/fs/path';

const FILES = [
  'Course/Map.canvas',
  'Course/Sessions/S1 sheet.md',
  'Course/Sessions/S2 sheet.md',
  'Course/Pictures/plan.png',
  'Course/Index.md',
  'Other/Sessions/S1 sheet.md',
  'Other/plan.png',
  'Top.md',
];

describe('FOLDER-033 a path named by a file, found in the folder', () => {
  it('takes first the path relative to the file that names it', () => {
    expect(findPath('Sessions/S1 sheet.md', 'Course/Map.canvas', FILES)).toBe('Course/Sessions/S1 sheet.md');
    expect(findPath('../Top.md', 'Course/Index.md', FILES)).toBe('Top.md');
    expect(findPath('./Index.md', 'Course/Map.canvas', FILES)).toBe('Course/Index.md');
  });

  it('then the path from the root of the folder', () => {
    expect(findPath('Other/plan.png', 'Course/Index.md', FILES)).toBe('Other/plan.png');
    expect(findPath('/Top.md', 'Course/Index.md', FILES)).toBe('Top.md');
  });

  it('then a file whose path ends with it — a path from the root of notes held in a folder of the archive', () => {
    expect(findPath('Sessions/S2 sheet.md', 'Other/x.md', FILES)).toBe('Course/Sessions/S2 sheet.md');
    // Two candidates: the nearest to the file naming it.
    expect(findPath('Sessions/S1 sheet.md', 'Other/notes/a.md', FILES)).toBe('Other/Sessions/S1 sheet.md');
  });

  it('then a file of the same name, the nearest', () => {
    expect(findPath('S1 sheet.md', 'Course/Map.canvas', FILES)).toBe('Course/Sessions/S1 sheet.md');
    expect(findPath('plan.png', 'Other/z.md', FILES)).toBe('Other/plan.png');
    expect(findPath('plan.png', 'Course/Index.md', FILES)).toBe('Course/Pictures/plan.png');
  });

  it('compares without case, decodes encoded names, adds the extensions given, and says when nothing is found', () => {
    expect(findPath('sessions/s1 SHEET.md', 'Course/Map.canvas', FILES)).toBe('Course/Sessions/S1 sheet.md');
    expect(findPath('S1%20sheet.md', 'Course/Map.canvas', FILES)).toBe('Course/Sessions/S1 sheet.md');
    expect(findPath('S2 sheet', 'Course/Map.canvas', FILES, ['.md'])).toBe('Course/Sessions/S2 sheet.md');
    expect(findPath('Nowhere.md', 'Course/Map.canvas', FILES)).toBeUndefined();
    expect(findPath('', 'Course/Map.canvas', FILES)).toBeUndefined();
  });
});

describe('FOLDER-033 of several notes of one name, the nearest', () => {
  it('prefers the folder of the note, then the most folders in common, then the shallowest', () => {
    const notes = ['Plan.md', 'A/Plan.md', 'A/B/Plan.md', 'C/D/Plan.md'];
    expect(nearestPath(notes, 'A/x.md')).toBe('A/Plan.md');
    expect(nearestPath(notes, 'A/B/C/x.md')).toBe('A/B/Plan.md');
    expect(nearestPath(notes, 'C/D/E/x.md')).toBe('C/D/Plan.md');
    expect(nearestPath(notes, 'Z/x.md')).toBe('Plan.md');
  });
});
