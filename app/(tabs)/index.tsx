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
import { isAllSportTagsEnabled, isSportsTopicActive } from '@/services/sportPreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { Article } from '@/types';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  sliceOrderedArticles,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
import { getFeedEmptyMessage } from '@/utils/feedEmptyMessage';
import { isFeedInteractionLocked, subscribeFeedInteractionLock } from '@/utils/feedInteractionLock';
import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from '@/utils/feedLoadMoreGate';
import { sportTagSourceIds, topicSourceIds } from '@/utils/forYouInterestSources';
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
    boostArticlesForInterests,
  } = useArticles();
  const {
    preferences,
    filterFeedArticles,
    filterFeedArticlesBase,
    filterForYouFeedArticles,
    filterByEnabledSources,
    recordFeedClick,
  } = usePreferences();
  const [emptyMessage, setEmptyMessage] = useState<string | undefined>();
  const syncDisplayHandledRef = useRef(false);
  const wasFocusedOnTabPressRef = useRef(false);
  const chipBoostKeyRef = useRef('');
  const [feedInteractionEpoch, setFeedInteractionEpoch] = useState(0);
  const isFocused = useIsFocused();
  // Full "all chips" ranked order, recomputed only when the underlying article set or
  // personalization changes. Chip-only toggles slice this instead of re-ranking from
  // scratch, since a chip flip doesn't change the raw articles or their earned order.
  const fullOrderRef = useRef<Article[]>([]);
  const fullOrderRawLengthRef = useRef(-1);

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

  // Always diversified (as if all chips were on) so any single chip's order can be
  // derived by slicing this — interleaveByPrimaryTopic interleaves per-topic queues
  // that are themselves source-interleaved, so filtering it down to one topic yields
  // the same order as ranking that topic's articles directly.
  const orderFullLatest = useCallback(
    (items: Article[]) => getLatestFeed(items, orderOpts.prefs, { diversifyTopics: true }),
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
    if (syncDisplayHandledRef.current) return;

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
    // Only skip once displayArticles has caught up with everything upstream has found —
    // when both are 0 (a chip with no matches yet) this must NOT bail, or a narrow filter
    // with zero current matches never triggers the fetch that could find more.
    if (upstream.length > 0 && upstream.length <= displayArticles.length) return;
    console.log('[chipDebug] auto-top-up loadMore firing', { upstreamLen: upstream.length, displayLen: displayArticles.length });
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

  // Selecting a chip (topic or sport tag) should feel like a deliberate pull for that
  // content, not something the reader has to manually pull-to-refresh into. A narrow
  // selection can be a thin slice of the overall feed — generic date-ordered pagination
  // can take many pages to surface enough matches — so fetch directly from the sources
  // for the current selection every time it changes, rather than waiting on an
  // understock check that only fires when the existing pool already looks thin.
  useEffect(() => {
    if (!isFocused || !preferences || isLoading) return;
    const { enabledTopics, enabledSportTags } = preferences;

    const narrowSportTagActive =
      isSportsTopicActive(enabledTopics) && !isAllSportTagsEnabled(enabledSportTags);

    const sourceIds = narrowSportTagActive
      ? sportTagSourceIds(enabledSportTags)
      : !isAllTopicsEnabled(enabledTopics)
        ? topicSourceIds(enabledTopics)
        : [];
    if (sourceIds.length === 0) return;

    // Keyed on the selection + feedGeneration (bumped by every initial/refresh load), not
    // articles.length — a pull-to-refresh replaces the article list wholesale (services/
    // articles.ts) and can coincidentally land on the same length, which would wrongly
    // look like "already pulled for this selection".
    const boostKey = `chip\0${enabledTopics.join(',')}\0${enabledSportTags.join(',')}\0${feedGeneration}`;
    if (chipBoostKeyRef.current === boostKey) return;
    chipBoostKeyRef.current = boostKey;
    void boostArticlesForInterests(sourceIds, boostKey);
  }, [isFocused, preferences, isLoading, feedGeneration, boostArticlesForInterests]);

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
      console.log('[chipDebug] effect fired', {
        filterKey,
        locked: isFeedInteractionLocked(),
        articlesLen: articles.length,
      });
      if (isFeedInteractionLocked()) {
        console.log('[chipDebug] bail: interaction locked');
        return;
      }
      const handledSyncPagination = syncDisplayHandledRef.current;
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

      console.log('[chipDebug] isCacheFresh?', isCacheFresh(feedGeneration, articles.length, filterKey));
      if (isCacheFresh(feedGeneration, articles.length, filterKey)) {
        const filteredArticles = filterFeedArticles(articles);
        const visibleCount =
          displayArticles.length > 0
            ? displayArticles.length
            : (readTabDisplayCache('latest')?.displayArticles.length ?? 0);
        const understocked = isDisplayFeedUnderstocked(visibleCount, filteredArticles.length);
        console.log('[chipDebug] cache-fresh branch', { visibleCount, filteredLen: filteredArticles.length, understocked });
        if (!understocked) {
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
          console.log('[chipDebug] bail: cache-fresh, not understocked');
          return;
        }
      }

      const filteredArticles = filterFeedArticles(articles);
      console.log('[chipDebug] filteredArticles computed', { count: filteredArticles.length });
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
      console.log('[chipDebug] rebuild decision', {
        needsFullRebuild,
        generationChanged,
        listShrunk,
        filtersChanged,
        personalizationChanged,
      });

      const applyDisplay = (updater: () => void) => {
        startTransition(updater);
      };

      // A chip-only toggle doesn't change the raw articles, personalization, or their
      // earned order — slice the last full ranking instead of re-ranking from scratch.
      const canSliceFullOrder =
        filtersChanged &&
        !generationChanged &&
        !listShrunk &&
        !personalizationChanged &&
        articles.length === fullOrderRawLengthRef.current;
      console.log('[chipDebug] canSliceFullOrder', {
        canSliceFullOrder,
        articlesLen: articles.length,
        fullOrderRawLen: fullOrderRawLengthRef.current,
      });

      const rankFilteredArticles = () => {
        if (canSliceFullOrder) {
          const sliced = sliceOrderedArticles(fullOrderRef.current, filteredArticles);
          if (sliced) {
            console.log('[chipDebug] fast slice path used', { count: sliced.length });
            return sliced;
          }
          console.log('[chipDebug] slice returned null, falling back to full rank');
        }
        const start = Date.now();
        const baseArticles = filterFeedArticlesBase(articles);
        fullOrderRef.current = orderFullLatest(baseArticles);
        fullOrderRawLengthRef.current = articles.length;
        const result = sliceOrderedArticles(fullOrderRef.current, filteredArticles) ?? orderLatest(filteredArticles);
        console.log('[chipDebug] full rank path used', { ms: Date.now() - start, count: result.length });
        return result;
      };

      if (needsFullRebuild) {
        syncDisplayHandledRef.current = true;
        console.log('[chipDebug] entering needsFullRebuild, shouldAllowFullRebuild=', shouldAllowFullRebuild(filtersChanged, prevFilterKeyRef.current, filterKey));
        applyDisplay(() => {
          if (shouldAllowFullRebuild(filtersChanged, prevFilterKeyRef.current, filterKey)) {
            const ranked = rankFilteredArticles();
            console.log('[chipDebug] setDisplayArticles (full rebuild)', { count: ranked.length });
            setDisplayArticles(ranked);
            markInitialDisplay();
            prevFeedGenerationRef.current = feedGeneration;
            prevFilterKeyRef.current = filterKey;
            prevPersonalizationKeyRef.current = personalizationKey;
          } else {
            console.log('[chipDebug] shouldAllowFullRebuild=false, using updateDisplayArticlesInPlace (no new rows added)');
            setDisplayArticles((prev) => updateDisplayArticlesInPlace(prev, filteredArticles));
          }
          setDisplayReady(true);
        });
      } else if (!handledSyncPagination && articles.length > prevRawLengthRef.current) {
        console.log('[chipDebug] taking append/pagination branch instead of rebuild');
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

      if (handledSyncPagination || syncDisplayHandledRef.current) return;

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
      filterFeedArticlesBase,
      filterKey,
      isCacheFresh,
      orderLatest,
      orderFullLatest,
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

  return (
    <ArticleFeedScreen
      ref={feedRef}
      articles={filtered}
      title="Latest"
      titleTrailing={<BrandLogo />}
      emptyMessage={emptyMessage}
      isLoading={isLoading}
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
      layout="fold"
      onFeedClick={recordFeedClick}
    />
  );
}

export default memo(function LatestScreen() {
  return <LatestScreenContent />;
});

