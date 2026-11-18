import { describe, expect, it } from 'vitest';
import { buildEmbeddingText } from './embeddingText.js';

describe('buildEmbeddingText', () => {
  it('adds the site name for a bare URL note', () => {
    const text = buildEmbeddingText(
      { title: 'https://github.com/me/repo', sourceType: 'note', sourceUrl: null },
      'https://github.com/me/repo',
    );
    expect(text).toContain('Sites: github.com');
    expect(text).toContain('Links: https://github.com/me/repo');
  });

  it('uses the source URL for URL items and strips www.', () => {
    const text = buildEmbeddingText(
      { title: 'Article', sourceType: 'url', sourceUrl: 'https://www.example.com/post' },
      'Body text',
    );
    expect(text).toContain('Sites: example.com');
    expect(text.endsWith('\n\nBody text')).toBe(true);
  });

  it('leaves plain notes without links unchanged apart from the header', () => {
    const text = buildEmbeddingText(
      { title: 'Groceries', sourceType: 'note', sourceUrl: null },
      'Buy milk and eggs.',
    );
    expect(text).toBe('Saved note: Groceries\n\nBuy milk and eggs.');
  });

  it('finds links inside note text', () => {
    const text = buildEmbeddingText(
      { title: 'Links', sourceType: 'note', sourceUrl: null },
      'See https://news.site.org/a and https://news.site.org/b for details.',
    );
    expect(text).toContain('Sites: news.site.org');
  });

  it('drops sentence punctuation after a link', () => {
    const text = buildEmbeddingText(
      { title: 'Profile', sourceType: 'note', sourceUrl: null },
      'My profile (https://example.com/me).',
    );
    expect(text).toContain('Links: https://example.com/me\n');
  });
});
