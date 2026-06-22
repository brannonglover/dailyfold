import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Article } from '@/types';
import {
  hydrateTabDisplayState,
  isForYouDisplayCacheFresh,
  isTabDisplayCacheFresh,
  readTabDisplayCache,
  type TabDisplayCacheKey,
  wouldClobberFreshTabDisplayCache,
  writeTabDisplayCache,
} from '@/utils/tabDisplayCache';

type TabDisplayState = {
  displayArticles: Article[];
  displayReady: boolean;
};

type TabDisplaySync = {
  feedGeneration: number;
  rawLength: number;
  personalizationKey?: string;
};

export function useTabDisplayState(
  tabKey: TabDisplayCacheKey,
  filterKey: string,
  sync?: TabDisplaySync,
) {
  const hydrated = hydrateTabDisplayState({
    tabKey,
    filterKey,
    feedGeneration: sync?.feedGeneration,
    rawLength: sync?.rawLength,
    personalizationKey: sync?.personalizationKey,
  });
  const cached = readTabDisplayCache(tabKey);
  const [displayArticles, setDisplayArticles] = useState<Article[]>(hydrated.displayArticles);
  const [displayReady, setDisplayReady] = useState(hydrated.displayReady);
  const feedGenerationRef = useRef(sync?.feedGeneration ?? cached?.feedGeneration ?? 0);
  const rawLengthRef = useRef(sync?.rawLength ?? cached?.rawLength ?? 0);
  const filterKeyRef = useRef(cached?.filterKey ?? filterKey);
  const personalizationKeyRef = useRef(cached?.personalizationKey ?? sync?.personalizationKey ?? '');

  useEffect(() => {
    filterKeyRef.current = filterKey;
  }, [filterKey]);

  useLayoutEffect(() => {
    if (displayArticles.length > 0) return;

    const cached = readTabDisplayCache(tabKey);
    if (!cached || cached.displayArticles.length === 0 || cached.filterKey !== filterKey) {
      return;
    }

    const generation = sync?.feedGeneration ?? cached.feedGeneration;
    const length = sync?.rawLength ?? cached.rawLength;
    const fresh =
      tabKey === 'for-you' || tabKey === 'latest'
        ? isForYouDisplayCacheFresh(
            cached,
            generation,
            length,
            filterKey,
            sync?.personalizationKey ?? cached.personalizationKey ?? '',
          )
        : isTabDisplayCacheFresh(cached, generation, length, filterKey);
    if (!fresh) return;

    setDisplayArticles(cached.displayArticles);
    setDisplayReady(true);
  }, [
    tabKey,
    filterKey,
    displayArticles.length,
    sync?.feedGeneration,
    sync?.rawLength,
    sync?.personalizationKey,
  ]);

  useEffect(() => {
    if (sync?.feedGeneration != null) {
      feedGenerationRef.current = sync.feedGeneration;
    }
    if (sync?.rawLength != null) {
      rawLengthRef.current = sync.rawLength;
    }
    if (sync?.personalizationKey != null) {
      personalizationKeyRef.current = sync.personalizationKey;
    }
  }, [sync?.feedGeneration, sync?.rawLength, sync?.personalizationKey]);

  const persistCache = useCallback(
    (
      state: TabDisplayState,
      feedGeneration: number,
      rawLength: number,
      nextFilterKey: string,
      personalizationKey?: string,
    ) => {
      writeTabDisplayCache(tabKey, {
        displayArticles: state.displayArticles,
        displayReady: state.displayReady,
        feedGeneration,
        rawLength,
        filterKey: nextFilterKey,
        personalizationKey,
        orderLocked: readTabDisplayCache(tabKey)?.orderLocked ?? false,
      });
    },
    [tabKey],
  );

  useEffect(() => {
    const personalizationKey =
      sync?.personalizationKey ?? (personalizationKeyRef.current || undefined);
    if (
      wouldClobberFreshTabDisplayCache(
        tabKey,
        displayArticles,
        displayReady,
        feedGenerationRef.current,
        rawLengthRef.current,
        filterKeyRef.current,
        personalizationKey,
      )
    ) {
      return;
    }

    persistCache(
      { displayArticles, displayReady },
      feedGenerationRef.current,
      rawLengthRef.current,
      filterKeyRef.current,
      personalizationKey,
    );
  }, [displayArticles, displayReady, persistCache, sync?.personalizationKey, tabKey]);

  const isCacheFresh = useCallback(
    (feedGeneration: number, rawLength: number, nextFilterKey: string) => {
      const entry = readTabDisplayCache(tabKey);
      if (!entry) return false;
      if (sync?.personalizationKey != null) {
        return isForYouDisplayCacheFresh(
          entry,
          feedGeneration,
          rawLength,
          nextFilterKey,
          sync.personalizationKey,
        );
      }
      return isTabDisplayCacheFresh(entry, feedGeneration, rawLength, nextFilterKey);
    },
    [tabKey, sync?.personalizationKey],
  );

  return {
    displayArticles,
    displayReady,
    feedGenerationRef,
    rawLengthRef,
    filterKeyRef,
    isCacheFresh,
    setDisplayArticles,
    setDisplayReady,
  };
}
