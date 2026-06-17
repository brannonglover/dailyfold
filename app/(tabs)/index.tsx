import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { InteractionManager } from 'react-native';
import { ArticleFeedHandle } from '@/components/ArticleFeed';
import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { BrandLogo } from '@/components/BrandLogo';
import { FeedTopicFilterBar } from '@/components/FeedTopicFilterBar';
import { TabFocusGate } from '@/components/TabFocusGate';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useDeferAfterFocus } from '@/hooks/useDeferAfterFocus';
import { useDisplayOrderLock } from '@/hooks/useDisplayOrderLock';
import { useTabDisplayState } from '@/hooks/useTabDisplayState';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { orderLatestFeed, orderLatestFeedPage } from '@/utils/feedOrdering';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
import { getFeedEmptyMessage } from '@/utils/feedEmptyMessage';
import { prewarmForYouDisplayCache } from '@/utils/forYouPrewarm';

function LatestScreenContent() {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const feedRef = useRef<ArticleFeedHandle>(null);
  const {
    articles,
    feedGeneration,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    paginationRevision,
    error,
    notice,
    usingDemoArticles,
    dismissPendingArticles,
    pendingCountForFeed,
    prunePendingInFeed,
    refresh,
    applyPending,
    loadMore,
  } = useArticles();
  const { preferences, filterFeedArticles, filterByEnabledSources, recordFeedClick } = usePreferences();
  const [emptyMessage, setEmptyMessage] = useState<string | undefined>();
  const syncDisplayHandledRef = useRef(false);
  const wasFocusedOnTabPressRef = useRef(false);
  const isFocused = useIsFocused();

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        topics: preferences?.enabledTopics ?? [],
        sports: preferences?.enabledSportTags ?? [],
        sources: preferences?.enabledSourceIds ?? [],
      }),
    [preferences?.enabledTopics, preferences?.enabledSportTags, preferences?.enabledSourceIds],
  );

  const {
    displayArticles,
    displayReady,
    feedGenerationRef: prevFeedGenerationRef,
    rawLengthRef: prevRawLengthRef,
    filterKeyRef: prevFilterKeyRef,
    isCacheFresh,
    setDisplayArticles,
    setDisplayReady,
  } = useTabDisplayState('latest', filterKey);

  const { markInitialDisplay, markUserRebuild, shouldAllowFullRebuild, shouldAllowSilentMerge } =
    useDisplayOrderLock(isRefreshing, 'latest');

  const handleRefresh = useCallback(async () => {
    markUserRebuild();
    await refresh();
  }, [markUserRebuild, refresh]);

  const handleApplyPending = useCallback(async () => {
    markUserRebuild();
    await applyPending();
  }, [markUserRebuild, applyPending]);

  useFocusEffect(
    useCallback(() => {
      wasFocusedOnTabPressRef.current = true;
      return () => {
        wasFocusedOnTabPressRef.current = false;
      };
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('tabPress', () => {
        // Only scroll-to-top + refresh when Latest was already focused (re-tap).
        if (!wasFocusedOnTabPressRef.current) return;
        void feedRef.current?.scrollToTop();
        InteractionManager.runAfterInteractions(() => {
          void handleRefresh();
        });
      });
      return unsubscribe;
    }, [navigation, handleRefresh]),
  );

  const orderOpts = useMemo(() => {
    const allTopics =
      !preferences ||
      isAllTopicsEnabled(normalizeFeedPreferences(preferences).enabledTopics);
    return { diversifyTopics: allTopics };
  }, [preferences]);

  useEffect(() => {
    if (!isFocused || !preferences || articles.length === 0) return;

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      prewarmForYouDisplayCache(articles, preferences, feedGeneration, filterFeedArticles);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [isFocused, articles, preferences, feedGeneration, filterFeedArticles]);

  useDeferAfterFocus(
    isFocused,
    () => {
      syncDisplayHandledRef.current = false;
      if (articles.length === 0) {
        startTransition(() => {
          setDisplayArticles([]);
          setDisplayReady(false);
          prevRawLengthRef.current = 0;
        });
        return;
      }

      if (isCacheFresh(feedGeneration, articles.length, filterKey)) {
        prevRawLengthRef.current = articles.length;
        if (!displayReady && displayArticles.length > 0) {
          setDisplayReady(true);
        }
        return;
      }

      const filteredArticles = filterFeedArticles(articles);
      const generationChanged = feedGeneration !== prevFeedGenerationRef.current;
      const listShrunk = articles.length < prevRawLengthRef.current;
      const filtersChanged = filterKey !== prevFilterKeyRef.current;
      const needsFullRebuild =
        generationChanged ||
        listShrunk ||
        filtersChanged ||
        prevRawLengthRef.current === 0;

      const applyDisplay = (updater: () => void) => {
        startTransition(updater);
      };

      if (needsFullRebuild) {
        syncDisplayHandledRef.current = true;
        applyDisplay(() => {
          if (shouldAllowFullRebuild(filtersChanged, prevFilterKeyRef.current, filterKey)) {
            setDisplayArticles(orderLatestFeed(filteredArticles, orderOpts));
            markInitialDisplay();
            prevFeedGenerationRef.current = feedGeneration;
            prevFilterKeyRef.current = filterKey;
          } else {
            setDisplayArticles((prev) => updateDisplayArticlesInPlace(prev, filteredArticles));
          }
          setDisplayReady(true);
        });
      } else if (articles.length > prevRawLengthRef.current) {
        syncDisplayHandledRef.current = true;
        applyDisplay(() => {
          setDisplayArticles((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            const newOnly = filteredArticles.filter((a) => !seen.has(a.id));
            return mergePaginatedDisplayFeed(prev, newOnly, filteredArticles, (items) =>
              orderLatestFeedPage(items, orderOpts),
            );
          });
          setDisplayReady(true);
        });
      }

      prevRawLengthRef.current = articles.length;

      if (syncDisplayHandledRef.current) return;

      applyDisplay(() => {
        setDisplayArticles((prev) => {
          if (prev.length === 0 && filteredArticles.length > 0) {
            return orderLatestFeed(filteredArticles, orderOpts);
          }

          if (!shouldAllowSilentMerge()) {
            return updateDisplayArticlesInPlace(prev, filteredArticles);
          }

          const prevIds = new Set(prev.map((article) => article.id));
          const newOnly = filteredArticles.filter((article) => !prevIds.has(article.id));
          if (newOnly.length > 0) {
            return insertDisplayNewcomersAtSourceOrder(prev, newOnly, filteredArticles);
          }

          return updateDisplayArticlesInPlace(prev, filteredArticles);
        });
      });
    },
    [
      articles,
      displayArticles.length,
      displayReady,
      feedGeneration,
      filterFeedArticles,
      filterKey,
      isCacheFresh,
      orderOpts,
      markInitialDisplay,
      shouldAllowFullRebuild,
      shouldAllowSilentMerge,
    ],
  );

  const filtered = useMemo(() => {
    if (displayArticles.length > 0) return displayArticles;
    if (articles.length === 0) return [];
    return [];
  }, [displayArticles, articles.length]);

  const visiblePendingCount = useMemo(
    () => pendingCountForFeed(filtered),
    [pendingCountForFeed, filtered],
  );

  useEffect(() => {
    if (filtered.length === 0) return;
    prunePendingInFeed(filtered);
  }, [filtered, prunePendingInFeed]);

  useEffect(() => {
    if (!isFocused || !displayReady) {
      setEmptyMessage(undefined);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const sourceFiltered = filterByEnabledSources(articles);
      setEmptyMessage(
        getFeedEmptyMessage({
          error,
          totalCount: articles.length,
          filteredCount: filtered.length,
          sourceFilteredCount: sourceFiltered.length,
          enabledTopics: preferences?.enabledTopics,
          enabledSportTags: preferences?.enabledSportTags,
          sourcesRestricted:
            !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
          usingDemoArticles,
        }),
      );
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    isFocused,
    displayReady,
    error,
    articles,
    filtered.length,
    preferences?.enabledTopics,
    preferences?.enabledSportTags,
    preferences?.enabledSourceIds,
    usingDemoArticles,
    filterByEnabledSources,
  ]);

  const isBuildingFeed =
    isFocused && !displayReady && displayArticles.length === 0 && articles.length > 0;

  return (
    <ArticleFeedScreen
      ref={feedRef}
      articles={filtered}
      title="Latest"
      titleTrailing={<BrandLogo />}
      emptyMessage={emptyMessage}
      isLoading={isLoading || isBuildingFeed}
      isRefreshing={isRefreshing}
      error={error}
      notice={notice}
      onRefresh={handleRefresh}
      onApplyPending={handleApplyPending}
      onLoadMore={loadMore}
      canLoadMore={hasMore}
      isLoadingMore={isLoadingMore}
      loadMoreCursor={articles.length}
      loadMoreEpoch={paginationRevision}
      pendingCount={visiblePendingCount}
      pendingRefreshHint="tap to show"
      onDismissPending={dismissPendingArticles}
      headerExtra={<FeedTopicFilterBar />}
      layout="newspaper"
      onFeedClick={recordFeedClick}
    />
  );
}

export default memo(function LatestScreen() {
  return (
    <TabFocusGate>
      <LatestScreenContent />
    </TabFocusGate>
  );
});

