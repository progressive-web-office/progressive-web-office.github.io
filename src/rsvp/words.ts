/**
 * RSVP-001..RSVP-007: speed reading — the text cut into words, each shown for
 * a time that depends on the speed, its punctuation and its length, aligned
 * on its recognition point.
 */

/** A paragraph or a heading; `at`: where its text starts (a position of the document, or 0). */
export interface Block {
  text: string;
  heading?: boolean;
  at: number;
}

export interface Word {
  text: string;
  /** Its block, and where it is: `at` of the block plus its place in the text. */
  block: number;
  at: number;
  sentence: number;
  heading?: boolean;
  /** Times the time of a word (RSVP-003). */
  factor: number;
}

const END = /[.!?…]["'”’»)\]]*$/;
const PAUSE = /[,;:—–]["'”’»)\]]*$/;
const LEAD = /^[^\p{L}\p{N}]*/u;

export function toWords(blocks: Block[]): Word[] {
  const out: Word[] = [];
  let sentence = 0;
  blocks.forEach((b, block) => {
    if (b.heading) {
      // RSVP-003: a heading on its own, before its section.
      const text = b.text.replace(/\s+/g, ' ').trim();
      if (!text) return;
      out.push({ text, block, at: b.at + (b.text.length - b.text.trimStart().length), sentence: sentence++, heading: true, factor: 2.5 + 0.25 * text.split(' ').length });
      return;
    }
    const first = out.length;
    for (const m of b.text.matchAll(/[^\s￼]+/g)) {
      const text = m[0];
      const letters = text.replace(/[^\p{L}\p{N}]/gu, '').length;
      const factor = (END.test(text) ? 2 : PAUSE.test(text) ? 1.5 : 1) * (letters > 8 ? 1.3 : 1);
      out.push({ text, block, at: b.at + m.index, sentence, factor });
      if (END.test(text)) sentence++;
    }
    if (out.length > first) {
      // The end of a paragraph.
      const last = out[out.length - 1]!;
      last.factor = Math.max(last.factor, 2.5);
      if (!END.test(last.text)) sentence++;
    }
  });
  return out;
}

/** How long a word is shown, in milliseconds. */
export function delay(w: Word, wpm: number): number {
  return (60000 / wpm) * w.factor;
}

/** RSVP-002: the letter the eye fixes — about a third into the word, leading punctuation aside. */
export function orp(word: string): number {
  const lead = LEAD.exec(word)?.[0].length ?? 0;
  const n = word.length - lead;
  return lead + (n <= 1 ? 0 : n <= 5 ? 1 : n <= 9 ? 2 : n <= 13 ? 3 : 4);
}

/** RSVP-004: the first word of the next (1) or of this or the previous (-1) sentence. */
export function nextSentence(words: Word[], i: number, dir: 1 | -1): number {
  const s = words[i]?.sentence ?? 0;
  if (dir === 1) {
    const j = words.findIndex((w, k) => k > i && w.sentence > s);
    return j < 0 ? words.length - 1 : j;
  }
  const start = words.findIndex((w) => w.sentence === s);
  if (start < i) return start;
  const prev = words[start - 1]?.sentence;
  return prev === undefined ? 0 : words.findIndex((w) => w.sentence === prev);
}

export function sentenceOf(words: Word[], i: number): string {
  const s = words[i]?.sentence;
  return words.filter((w) => w.sentence === s).map((w) => w.text).join(' ');
}

export function timeLeft(words: Word[], i: number, wpm: number): number {
  return words.slice(i).reduce((sum, w) => sum + delay(w, wpm), 0);
}

/** RSVP-001: the word under or after a place of a block. */
export function startAt(words: Word[], block: number, at: number): number {
  const i = words.findIndex((w) => w.block > block || (w.block === block && w.at + w.text.length > at));
  return i < 0 ? 0 : i;
}

/** RSVP-007: the words shown together from `i`: up to `n`, a heading alone, never past a sentence or a block. */
export function frame(words: Word[], i: number, n: number): Word[] {
  const first = words[i];
  if (!first) return [];
  const out = [first];
  if (first.heading) return out;
  for (let k = i + 1; out.length < n && k < words.length; k++) {
    const prev = words[k - 1]!;
    const w = words[k]!;
    if (w.heading || w.block !== prev.block || w.sentence !== prev.sentence) break;
    out.push(w);
  }
  return out;
}
