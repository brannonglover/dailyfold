import { Article } from '@/types';

export type TabDisplayCacheKey = 'latest' | 'for-you';

export type TabDisplayCacheEntry = {
  displayArticles: Article[];
  displayReady: boolean;
  feedGeneration: number;
  rawLength: number;
  filterKey: string;
  /** Liked/opened signal generation for ranked feed freshness (Latest + For You). */
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

export type HydrateTabDisplayOptions = {
  tabKey: TabDisplayCacheKey;
  filterKey: string;
  feedGeneration?: number;
  rawLength?: number;
  personalizationKey?: string;
};

/** Seed in-memory tab display state from a fresh module cache snapshot (e.g. after remount). */
export function hydrateTabDisplayState(options: HydrateTabDisplayOptions): {
  displayArticles: Article[];
  displayReady: boolean;
} {
  const { tabKey, filterKey, feedGeneration, rawLength, personalizationKey } = options;
  const cached = readTabDisplayCache(tabKey);
  if (!cached || cached.displayArticles.length === 0) {
    return { displayArticles: [], displayReady: false };
  }

  const generation = feedGeneration ?? cached.feedGeneration;
  const length = rawLength ?? cached.rawLength;
  const fresh =
    tabKey === 'for-you' || tabKey === 'latest'
      ? isForYouDisplayCacheFresh(
          cached,
          generation,
          length,
          filterKey,
          personalizationKey ?? cached.personalizationKey ?? '',
        )
      : isTabDisplayCacheFresh(cached, generation, length, filterKey);

  if (!fresh) {
    return { displayArticles: [], displayReady: false };
  }

  return {
    displayArticles: cached.displayArticles,
    displayReady: cached.displayReady,
  };
}

/** True when persisting empty display state would wipe a still-valid cache entry. */
export function wouldClobberFreshTabDisplayCache(
  tabKey: TabDisplayCacheKey,
  displayArticles: Article[],
  displayReady: boolean,
  feedGeneration: number,
  rawLength: number,
  filterKey: string,
  personalizationKey?: string,
): boolean {
  if (displayArticles.length > 0 || displayReady) return false;
  const cached = readTabDisplayCache(tabKey);
  if (!cached || cached.displayArticles.length === 0) return false;

  return tabKey === 'for-you' || tabKey === 'latest'
    ? isForYouDisplayCacheFresh(
        cached,
        feedGeneration,
        rawLength,
        filterKey,
        personalizationKey ?? cached.personalizationKey ?? '',
      )
    : isTabDisplayCacheFresh(cached, feedGeneration, rawLength, filterKey);
}

/** Cached feed can paint immediately even when a background re-rank is pending. */
export function hasShowableTabDisplayCache(key: TabDisplayCacheKey): boolean {
  const entry = readTabDisplayCache(key);
  return (entry?.displayArticles.length ?? 0) > 0;
}

/** True when visible rows are a strict subset of the filtered upstream feed. */
export function isDisplayFeedUnderstocked(displayCount: number, filteredCount: number): boolean {
  return filteredCount > 0 && displayCount > 0 && displayCount < filteredCount;
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
function readShowableTabDisplayCache(
  tabKey: TabDisplayCacheKey,
  feedGeneration: number,
  rawLength: number,
  filterKey: string,
  allowStaleDuringLoad: boolean,
  personalizationKey?: string,
): Article[] {
  const cached = readTabDisplayCache(tabKey);
  if (!cached || cached.displayArticles.length === 0 || cached.filterKey !== filterKey) {
    return [];
  }

  const fresh =
    tabKey === 'for-you' || tabKey === 'latest'
      ? isForYouDisplayCacheFresh(
          cached,
          feedGeneration,
          rawLength,
          filterKey,
          personalizationKey ?? cached.personalizationKey ?? '',
        )
      : isTabDisplayCacheFresh(cached, feedGeneration, rawLength, filterKey);

  if (fresh) return cached.displayArticles;
  if (allowStaleDuringLoad) return cached.displayArticles;
  return [];
}

export function resolveTabDisplayFeed(options: {
  contextLoading: boolean;
  displayArticles: Article[];
  displayReady: boolean;
  tabKey: TabDisplayCacheKey;
  feedGeneration: number;
  rawLength: number;
  filterKey: string;
  personalizationKey?: string;
}): Article[] {
  const {
    contextLoading,
    displayArticles,
    displayReady,
    tabKey,
    feedGeneration,
    rawLength,
    filterKey,
    personalizationKey,
  } = options;

  if (displayArticles.length > 0) {
    return displayArticles;
  }

  const cachedFeed = readShowableTabDisplayCache(
    tabKey,
    feedGeneration,
    rawLength,
    filterKey,
    contextLoading,
    personalizationKey,
  );
  if (cachedFeed.length > 0) {
    return cachedFeed;
  }

  if (contextLoading) return [];

  return [];
}
