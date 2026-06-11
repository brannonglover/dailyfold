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
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { isAllTopicsEnabled } from '@/services/topicPreferences';
import { orderLatestFeed, orderLatestFeedPage } from '@/utils/feedOrdering';
import { mergePaginatedDisplayFeed } from '@/utils/mergeDisplayFeed';
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

  useLayoutEffect(() => {
    const filteredArticles = filterFeedArticles(articles);
    const allTopics =
      !preferences ||
      isAllTopicsEnabled(normalizeFeedPreferences(preferences).enabledTopics);
    const orderOpts = { diversifyTopics: allTopics };

    const generationChanged = feedGeneration !== prevFeedGenerationRef.current;
    const listShrunk = articles.length < prevRawLengthRef.current;
    const filtersChanged = filterKey !== prevFilterKeyRef.current;

    const needsFullRebuild =
      generationChanged ||
      listShrunk ||
      filtersChanged ||
      prevRawLengthRef.current === 0;

    if (needsFullRebuild) {
      setDisplayArticles(orderLatestFeed(filteredArticles, orderOpts));
      prevFeedGenerationRef.current = feedGeneration;
      prevFilterKeyRef.current = filterKey;
    } else if (articles.length > prevRawLengthRef.current) {
      setDisplayArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const newOnly = filteredArticles.filter((a) => !seen.has(a.id));
        return mergePaginatedDisplayFeed(prev, newOnly, filteredArticles, (items) =>
          orderLatestFeedPage(items, orderOpts),
        );
      });
    } else if (prevRawLengthRef.current > 0) {
      setDisplayArticles((prev) => {
        if (prev.length === 0 && filteredArticles.length > 0) {
          return orderLatestFeed(filteredArticles, orderOpts);
        }
        const byId = new Map(filteredArticles.map((a) => [a.id, a]));
        let changed = false;
        const next = prev
          .filter((a) => byId.has(a.id))
          .map((a) => {
            const updated = byId.get(a.id)!;
            if (updated !== a) changed = true;
            return updated;
          });
        return changed || next.length !== prev.length ? next : prev;
      });
    }

    prevRawLengthRef.current = articles.length;
  }, [articles, feedGeneration, filterFeedArticles, preferences, filterKey]);

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
      pendingCount={pendingCount}
      pendingRefreshHint="pull down or tap Latest"
      onDismissPending={dismissPendingArticles}
      headerExtra={<FeedTopicFilterBar />}
      layout="newspaper"
    />
  );
}

