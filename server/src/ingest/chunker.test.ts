import { describe, expect, it } from 'vitest';
import { chunkText } from './chunker.js';

const options = { maxChars: 200, overlapChars: 40 };

describe('chunkText', () => {
  it('returns no chunks for empty or whitespace-only input', () => {
    expect(chunkText('', options)).toEqual([]);
    expect(chunkText('   \n\n  ', options)).toEqual([]);
  });

  it('keeps short text as a single chunk', () => {
    expect(chunkText('A short note.', options)).toEqual(['A short note.']);
  });

  it('never produces a chunk longer than maxChars', () => {
    const longParagraph = 'word '.repeat(300).trim();
    const chunks = chunkText(longParagraph, options);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(options.maxChars);
    }
  });

  it('packs small paragraphs together and splits at paragraph boundaries', () => {
    const text = ['First paragraph.', 'Second paragraph.', 'Third paragraph.'].join('\n\n');
    // "First paragraph.\n\nSecond paragraph." is 35 chars, so with maxChars 30 it must split.
    const chunks = chunkText(text, { maxChars: 30, overlapChars: 0 });
    expect(chunks[0]).toBe('First paragraph.');
    expect(chunks[1]).toBe('Second paragraph.');
    expect(chunks.join(' ')).toContain('Third paragraph.');
  });

  it('carries overlap from the previous chunk into the next one', () => {
    const sentences = Array.from({ length: 12 }, (_, i) => `Sentence number ${i}.`).join(' ');
    const chunks = chunkText(sentences, { maxChars: 120, overlapChars: 40 });
    expect(chunks.length).toBeGreaterThan(1);
    const lastWordsOfFirst = chunks[0].split(' ').slice(-2).join(' ');
    expect(chunks[1]).toContain(lastWordsOfFirst);
  });

  it('adds the overlap only once when a long paragraph is split', () => {
    const words = Array.from({ length: 200 }, (_, i) => `w${i}`);
    const chunks = chunkText(words.join(' '), options);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const chunkWords = chunk.split(' ');
      expect(new Set(chunkWords).size).toBe(chunkWords.length);
      expect(chunk.length).toBeLessThanOrEqual(options.maxChars);
    }
    // Overlap is still carried into the next chunk.
    const lastWordOfFirst = chunks[0].split(' ').at(-1);
    expect(chunks[1].split(' ')).toContain(lastWordOfFirst);
  });

  it('normalises Windows line endings', () => {
    expect(chunkText('one\r\n\r\ntwo', options)).toEqual(['one\n\ntwo']);
  });
});
