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
      await assertPublicHost(url.hostname.replace(/^\[|\]$/g, ''));
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

// Ranges that are not on the public internet: private, loopback, link-local, shared (CGNAT),
// documentation, benchmarking, multicast and reserved. NAT64 and 6to4 are blocked as well
// because they can embed a private IPv4 address.
const BLOCKED = new net.BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 96], ['::1', 128], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

export function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return BLOCKED.check(address, 'ipv4');
  if (version === 6) {
    const mapped = ipv4FromMapped(address);
    if (mapped) return BLOCKED.check(mapped, 'ipv4');
    return BLOCKED.check(address, 'ipv6');
  }
  return true; // Not an IP address at all: refuse.
}

/** Returns the IPv4 address inside an IPv4-mapped IPv6 address (::ffff:a.b.c.d or ::ffff:7f00:1). */
function ipv4FromMapped(address: string): string | null {
  // The URL parser normalises any IPv6 spelling, e.g. 0:0:0:0:0:ffff:7f00:1 -> ::ffff:7f00:1.
  const normalised = new URL(`http://[${address}]`).hostname.slice(1, -1);
  const match = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalised);
  if (!match) return null;
  const high = parseInt(match[1], 16);
  const low = parseInt(match[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join('.');
}
