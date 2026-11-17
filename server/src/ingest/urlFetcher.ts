import dns from 'node:dns/promises';
import net from 'node:net';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

export interface FetchedArticle {
  title: string;
  text: string;
  finalUrl: string;
}

/** Raised for any reason a URL cannot be turned into readable text. Safe to show to users. */
export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FetchError';
  }
}

const MAX_REDIRECTS = 3;
// Statuses that sites use to turn away logged-out or automated visitors. LinkedIn uses 999.
const BLOCKED_STATUSES = new Set([401, 403, 429, 999]);
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

/** Turns a failed HTTP status into a message the user can act on. */
export function describeHttpFailure(status: number): string {
  if (BLOCKED_STATUSES.has(status)) {
    return `This site blocks automated access (HTTP ${status}). Save the link as a note instead.`;
  }
  return `Page responded with HTTP ${status}`;
}

/** Validates the URL shape. Throws a plain Error with a user-facing message. */
export function parsePublicHttpUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('URL is not valid');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported');
  }
  if (url.username || url.password) {
    throw new Error('URLs with embedded credentials are not supported');
  }
  return url;
}

/**
 * Fetches a page server-side and extracts its main article text.
 * Guards against SSRF: every hop (including redirects) must resolve to a public address.
 */
export class UrlFetcher {
  async fetchArticle(rawUrl: string): Promise<FetchedArticle> {
    let url = parsePublicHttpUrl(rawUrl);
    let html: string | null = null;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      await assertPublicHost(url.hostname);
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'KnowledgeInboxBot/1.0' },
      }).catch(() => {
        throw new FetchError(`Could not reach ${url.hostname}`);
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new FetchError('Redirect response had no Location header');
        url = parsePublicHttpUrl(new URL(location, url).toString());
        continue;
      }
      if (!response.ok) {
        throw new FetchError(describeHttpFailure(response.status));
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        throw new FetchError(`Unsupported content type: ${contentType || 'unknown'}`);
      }
      html = await readLimited(response);
      break;
    }

    if (html === null) throw new FetchError('Too many redirects');
    return extractArticle(html, url.toString());
  }
}

export function extractArticle(html: string, finalUrl: string): FetchedArticle {
  // Scripts are not run: jsdom's runScripts option is off by default.
  const dom = new JSDOM(html, { url: finalUrl });
  const article = new Readability(dom.window.document).parse();
  const text = article?.textContent?.replace(/\s+\n/g, '\n').trim() ?? '';
  if (!text) throw new FetchError('No readable text found on this page');
  const title = article?.title?.trim() || new URL(finalUrl).hostname;
  return { title, text, finalUrl };
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new FetchError('Page is larger than the 2 MB limit');
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

async function assertPublicHost(hostname: string): Promise<void> {
  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true }).catch(() => {
        throw new FetchError(`Could not resolve ${hostname}`);
      });
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new FetchError('URLs pointing to private or local network addresses are not allowed');
    }
  }
}

export function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIPv4(address);
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice(7));
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  return true; // Not an IP address at all: refuse.
}

function isPrivateIPv4(address: string): boolean {
  const [a, b] = address.split('.').map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}
