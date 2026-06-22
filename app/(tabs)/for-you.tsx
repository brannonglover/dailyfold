import { useIsFocused } from '@react-navigation/native';
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { InteractionManager } from 'react-native';

import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { ForYouTopicPicker } from '@/components/ForYouTopicPicker';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDeferAfterFocus } from '@/hooks/useDeferAfterFocus';
import { useArticles } from '@/hooks/useArticles';
import { useDisplayOrderLock } from '@/hooks/useDisplayOrderLock';
import { useTabDisplayState } from '@/hooks/useTabDisplayState';
import { getForYouFeed } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { buildForYouCacheKeys } from '@/utils/forYouPrewarm';
import { getForYouEmptyMessage } from '@/utils/feedEmptyMessage';
import { isFeedInteractionLocked, subscribeFeedInteractionLock } from '@/utils/feedInteractionLock';
import { sourceIdsForForYouInterests } from '@/utils/forYouInterestSources';
import { hasForYouTopicSelection } from '@/utils/forYouTopics';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
import {
  isForYouDisplayCacheFresh,
  readTabDisplayCache,
} from '@/utils/tabDisplayCache';

function ForYouScreenContent() {
  const {
    preferences,
    isLoading: isPreferencesLoading,
    filterForYouFeedArticles,
    recordFeedClick,
  } = usePreferences();
  const {
    articles,
    feedGeneration,
    isLoading,
    isRefreshing,
    error,
    notice,
    usingDemoArticles,
    refresh,
    boostArticlesForInterests,
  } = useArticles();

  const preferencesReady = preferences != null;
  const hasForYouTopics = preferencesReady && hasForYouTopicSelection(preferences);
  const syncDisplayHandledRef = useRef(false);
  const interestBoostKeyRef = useRef('');
  const isFocused = useIsFocused();
  const [feedInteractionEpoch, setFeedInteractionEpoch] = useState(0);
  const [emptyMessage, setEmptyMessage] = useState<string | undefined>();

  const { feedFilterKey, personalizationKey } = useMemo(
    () =>
      preferences
        ? buildForYouCacheKeys(preferences)
        : { feedFilterKey: '', personalizationKey: '' },
    [preferences],
  );

  const {
    displayArticles,
    displayReady,
    feedGenerationRef: prevFeedGenerationRef,
    rawLengthRef: prevRawLengthRef,
    setDisplayArticles,
    setDisplayReady,
  } = useTabDisplayState('for-you', feedFilterKey, {
    feedGeneration,
    rawLength: articles.length,
    personalizationKey,
  });

  const isForYouCacheFresh = useMemo(() => {
    const entry = readTabDisplayCache('for-you');
    return entry
      ? isForYouDisplayCacheFresh(
          entry,
          feedGeneration,
          articles.length,
          feedFilterKey,
          personalizationKey,
        )
      : false;
  }, [feedGeneration, articles.length, feedFilterKey, personalizationKey]);

  const { markInitialDisplay, shouldAllowFullRebuild, shouldAllowSilentMerge } =
    useDisplayOrderLock(isRefreshing, 'for-you');

  useEffect(() => subscribeFeedInteractionLock(() => setFeedInteractionEpoch((n) => n + 1)), []);

  const rebuildForYouDisplay = useCallback(() => {
    if (!preferences || !hasForYouTopics) return [];
    return getForYouFeed(filterForYouFeedArticles(articles), preferences);
  }, [articles, filterForYouFeedArticles, hasForYouTopics, preferences]);

  const showableArticles = useMemo(() => {
    if (!hasForYouTopics || !preferences) return [];
    if (displayArticles.length > 0) return displayArticles;
    const cached = readTabDisplayCache('for-you');
    if (
      cached &&
      cached.displayArticles.length > 0 &&
      isForYouDisplayCacheFresh(
        cached,
        feedGeneration,
        articles.length,
        feedFilterKey,
        personalizationKey,
      )
    ) {
      return cached.displayArticles;
    }
    return [];
  }, [
    displayArticles,
    preferences,
    hasForYouTopics,
    feedGeneration,
    articles.length,
    feedFilterKey,
    personalizationKey,
  ]);

  useEffect(() => {
    if (!isFocused) return;
    if (showableArticles.length > 0 && !displayReady) {
      setDisplayReady(true);
    }
  }, [isFocused, showableArticles.length, displayReady, setDisplayReady]);

  useEffect(() => {
    if (!isFocused || hasForYouTopics) return;
    if (displayArticles.length === 0 && !displayReady) return;
    startTransition(() => {
      setDisplayArticles([]);
      setDisplayReady(false);
      prevRawLengthRef.current = 0;
    });
  }, [
    isFocused,
    hasForYouTopics,
    displayArticles.length,
    displayReady,
    setDisplayArticles,
    setDisplayReady,
    prevRawLengthRef,
  ]);

  useLayoutEffect(() => {
    if (!isFocused || !preferences || !hasForYouTopics) return;
    if (isFeedInteractionLocked()) return;

    const ranked = rebuildForYouDisplay();
    setDisplayArticles(ranked);
    setDisplayReady(true);
    prevRawLengthRef.current = articles.length;
    prevFeedGenerationRef.current = feedGeneration;
  }, [
    isFocused,
    personalizationKey,
    rebuildForYouDisplay,
    preferences,
    hasForYouTopics,
    articles.length,
    feedGeneration,
    setDisplayArticles,
    setDisplayReady,
    prevRawLengthRef,
    prevFeedGenerationRef,
    feedInteractionEpoch,
  ]);

  useEffect(() => {
    if (!isFocused || !preferences || !hasForYouTopics || isLoading) return;
    if (rebuildForYouDisplay().length > 0) return;

    const sourceIds = sourceIdsForForYouInterests(preferences);
    if (sourceIds.length === 0) return;

    const boostKey = `${personalizationKey}\0${articles.length}`;
    if (interestBoostKeyRef.current === boostKey) return;
    interestBoostKeyRef.current = boostKey;
    void boostArticlesForInterests(sourceIds, boostKey);
  }, [
    isFocused,
    preferences,
    hasForYouTopics,
    isLoading,
    personalizationKey,
    articles.length,
    rebuildForYouDisplay,
    boostArticlesForInterests,
  ]);

  useDeferAfterFocus(
    isFocused,
    () => {
      if (isFeedInteractionLocked()) return;
      syncDisplayHandledRef.current = false;
      if (!hasForYouTopics || !preferences) {
        return;
      }

      if (isForYouCacheFresh) {
        prevRawLengthRef.current = articles.length;
        prevFeedGenerationRef.current = feedGeneration;
        return;
      }

      startTransition(() => {
        const filtered = filterForYouFeedArticles(articles);
        const ranked = getForYouFeed(filtered, preferences);
        const generationChanged = feedGeneration !== prevFeedGenerationRef.current;

        if (generationChanged || prevRawLengthRef.current === 0) {
          syncDisplayHandledRef.current = true;
          if (shouldAllowFullRebuild(false, '', '')) {
            setDisplayArticles(ranked);
            markInitialDisplay();
            prevFeedGenerationRef.current = feedGeneration;
          } else {
            setDisplayArticles((prev) => updateDisplayArticlesInPlace(prev, ranked));
          }
          setDisplayReady(true);
        } else if (articles.length > prevRawLengthRef.current) {
          syncDisplayHandledRef.current = true;
          setDisplayArticles((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            const newOnly = ranked.filter((a) => !seen.has(a.id));
            return mergePaginatedDisplayFeed(prev, newOnly, ranked, (items) => items);
          });
          setDisplayReady(true);
        }

        prevRawLengthRef.current = articles.length;

        if (syncDisplayHandledRef.current) return;

        setDisplayArticles((prev) => {
          if (prev.length === 0 && ranked.length > 0) {
            return ranked;
          }

          if (!shouldAllowSilentMerge()) {
            return updateDisplayArticlesInPlace(prev, ranked);
          }

          const prevIds = new Set(prev.map((article) => article.id));
          const newOnly = ranked.filter((article) => !prevIds.has(article.id));
          if (newOnly.length > 0) {
            return insertDisplayNewcomersAtSourceOrder(prev, newOnly, ranked);
          }

          return updateDisplayArticlesInPlace(prev, ranked);
        });
        setDisplayReady(true);
      });
    },
    [
      articles,
      feedGeneration,
      filterForYouFeedArticles,
      isForYouCacheFresh,
      preferences,
      hasForYouTopics,
      markInitialDisplay,
      shouldAllowFullRebuild,
      shouldAllowSilentMerge,
      setDisplayArticles,
      setDisplayReady,
      prevFeedGenerationRef,
      prevRawLengthRef,
      feedInteractionEpoch,
    ],
    'paint',
  );

  useEffect(() => {
    if (!isFocused || !displayReady) {
      setEmptyMessage(undefined);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      startTransition(() => {
        if (cancelled) return;

        const filtered = filterFeedArticles(articles);
        setEmptyMessage(
          getForYouEmptyMessage({
            error,
            totalCount: articles.length,
            filteredCount: showableArticles.length,
            sourceFilteredCount: filtered.length,
            enabledTopics: preferences?.enabledTopics,
            enabledSportTags: preferences?.enabledSportTags,
            sourcesRestricted:
              !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
            usingDemoArticles,
            hasForYouTopics,
          }),
        );
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    isFocused,
    displayReady,
    error,
    articles.length,
    showableArticles.length,
    preferences?.enabledTopics,
    preferences?.enabledSportTags,
    preferences?.enabledSourceIds,
    usingDemoArticles,
    hasForYouTopics,
    filterFeedArticles,
    articles,
    preferences,
  ]);

  const headerExtra = useMemo(
    () => <ForYouTopicPicker articles={articles} />,
    [articles],
  );

  return (
    <ArticleFeedScreen
      articles={showableArticles}
      title="For You"
      emptyMessage={emptyMessage}
      headerExtra={headerExtra}
      isLoading={isLoading || (isPreferencesLoading && !preferencesReady)}
      isRefreshing={isRefreshing}
      error={error}
      notice={notice}
      onRefresh={refresh}
      onFeedClick={recordFeedClick}
    />
  );
}

export default memo(function ForYouScreen() {
  return <ForYouScreenContent />;
});
