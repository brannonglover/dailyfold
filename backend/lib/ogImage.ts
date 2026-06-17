import { URL } from 'node:url';

import { isBrokenGuardianImageUrl } from '../../catalog/guardianImageUrl';
import { isArticlePlaceholderImageUrl } from '../../catalog/imagePlaceholders';

import {
  normalizeEspnCdnImageUrl,
  parsePageVideoThumbnailUrls,
} from './embeddedMedia';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_HTML_BYTES = 96_000;
const MAX_REDIRECTS = 5;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

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

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    error.message.includes('timed out') ||
    error.message.includes('aborted')
  );
}

async function readResponseHead(response: Response): Promise<string> {
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(Buffer.from(value));
      total += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  return Buffer.concat(chunks).toString('utf8');
}

async function fetchHtmlHead(pageUrl: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  try {
    let currentUrl = pageUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': USER_AGENT,
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get('location')
      ) {
        currentUrl = new URL(response.headers.get('location')!, currentUrl).href;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return readResponseHead(response);
    }

    throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchPageOgImageOptions {
  onTimeout?: (url: string, elapsedMs: number) => void;
}

/** Fetch article HTML and return a hero image (social meta or video thumbnail). */
export async function fetchPageOgImageUrl(
  pageUrl: string,
  timeoutMs = FETCH_TIMEOUT_MS,
  options?: FetchPageOgImageOptions,
): Promise<string | null> {
  const started = Date.now();
  try {
    const html = await fetchHtmlHead(pageUrl, timeoutMs);
    return parsePageHeroImageUrl(html);
  } catch (error) {
    if (isTimeoutError(error)) {
      options?.onTimeout?.(pageUrl, Date.now() - started);
    }
    return null;
  }
}

const DEFAULT_OG_IMAGE_CONCURRENCY = 10;

/** True when RSS left no usable hero (empty, placeholder, or broken Guardian signature). */
export function articleNeedsHeroEnrichment(imageUrl: string | null | undefined): boolean {
  if (!imageUrl?.trim()) return true;
  if (isArticlePlaceholderImageUrl(imageUrl)) return true;
  return isBrokenGuardianImageUrl(imageUrl);
}

export interface HeroEnrichmentOptions {
  concurrency?: number;
  timeoutMs?: number;
  heartbeatIntervalMs?: number;
  onProgress?: (completed: number, total: number) => void;
  onHeartbeat?: (completed: number, total: number, remaining: number) => void;
  onFetchTimeout?: (url: string, elapsedMs: number) => void;
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
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;

  const targets = articles.filter((article) => articleNeedsHeroEnrichment(article.imageUrl));
  if (targets.length === 0) return { enriched: 0 };

  let enriched = 0;
  let completed = 0;
  let cursor = 0;
  let lastProgressAt = Date.now();
  const onProgress = options.onProgress;
  const onHeartbeat = options.onHeartbeat;
  const onFetchTimeout = options.onFetchTimeout;

  const heartbeat =
    onHeartbeat &&
    setInterval(() => {
      const remaining = targets.length - completed;
      if (remaining <= 0) return;
      if (Date.now() - lastProgressAt >= heartbeatIntervalMs) {
        onHeartbeat(completed, targets.length, remaining);
      }
    }, heartbeatIntervalMs);

  async function worker() {
    while (true) {
      const slot = cursor;
      cursor += 1;
      if (slot >= targets.length) return;

      const article = targets[slot]!;
      const heroUrl = await fetchPageOgImageUrl(article.url, timeoutMs, { onTimeout: onFetchTimeout });
      if (heroUrl) {
        article.imageUrl = heroUrl;
        enriched += 1;
      }

      completed += 1;
      lastProgressAt = Date.now();
      onProgress?.(completed, targets.length);
    }
  }

  try {
    await Promise.all(
      Array.from({ length: Math.min(concurrency, targets.length) }, () => worker()),
    );
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }

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

export { isTimeoutError };
