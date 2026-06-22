import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, memo } from 'react';
import { InteractionManager } from 'react-native';
import { ArticleFeedHandle } from '@/components/ArticleFeed';
import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { BrandLogo } from '@/components/BrandLogo';
import { FeedTopicFilterBar } from '@/components/FeedTopicFilterBar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useDeferAfterFocus } from '@/hooks/useDeferAfterFocus';
import { useDisplayOrderLock } from '@/hooks/useDisplayOrderLock';
import { useTabDisplayState } from '@/hooks/useTabDisplayState';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { getLatestFeed, buildLatestPersonalizationKey } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { Article } from '@/types';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
import { getFeedEmptyMessage } from '@/utils/feedEmptyMessage';
import { isFeedInteractionLocked, subscribeFeedInteractionLock } from '@/utils/feedInteractionLock';
import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from '@/utils/feedLoadMoreGate';
import { prewarmForYouDisplayCache } from '@/utils/forYouPrewarm';
import { readTabDisplayCache, resolveTabDisplayFeed, hasShowableTabDisplayCache, isDisplayFeedUnderstocked } from '@/utils/tabDisplayCache';

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
  const { preferences, filterFeedArticles, filterForYouFeedArticles, filterByEnabledSources, recordFeedClick } = usePreferences();
  const [emptyMessage, setEmptyMessage] = useState<string | undefined>();
  const syncDisplayHandledRef = useRef(false);
  const wasFocusedOnTabPressRef = useRef(false);
  const [feedInteractionEpoch, setFeedInteractionEpoch] = useState(0);
  const isFocused = useIsFocused();

  useEffect(() => subscribeFeedInteractionLock(() => setFeedInteractionEpoch((n) => n + 1)), []);

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        topics: preferences?.enabledTopics ?? [],
        sports: preferences?.enabledSportTags ?? [],
        sources: preferences?.enabledSourceIds ?? [],
      }),
    [preferences?.enabledTopics, preferences?.enabledSportTags, preferences?.enabledSourceIds],
  );

  const personalizationKey = useMemo(
    () => buildLatestPersonalizationKey(preferences),
    [preferences?.likedArticleIds, preferences?.clickedArticleIds],
  );

  const prevPersonalizationKeyRef = useRef(personalizationKey);

  const {
    displayArticles,
    displayReady,
    feedGenerationRef: prevFeedGenerationRef,
    rawLengthRef: prevRawLengthRef,
    filterKeyRef: prevFilterKeyRef,
    isCacheFresh,
    setDisplayArticles,
    setDisplayReady,
  } = useTabDisplayState('latest', filterKey, {
    feedGeneration,
    rawLength: articles.length,
    personalizationKey,
  });

  const { markInitialDisplay, markUserRebuild, shouldAllowFullRebuild, shouldAllowSilentMerge } =
    useDisplayOrderLock(isRefreshing, 'latest');

  const orderOpts = useMemo(() => {
    const allTopics =
      !preferences ||
      isAllTopicsEnabled(normalizeFeedPreferences(preferences).enabledTopics);
    return {
      diversifyTopics: allTopics,
      prefs: preferences,
    };
  }, [preferences]);

  const orderLatest = useCallback(
    (items: Article[]) =>
      getLatestFeed(items, orderOpts.prefs, { diversifyTopics: orderOpts.diversifyTopics }),
    [orderOpts],
  );

  const orderLatestPage = useCallback(
    (items: Article[]) =>
      getLatestFeed(items, orderOpts.prefs, { diversifyTopics: orderOpts.diversifyTopics }),
    [orderOpts],
  );

  const handleRefresh = useCallback(async () => {
    markUserRebuild();
    await refresh();
  }, [markUserRebuild, refresh]);

  const handleApplyPending = useCallback(async () => {
    markUserRebuild();
    await applyPending();
  }, [markUserRebuild, applyPending]);

  useEffect(() => {
    if (isLoading && articles.length === 0) {
      if (hasShowableTabDisplayCache('latest')) return;
      setDisplayArticles([]);
      setDisplayReady(false);
      prevRawLengthRef.current = 0;
    }
  }, [isLoading, articles.length, setDisplayArticles, setDisplayReady, prevRawLengthRef]);

  useLayoutEffect(() => {
    if (!preferences || articles.length === 0) return;
    if (isFeedInteractionLocked()) return;
    if (articles.length <= prevRawLengthRef.current) return;
    if (feedGeneration !== prevFeedGenerationRef.current) return;
    if (filterKey !== prevFilterKeyRef.current) return;

    const filteredArticles = filterFeedArticles(articles);
    const seen = new Set(displayArticles.map((article) => article.id));
    const newOnly = filteredArticles.filter((article) => !seen.has(article.id));
    if (newOnly.length === 0) {
      prevRawLengthRef.current = articles.length;
      return;
    }

    syncDisplayHandledRef.current = true;
    setDisplayArticles((prev) =>
      mergePaginatedDisplayFeed(prev, newOnly, filteredArticles, orderLatestPage),
    );
    setDisplayReady(true);
    prevRawLengthRef.current = articles.length;
  }, [
    articles,
    displayArticles,
    feedGeneration,
    filterFeedArticles,
    filterKey,
    orderLatestPage,
    preferences,
    setDisplayArticles,
    setDisplayReady,
    prevFeedGenerationRef,
    prevFilterKeyRef,
    prevRawLengthRef,
    feedInteractionEpoch,
  ]);

  useEffect(() => {
    if (!isFocused || isLoading || isLoadingMore || !hasMore || !preferences) return;
    if (isFeedInteractionLocked()) return;

    const upstream = filterFeedArticles(articles);
    if (!isDisplayFeedUnderstocked(displayArticles.length, upstream.length)) return;

    const seen = new Set(displayArticles.map((article) => article.id));
    const newOnly = upstream.filter((article) => !seen.has(article.id));
    if (newOnly.length === 0) return;

    setDisplayArticles((prev) =>
      mergePaginatedDisplayFeed(prev, newOnly, upstream, orderLatestPage),
    );
    setDisplayReady(true);
    prevRawLengthRef.current = articles.length;
  }, [
    isFocused,
    isLoading,
    isLoadingMore,
    hasMore,
    preferences,
    articles,
    displayArticles,
    filterFeedArticles,
    orderLatestPage,
    setDisplayArticles,
    setDisplayReady,
    prevRawLengthRef,
    feedInteractionEpoch,
  ]);

  useEffect(() => {
    if (!isFocused || isLoading || isLoadingMore || !hasMore || !displayReady) return;
    const upstream = filterFeedArticles(articles);
    if (upstream.length >= MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION) return;
    if (upstream.length <= displayArticles.length) return;
    void loadMore();
  }, [
    isFocused,
    isLoading,
    isLoadingMore,
    hasMore,
    displayReady,
    articles,
    displayArticles.length,
    filterFeedArticles,
    loadMore,
  ]);

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

  useEffect(() => {
    if (!isFocused || !preferences || articles.length === 0) return;

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      prewarmForYouDisplayCache(articles, preferences, feedGeneration, filterForYouFeedArticles);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [isFocused, articles, preferences, feedGeneration, filterForYouFeedArticles]);

  useDeferAfterFocus(
    isFocused,
    () => {
      if (isFeedInteractionLocked()) return;
      syncDisplayHandledRef.current = false;
      if (articles.length === 0) {
        const cached = readTabDisplayCache('latest');
        if (cached && cached.displayArticles.length > 0 && cached.filterKey === filterKey) {
          if (cached.personalizationKey != null && cached.personalizationKey !== personalizationKey) {
            startTransition(() => {
              setDisplayArticles([]);
              setDisplayReady(false);
              prevRawLengthRef.current = 0;
            });
            return;
          }
          startTransition(() => {
            setDisplayArticles(cached.displayArticles);
            setDisplayReady(true);
            prevRawLengthRef.current = cached.rawLength;
            prevFeedGenerationRef.current = cached.feedGeneration;
            prevFilterKeyRef.current = cached.filterKey;
          });
          return;
        }
        startTransition(() => {
          setDisplayArticles([]);
          setDisplayReady(false);
          prevRawLengthRef.current = 0;
        });
        return;
      }

      if (isCacheFresh(feedGeneration, articles.length, filterKey)) {
        const filteredArticles = filterFeedArticles(articles);
        const visibleCount =
          displayArticles.length > 0
            ? displayArticles.length
            : (readTabDisplayCache('latest')?.displayArticles.length ?? 0);
        if (!isDisplayFeedUnderstocked(visibleCount, filteredArticles.length)) {
          prevRawLengthRef.current = articles.length;
          prevFeedGenerationRef.current = feedGeneration;
          prevFilterKeyRef.current = filterKey;
          const cached = readTabDisplayCache('latest');
          startTransition(() => {
            if (displayArticles.length === 0 && cached && cached.displayArticles.length > 0) {
              setDisplayArticles(cached.displayArticles);
            }
            setDisplayReady(true);
          });
          return;
        }
      }

      const filteredArticles = filterFeedArticles(articles);
      const generationChanged = feedGeneration !== prevFeedGenerationRef.current;
      const listShrunk = articles.length < prevRawLengthRef.current;
      const filtersChanged = filterKey !== prevFilterKeyRef.current;
      const personalizationChanged =
        personalizationKey !== prevPersonalizationKeyRef.current;
      const needsFullRebuild =
        generationChanged ||
        listShrunk ||
        filtersChanged ||
        personalizationChanged ||
        prevRawLengthRef.current === 0;

      const applyDisplay = (updater: () => void) => {
        startTransition(updater);
      };

      if (needsFullRebuild) {
        syncDisplayHandledRef.current = true;
        applyDisplay(() => {
          if (shouldAllowFullRebuild(filtersChanged, prevFilterKeyRef.current, filterKey)) {
            setDisplayArticles(orderLatest(filteredArticles));
            markInitialDisplay();
            prevFeedGenerationRef.current = feedGeneration;
            prevFilterKeyRef.current = filterKey;
            prevPersonalizationKeyRef.current = personalizationKey;
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
            return mergePaginatedDisplayFeed(prev, newOnly, filteredArticles, orderLatestPage);
          });
          setDisplayReady(true);
        });
      }

      prevRawLengthRef.current = articles.length;

      if (syncDisplayHandledRef.current) return;

      applyDisplay(() => {
        setDisplayArticles((prev) => {
          if (prev.length === 0 && filteredArticles.length > 0) {
            return orderLatest(filteredArticles);
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
        setDisplayReady(true);
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
      orderLatest,
      orderLatestPage,
      personalizationKey,
      markInitialDisplay,
      shouldAllowFullRebuild,
      shouldAllowSilentMerge,
      feedInteractionEpoch,
    ],
    'paint',
  );

  const filtered = useMemo(
    () =>
      resolveTabDisplayFeed({
        contextLoading: isLoading,
        displayArticles,
        displayReady,
        tabKey: 'latest',
        feedGeneration,
        rawLength: articles.length,
        filterKey,
        personalizationKey,
      }),
    [
      isLoading,
      displayArticles,
      displayReady,
      feedGeneration,
      articles.length,
      filterKey,
      personalizationKey,
    ],
  );

  useEffect(() => {
    if (!isFocused) return;
    if (filtered.length > 0 && !displayReady) {
      setDisplayReady(true);
    }
  }, [isFocused, filtered.length, displayReady, setDisplayReady]);

  const visiblePendingCount = useMemo(() => {
    if (isLoading || filtered.length === 0) return 0;
    return pendingCountForFeed(filtered);
  }, [isLoading, filtered, pendingCountForFeed]);

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
    isFocused && !isLoading && articles.length > 0 && filtered.length === 0;

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
  return <LatestScreenContent />;
});

