import { useCallback, useEffect, useRef, useState } from 'react';

import { Article } from '@/types';
import {
  isTabDisplayCacheFresh,
  readTabDisplayCache,
  type TabDisplayCacheKey,
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
  const cached = readTabDisplayCache(tabKey);
  const [displayArticles, setDisplayArticles] = useState<Article[]>([]);
  const [displayReady, setDisplayReady] = useState(false);
  const feedGenerationRef = useRef(cached?.feedGeneration ?? 0);
  const rawLengthRef = useRef(cached?.rawLength ?? 0);
  const filterKeyRef = useRef(cached?.filterKey ?? filterKey);
  const personalizationKeyRef = useRef(cached?.personalizationKey ?? '');

  useEffect(() => {
    filterKeyRef.current = filterKey;
  }, [filterKey]);

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
    persistCache(
      { displayArticles, displayReady },
      feedGenerationRef.current,
      rawLengthRef.current,
      filterKeyRef.current,
      sync?.personalizationKey ?? (personalizationKeyRef.current || undefined),
    );
  }, [displayArticles, displayReady, persistCache, sync?.personalizationKey]);

  const isCacheFresh = useCallback(
    (feedGeneration: number, rawLength: number, nextFilterKey: string) => {
      const entry = readTabDisplayCache(tabKey);
      return entry
        ? isTabDisplayCacheFresh(entry, feedGeneration, rawLength, nextFilterKey)
        : false;
    },
    [tabKey],
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
