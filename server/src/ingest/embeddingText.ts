export interface EmbeddingSource {
  title: string;
  sourceType: 'note' | 'url';
  sourceUrl: string | null;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;

/**
 * Builds the text that is embedded for one chunk. The stored chunk text is unchanged; this
 * only adds context so that a question like "my GitHub link" can match a saved bare URL.
 * Links and their site names come from the item's source URL, or from links in the chunk.
 */
export function buildEmbeddingText(source: EmbeddingSource, chunkText: string): string {
  const links = source.sourceUrl ? [source.sourceUrl] : chunkText.match(URL_PATTERN) ?? [];
  const sites = [...new Set(links.map(siteOf).filter((site): site is string => site !== null))];

  const header = [`Saved ${source.sourceType}: ${source.title}`];
  if (links.length > 0) {
    header.push(`Links: ${links.join(' ')}`);
    header.push(`Sites: ${sites.join(', ')}`);
  }
  return `${header.join('\n')}\n\n${chunkText}`;
}

function siteOf(link: string): string | null {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
