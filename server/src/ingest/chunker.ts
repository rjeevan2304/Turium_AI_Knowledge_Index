export interface ChunkingOptions {
  maxChars: number;
  overlapChars: number;
}

/**
 * Splits text into overlapping chunks that respect paragraph boundaries where possible.
 *
 * Strategy:
 * 1. Split on blank lines into paragraphs.
 * 2. Any paragraph longer than maxChars is split into word-aligned windows.
 * 3. Paragraphs are packed greedily into chunks up to maxChars.
 * 4. Each new chunk starts with the last ~overlapChars of the previous one (cut at a
 *    word boundary), so a sentence that spans a boundary is still retrievable.
 */
export function chunkText(text: string, options: ChunkingOptions): string[] {
  const { maxChars, overlapChars } = options;
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const pieces = normalized
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
    .flatMap((paragraph) => splitLongText(paragraph, maxChars, overlapChars));

  const chunks: string[] = [];
  let current = '';

  for (const piece of pieces) {
    const candidate = current ? `${current}\n\n${piece}` : piece;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }
    if (current) {
      chunks.push(current);
      const withOverlap = joinWithOverlap(tailAtWordBoundary(current, overlapChars), piece);
      // Drop the overlap if it would push the chunk past the size limit.
      current = withOverlap.length <= maxChars ? withOverlap : piece;
    } else {
      current = piece;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

/** Splits one oversized paragraph into windows no longer than maxChars. */
function splitLongText(text: string, maxChars: number, overlapChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const windows: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start) end = lastSpace;
    }
    windows.push(text.slice(start, end).trim());
    if (end >= text.length) break;
    const nextStart = end - overlapChars;
    start = nextStart > start ? nextStart : end;
  }
  return windows.filter((window) => window.length > 0);
}

function tailAtWordBoundary(text: string, length: number): string {
  if (length <= 0 || text.length <= length) return '';
  const cut = text.indexOf(' ', text.length - length);
  return cut === -1 ? '' : text.slice(cut + 1);
}

function joinWithOverlap(overlap: string, piece: string): string {
  return overlap ? `${overlap} ${piece}` : piece;
}
