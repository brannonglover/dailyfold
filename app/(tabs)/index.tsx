import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

  useEffect(() => {
    const filteredArticles = filterFeedArticles(articles);
    const allTopics =
      !preferences ||
      isAllTopicsEnabled(normalizeFeedPreferences(preferences).enabledTopics);
    const orderOpts = { diversifyTopics: allTopics };

    const generationChanged = feedGeneration !== prevFeedGenerationRef.current;
    const listShrunk = articles.length < prevRawLengthRef.current;
    const filtersChanged = filterKey !== prevFilterKeyRef.current;

    if (
      generationChanged ||
      listShrunk ||
      filtersChanged ||
      prevRawLengthRef.current === 0
    ) {
      setDisplayArticles(orderLatestFeed(filteredArticles, orderOpts));
      prevFeedGenerationRef.current = feedGeneration;
      prevFilterKeyRef.current = filterKey;
    } else if (articles.length > prevRawLengthRef.current) {
      setDisplayArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const newOnly = filteredArticles.filter((a) => !seen.has(a.id));
        if (newOnly.length === 0) return prev;
        return [...prev, ...orderLatestFeedPage(newOnly, orderOpts)];
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
      headerExtra={<FeedTopicFilterBar />}
    />
  );
}

