import { Article } from '@/types';

export type TabDisplayCacheKey = 'latest' | 'for-you';

export type TabDisplayCacheEntry = {
  displayArticles: Article[];
  displayReady: boolean;
  feedGeneration: number;
  rawLength: number;
  filterKey: string;
  /** For You only — liked/clicked signal generation for ranked feed freshness. */
  personalizationKey?: string;
  orderLocked: boolean;
};

const cache = new Map<TabDisplayCacheKey, TabDisplayCacheEntry>();

export function readTabDisplayCache(key: TabDisplayCacheKey): TabDisplayCacheEntry | undefined {
  return cache.get(key);
}

export function writeTabDisplayCache(key: TabDisplayCacheKey, entry: TabDisplayCacheEntry): void {
  cache.set(key, { ...entry, displayArticles: [...entry.displayArticles] });
}

export function isTabDisplayCacheFresh(
  entry: TabDisplayCacheEntry,
  feedGeneration: number,
  rawLength: number,
  filterKey: string,
): boolean {
  return (
    entry.feedGeneration === feedGeneration &&
    entry.rawLength === rawLength &&
    entry.filterKey === filterKey &&
    entry.displayArticles.length > 0
  );
}

export function isForYouDisplayCacheFresh(
  entry: TabDisplayCacheEntry,
  feedGeneration: number,
  rawLength: number,
  filterKey: string,
  personalizationKey: string,
): boolean {
  return (
    isTabDisplayCacheFresh(entry, feedGeneration, rawLength, filterKey) &&
    entry.personalizationKey === personalizationKey
  );
}

/** Cached feed can paint immediately even when a background re-rank is pending. */
export function hasShowableTabDisplayCache(key: TabDisplayCacheKey): boolean {
  const entry = readTabDisplayCache(key);
  return (entry?.displayArticles.length ?? 0) > 0;
}

/** True when tab display state matches the current upstream feed snapshot. */
export function isDisplayFeedSynced(options: {
  displayReady: boolean;
  displayFeedGeneration: number;
  displayRawLength: number;
  displayFilterKey: string;
  feedGeneration: number;
  rawLength: number;
  filterKey: string;
}): boolean {
  const {
    displayReady,
    displayFeedGeneration,
    displayRawLength,
    displayFilterKey,
    feedGeneration,
    rawLength,
    filterKey,
  } = options;
  return (
    displayReady &&
    displayFeedGeneration === feedGeneration &&
    displayRawLength === rawLength &&
    displayFilterKey === filterKey
  );
}

/**
 * Resolve visible feed rows without painting stale cache while upstream fetch/sync
 * is still catching up.
 */
export function resolveTabDisplayFeed(options: {
  contextLoading: boolean;
  displayArticles: Article[];
  displayReady: boolean;
  tabKey: TabDisplayCacheKey;
  feedGeneration: number;
  rawLength: number;
  filterKey: string;
}): Article[] {
  const {
    contextLoading,
    displayArticles,
    displayReady,
    tabKey,
    feedGeneration,
    rawLength,
    filterKey,
  } = options;

  if (contextLoading) return [];

  if (displayArticles.length > 0 && displayReady) {
    return displayArticles;
  }

  const cached = readTabDisplayCache(tabKey);
  if (
    cached &&
    cached.displayArticles.length > 0 &&
    isTabDisplayCacheFresh(cached, feedGeneration, rawLength, filterKey)
  ) {
    return cached.displayArticles;
  }

  return [];
}
