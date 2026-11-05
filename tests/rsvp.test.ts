import { describe, expect, it } from 'vitest';
import { delay, frame, nextSentence, orp, sentenceOf, startAt, timeLeft, toWords } from '../src/rsvp/words';

// RSVP-001..RSVP-007: speed reading, one word at a time.

const words = toWords([
  { text: 'Speed reading', heading: true, at: 0 },
  { text: 'One word, then another. Extraordinarily long words wait!', at: 20 },
  { text: 'The end', at: 90 },
]);

describe('RSVP-003 the words and how long each is shown', () => {
  it('splits the text into words, a heading shown on its own', () => {
    expect(words.map((w) => w.text)).toEqual(['Speed reading', 'One', 'word,', 'then', 'another.', 'Extraordinarily', 'long', 'words', 'wait!', 'The', 'end']);
    expect(words[0]).toMatchObject({ heading: true, block: 0 });
    // Where each word is in its block, to put the cursor back there (RSVP-005).
    expect(words[2]).toMatchObject({ block: 1, at: 24 });
  });

  it('waits longer after a comma, a sentence, a paragraph, and on long words', () => {
    const base = 60000 / 300;
    expect(delay(words[1]!, 300)).toBe(base);
    expect(delay(words[2]!, 300)).toBe(base * 1.5);
    expect(delay(words[4]!, 300)).toBe(base * 2);
    expect(delay(words[8]!, 300)).toBe(base * 2.5);
    expect(delay(words[5]!, 300)).toBeGreaterThan(base);
    expect(delay(words[0]!, 300)).toBeGreaterThanOrEqual(base * 2.5);
  });
});

describe('RSVP-002 the recognition point', () => {
  it('is about a third into the word, punctuation aside', () => {
    expect(orp('a')).toBe(0);
    expect(orp('word')).toBe(1);
    expect(orp('reading')).toBe(2);
    expect(orp('Extraordinarily')).toBe(4);
    expect(orp('“word')).toBe(2);
  });
});

describe('RSVP-004 moving and time left', () => {
  it('goes to the next and previous sentence', () => {
    expect(nextSentence(words, 2, 1)).toBe(5);
    expect(nextSentence(words, 6, -1)).toBe(5);
    expect(nextSentence(words, 5, -1)).toBe(1);
    expect(nextSentence(words, 9, 1)).toBe(10);
  });

  it('gives the sentence around a word', () => {
    expect(sentenceOf(words, 3)).toBe('One word, then another.');
  });

  it('tells the time left from a word', () => {
    expect(timeLeft(words, 9, 300)).toBe(delay(words[9]!, 300) + delay(words[10]!, 300));
  });
});

describe('RSVP-001 starting from the cursor', () => {
  it('starts at the word under or after the cursor', () => {
    expect(startAt(words, 1, 26)).toBe(2);
    expect(startAt(words, 1, 0)).toBe(1);
    expect(startAt(words, 2, 94)).toBe(10);
  });
});

describe('RSVP-007 several words at a time', () => {
  it('shows 1 to 3 words, a heading always alone', () => {
    expect(frame(words, 1, 3).map((w) => w.text)).toEqual(['One', 'word,', 'then']);
    expect(frame(words, 0, 3).map((w) => w.text)).toEqual(['Speed reading']);
    // A frame ends with its block.
    expect(frame(words, 8, 3).map((w) => w.text)).toEqual(['wait!']);
  });
});
