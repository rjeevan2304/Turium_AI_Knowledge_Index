import { describe, expect, it } from 'vitest';
import { describeHttpFailure, extractArticle, isPrivateAddress, parsePublicHttpUrl } from './urlFetcher.js';

describe('parsePublicHttpUrl', () => {
  it('accepts http and https URLs', () => {
    expect(parsePublicHttpUrl('https://example.com/a').hostname).toBe('example.com');
    expect(parsePublicHttpUrl('http://example.com').protocol).toBe('http:');
  });

  it('rejects non-http schemes', () => {
    expect(() => parsePublicHttpUrl('ftp://example.com')).toThrow(/Only http and https/);
    expect(() => parsePublicHttpUrl('file:///etc/passwd')).toThrow(/Only http and https/);
  });

  it('rejects malformed URLs', () => {
    expect(() => parsePublicHttpUrl('not a url')).toThrow(/not valid/);
  });

  it('rejects URLs with embedded credentials', () => {
    expect(() => parsePublicHttpUrl('https://user:pass@example.com')).toThrow(/credentials/);
  });
});

describe('isPrivateAddress (SSRF guard)', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.5',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '100.64.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('extractArticle', () => {
  it('extracts the main text and title from an HTML page', () => {
    const html = `<html><head><title>Sample Post</title></head><body>
      <nav>Home | About</nav>
      <article><h1>Sample Post</h1>
      <p>Retrieval augmented generation combines search with language models to ground answers.</p>
      <p>Chunking the source text keeps each retrieved passage small and focused on one topic.</p>
      </article></body></html>`;
    const article = extractArticle(html, 'https://example.com/post');
    expect(article.title).toBe('Sample Post');
    expect(article.text).toContain('Retrieval augmented generation');
    expect(article.finalUrl).toBe('https://example.com/post');
  });

  it('throws a readable error when the page has no text', () => {
    expect(() => extractArticle('<html><body></body></html>', 'https://example.com')).toThrow(
      /No readable text/,
    );
  });
});

describe('describeHttpFailure', () => {
  it('explains statuses that sites use to block automated access', () => {
    for (const status of [401, 403, 429, 999]) {
      expect(describeHttpFailure(status)).toBe(
        `This site blocks automated access (HTTP ${status}). Save the link as a note instead.`,
      );
    }
  });

  it('reports other statuses as-is', () => {
    expect(describeHttpFailure(404)).toBe('Page responded with HTTP 404');
  });
});
