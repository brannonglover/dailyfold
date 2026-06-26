import {
  ForYouInterestKind,
  getQuickInterestFeedPreview,
  getSingleInterestForYouFeed,
} from '@/services/recommendations';
import { Article } from '@/types';

/** Stale-while-revalidate window for interest feed snapshots. */
export const FOR_YOU_INTEREST_FEED_CACHE_TTL_MS = 10 * 60 * 1000;

export type ForYouInterestFeedCacheEntry = {
  articles: Article[];
  feedGeneration: number;
  rawLength: number;
  cachedAt: number;
};

const cache = new Map<string, ForYouInterestFeedCacheEntry>();

export function buildForYouInterestFeedCacheKey(
  kind: ForYouInterestKind,
  value: string,
): string {
  return `${kind}\0${value}`;
}

export function readForYouInterestFeedCache(
  key: string,
): ForYouInterestFeedCacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry || entry.articles.length === 0) return undefined;
  return entry;
}

export function writeForYouInterestFeedCache(
  key: string,
  entry: Omit<ForYouInterestFeedCacheEntry, 'cachedAt'> & { cachedAt?: number },
): void {
  cache.set(key, {
    ...entry,
    articles: [...entry.articles],
    cachedAt: entry.cachedAt ?? Date.now(),
  });
}

export function clearForYouInterestFeedCache(): void {
  cache.clear();
}

export function isForYouInterestFeedCacheFresh(
  entry: ForYouInterestFeedCacheEntry,
  feedGeneration: number,
  rawLength: number,
): boolean {
  return entry.feedGeneration === feedGeneration && entry.rawLength === rawLength;
}

export function isForYouInterestFeedCacheWithinTtl(
  entry: ForYouInterestFeedCacheEntry,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - entry.cachedAt < FOR_YOU_INTEREST_FEED_CACHE_TTL_MS;
}

/** Cached rows can paint immediately when fresh or still within the SWR window. */
export function isForYouInterestFeedCacheShowable(
  entry: ForYouInterestFeedCacheEntry,
  feedGeneration: number,
  rawLength: number,
  nowMs: number = Date.now(),
): boolean {
  if (entry.articles.length === 0) return false;
  return (
    isForYouInterestFeedCacheFresh(entry, feedGeneration, rawLength) ||
    isForYouInterestFeedCacheWithinTtl(entry, nowMs)
  );
}

export function hasShowableForYouInterestFeedCache(key: string): boolean {
  const entry = readForYouInterestFeedCache(key);
  return (entry?.articles.length ?? 0) > 0;
}

export function hydrateForYouInterestFeedArticles(key: string): Article[] {
  const entry = readForYouInterestFeedCache(key);
  return entry ? [...entry.articles] : [];
}

/** Persist ranked rows so interest feeds can paint before upstream fetch completes. */
export function prewarmForYouInterestFeedCache(
  articles: Article[],
  kind: ForYouInterestKind,
  value: string,
  filterFeedArticles: (items: Article[]) => Article[],
  feedGeneration: number,
): boolean {
  if (articles.length === 0) return false;

  const key = buildForYouInterestFeedCacheKey(kind, value);
  const existing = readForYouInterestFeedCache(key);
  if (existing) {
    if (isForYouInterestFeedCacheFresh(existing, feedGeneration, articles.length)) {
      return false;
    }
    if (isForYouInterestFeedCacheWithinTtl(existing)) {
      return false;
    }
  }

  const filtered = filterFeedArticles(articles);
  const quick = getQuickInterestFeedPreview(filtered, kind, value);
  if (quick.length > 0) {
    writeForYouInterestFeedCache(key, {
      articles: quick,
      feedGeneration,
      rawLength: articles.length,
    });
  }

  // Full relevance ranking runs after the tap handler returns — quick preview paints first.
  setTimeout(() => {
    const ranked = getSingleInterestForYouFeed(filtered, kind, value);
    if (ranked.length === 0) return;
    writeForYouInterestFeedCache(key, {
      articles: ranked,
      feedGeneration,
      rawLength: articles.length,
    });
  }, 0);

  return quick.length > 0;
}

export function resolveForYouInterestFeedArticles(options: {
  key: string;
  feedGeneration: number;
  rawLength: number;
  computed: Article[];
  preview?: Article[];
  allowStaleDuringLoad?: boolean;
}): Article[] {
  const {
    key,
    feedGeneration,
    rawLength,
    computed,
    preview = [],
    allowStaleDuringLoad = false,
  } = options;

  if (computed.length > 0) {
    writeForYouInterestFeedCache(key, { articles: computed, feedGeneration, rawLength });
    return computed;
  }

  const cached = readForYouInterestFeedCache(key);
  if (cached) {
    if (
      isForYouInterestFeedCacheShowable(cached, feedGeneration, rawLength) ||
      allowStaleDuringLoad
    ) {
      return cached.articles;
    }
  }

  if (preview.length > 0) {
    return preview;
  }

  return [];
}

/** True when visible rows are stale metadata but still within the SWR window. */
export function isForYouInterestFeedRevalidating(options: {
  key: string;
  feedGeneration: number;
  rawLength: number;
  computedLength: number;
}): boolean {
  const { key, feedGeneration, rawLength, computedLength } = options;
  if (computedLength > 0) return false;

  const cached = readForYouInterestFeedCache(key);
  if (!cached || cached.articles.length === 0) return false;

  return (
    !isForYouInterestFeedCacheFresh(cached, feedGeneration, rawLength) &&
    isForYouInterestFeedCacheWithinTtl(cached)
  );
}

export function buildQuickInterestFeedPreview(
  articles: Article[],
  kind: ForYouInterestKind,
  value: string,
  filterFeedArticles: (items: Article[]) => Article[],
): Article[] {
  if (articles.length === 0) return [];
  return getQuickInterestFeedPreview(filterFeedArticles(articles), kind, value);
}
