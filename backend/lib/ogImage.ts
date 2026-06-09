import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

import { isArticlePlaceholderImageUrl } from '../../catalog/imagePlaceholders';

import {
  normalizeEspnCdnImageUrl,
  parsePageVideoThumbnailUrls,
} from './embeddedMedia';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 96_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; DailyFoldReader/1.0; +https://github.com/brannonglover/current)';

const OG_IMAGE_PATTERNS = [
  /<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i,
  /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
];

function resolveSocialImageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).href;
  } catch {
    if (trimmed.startsWith('//')) {
      return `https:${trimmed}`;
    }
  }

  return null;
}

/** Parse og:image / twitter:image from the first chunk of article HTML. */
export function parseOgImageUrl(html: string): string | null {
  const head = html.slice(0, MAX_HTML_BYTES);

  for (const pattern of OG_IMAGE_PATTERNS) {
    const match = head.match(pattern);
    const resolved = resolveSocialImageUrl(match?.[1] ?? '');
    if (resolved) return resolved;
  }

  return null;
}

/** Hero image from social meta, falling back to embedded video poster/thumbnail. */
export function parsePageHeroImageUrl(html: string): string | null {
  const head = html.slice(0, MAX_HTML_BYTES);

  const og = parseOgImageUrl(head);
  if (og) {
    const normalized = normalizeEspnCdnImageUrl(og);
    if (!isArticlePlaceholderImageUrl(normalized)) return normalized;
  }

  const [videoThumb] = parsePageVideoThumbnailUrls(head);
  return videoThumb ?? null;
}

function fetchHtmlHead(pageUrl: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const url = new URL(pageUrl);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.get(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': USER_AGENT,
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          try {
            const next = new URL(res.headers.location, pageUrl).href;
            fetchHtmlHead(next, timeoutMs).then(resolve, reject);
          } catch (error) {
            reject(error);
          }
          return;
        }

        if (!res.statusCode || res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode ?? 'error'}`));
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;

        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total <= MAX_HTML_BYTES) {
            chunks.push(chunk);
          } else {
            res.destroy();
          }
        });

        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('close', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

/** Fetch article HTML and return a hero image (social meta or video thumbnail). */
export async function fetchPageOgImageUrl(
  pageUrl: string,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const html = await fetchHtmlHead(pageUrl, timeoutMs);
    return parsePageHeroImageUrl(html);
  } catch {
    return null;
  }
}

const DEFAULT_OG_IMAGE_CONCURRENCY = 6;

/** True when RSS left no usable hero (empty or known placeholder URL). */
export function articleNeedsHeroEnrichment(imageUrl: string | null | undefined): boolean {
  return !imageUrl?.trim() || isArticlePlaceholderImageUrl(imageUrl);
}

export interface HeroEnrichmentOptions {
  concurrency?: number;
  timeoutMs?: number;
}

/**
 * Fetch og:image / twitter:image (and video poster fallbacks) for articles missing RSS heroes.
 * Applies to every source; skips items that already have a real image URL.
 */
export async function enrichArticlesMissingHeroImages<
  T extends { url: string; imageUrl: string },
>(articles: T[], options: HeroEnrichmentOptions = {}): Promise<{ enriched: number }> {
  const concurrency =
    options.concurrency ??
    Number(process.env.OG_IMAGE_CONCURRENCY ?? DEFAULT_OG_IMAGE_CONCURRENCY);
  const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS;

  const targets = articles.filter((article) => articleNeedsHeroEnrichment(article.imageUrl));
  if (targets.length === 0) return { enriched: 0 };

  let enriched = 0;
  let cursor = 0;

  async function worker() {
    while (true) {
      const slot = cursor;
      cursor += 1;
      if (slot >= targets.length) return;

      const article = targets[slot]!;
      const heroUrl = await fetchPageOgImageUrl(article.url, timeoutMs);
      if (heroUrl) {
        article.imageUrl = heroUrl;
        enriched += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
  );

  return { enriched };
}

export function isEspnFeedUrl(feedUrl: string): boolean {
  try {
    const host = new URL(feedUrl).hostname.toLowerCase();
    return host === 'espn.com' || host.endsWith('.espn.com') || host === 'espn.co.uk' || host.endsWith('.espn.co.uk');
  } catch {
    return false;
  }
}
