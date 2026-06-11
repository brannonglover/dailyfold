import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArticleFeedHandle } from '@/components/ArticleFeed';
import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { BrandLogo } from '@/components/BrandLogo';
import { FeedTopicFilterBar } from '@/components/FeedTopicFilterBar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useDisplayOrderLock } from '@/hooks/useDisplayOrderLock';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { orderLatestFeed, orderLatestFeedPage } from '@/utils/feedOrdering';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
import { Article } from '@/types';
import { getFeedEmptyMessage } from '@/utils/feedEmptyMessage';

export default function LatestScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const feedRef = useRef<ArticleFeedHandle>(null);
  const {
    articles,
    feedGeneration,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    error,
    notice,
    usingDemoArticles,
    pendingCount,
    dismissPendingArticles,
    refresh,
    loadMore,
  } = useArticles();
  const { preferences, filterFeedArticles, filterByEnabledSources } = usePreferences();
  const [displayArticles, setDisplayArticles] = useState<Article[]>([]);
  const prevFeedGenerationRef = useRef(0);
  const prevRawLengthRef = useRef(0);
  const prevFilterKeyRef = useRef('');
  const syncDisplayHandledRef = useRef(false);
  const { markInitialDisplay, shouldAllowFullRebuild, shouldAllowSilentMerge, lockEpoch } =
    useDisplayOrderLock(isRefreshing);

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        topics: preferences?.enabledTopics ?? [],
        sports: preferences?.enabledSportTags ?? [],
        sources: preferences?.enabledSourceIds ?? [],
      }),
    [preferences?.enabledTopics, preferences?.enabledSportTags, preferences?.enabledSourceIds],
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('tabPress', () => {
        if (!navigation.isFocused()) return;
        void (async () => {
          await feedRef.current?.scrollToTop();
          await refresh();
        })();
      });
      return unsubscribe;
    }, [navigation, refresh]),
  );

  const orderOpts = useMemo(() => {
    const allTopics =
      !preferences ||
      isAllTopicsEnabled(normalizeFeedPreferences(preferences).enabledTopics);
    return { diversifyTopics: allTopics };
  }, [preferences]);

  useLayoutEffect(() => {
    syncDisplayHandledRef.current = false;
    const filteredArticles = filterFeedArticles(articles);
    const generationChanged = feedGeneration !== prevFeedGenerationRef.current;
    const listShrunk = articles.length < prevRawLengthRef.current;
    const filtersChanged = filterKey !== prevFilterKeyRef.current;
    const needsFullRebuild =
      generationChanged ||
      listShrunk ||
      filtersChanged ||
      prevRawLengthRef.current === 0;

    if (needsFullRebuild) {
      syncDisplayHandledRef.current = true;
      if (shouldAllowFullRebuild(filtersChanged, prevFilterKeyRef.current, filterKey)) {
        setDisplayArticles(orderLatestFeed(filteredArticles, orderOpts));
        markInitialDisplay();
        prevFeedGenerationRef.current = feedGeneration;
        prevFilterKeyRef.current = filterKey;
      } else {
        setDisplayArticles((prev) => updateDisplayArticlesInPlace(prev, filteredArticles));
      }
    } else if (articles.length > prevRawLengthRef.current) {
      syncDisplayHandledRef.current = true;
      setDisplayArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const newOnly = filteredArticles.filter((a) => !seen.has(a.id));
        return mergePaginatedDisplayFeed(prev, newOnly, filteredArticles, (items) =>
          orderLatestFeedPage(items, orderOpts),
        );
      });
    }

    prevRawLengthRef.current = articles.length;
  }, [
    articles,
    feedGeneration,
    filterFeedArticles,
    filterKey,
    orderOpts,
    markInitialDisplay,
    shouldAllowFullRebuild,
  ]);

  useEffect(() => {
    if (syncDisplayHandledRef.current) return;

    const filteredArticles = filterFeedArticles(articles);
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
  }, [
    articles,
    feedGeneration,
    filterFeedArticles,
    filterKey,
    lockEpoch,
    orderOpts,
    shouldAllowSilentMerge,
  ]);

  const filtered = displayArticles;

  const sourceFiltered = useMemo(
    () => filterByEnabledSources(articles),
    [articles, filterByEnabledSources],
  );

  const emptyMessage = useMemo(
    () =>
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
    [
      error,
      articles.length,
      filtered.length,
      sourceFiltered.length,
      preferences?.enabledTopics,
      preferences?.enabledSportTags,
      preferences?.enabledSourceIds,
      usingDemoArticles,
    ],
  );

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
      onRefresh={refresh}
      onLoadMore={hasMore ? loadMore : undefined}
      isLoadingMore={isLoadingMore}
      loadMoreCursor={articles.length}
      pendingCount={pendingCount}
      pendingRefreshHint="pull down or tap Latest"
      onDismissPending={dismissPendingArticles}
      headerExtra={<FeedTopicFilterBar />}
      layout="newspaper"
    />
  );
}

