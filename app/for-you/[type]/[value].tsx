import { Stack, useLocalSearchParams } from 'expo-router';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';

import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useTheme } from '@/hooks/useTheme';
import {
  ForYouInterestKind,
  getSingleInterestForYouFeed,
} from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { Article, Topic, SportTag, UserPreferences } from '@/types';
import { getForYouEmptyMessage } from '@/utils/feedEmptyMessage';
import {
  buildForYouInterestFeedCacheKey,
  buildQuickInterestFeedPreview,
  hasShowableForYouInterestFeedCache,
  isForYouInterestFeedRevalidating,
  prewarmForYouInterestFeedCache,
  resolveForYouInterestFeedArticles,
} from '@/utils/forYouInterestFeedCache';
import { formatInterestLabel } from '@/utils/interestKeywords';
import { sourceIdsForForYouInterests } from '@/utils/forYouInterestSources';

function parseInterestKind(type: string | string[] | undefined): ForYouInterestKind | null {
  const raw = Array.isArray(type) ? type[0] : type;
  if (raw === 'topic' || raw === 'keyword' || raw === 'sportTag') return raw;
  return null;
}

function parseInterestValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function interestTitle(kind: ForYouInterestKind, value: string): string {
  switch (kind) {
    case 'topic':
      return CURIOSITY_LABELS[value as Topic] ?? formatInterestLabel(value);
    case 'keyword':
      return formatInterestLabel(value);
    case 'sportTag':
      return SPORT_TAG_LABELS[value as SportTag] ?? formatInterestLabel(value);
  }
}

function syntheticPrefsForInterest(
  prefs: UserPreferences,
  kind: ForYouInterestKind,
  value: string,
): UserPreferences {
  return {
    ...prefs,
    forYouTopics: kind === 'topic' ? [value as Topic] : [],
    forYouKeywords: kind === 'keyword' ? [value] : [],
    forYouSportTags: kind === 'sportTag' ? [value as SportTag] : [],
  };
}

export default function ForYouInterestFeedScreen() {
  const { type, value: rawValue } = useLocalSearchParams<{
    type: string | string[];
    value: string | string[];
  }>();
  const { colors } = useTheme();
  const kind = parseInterestKind(type);
  const value = parseInterestValue(rawValue);
  const { preferences, filterForYouFeedArticles, recordFeedClick } = usePreferences();
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
    refresh,
    loadMore,
    boostArticlesForInterests,
  } = useArticles();

  const title = kind && value ? interestTitle(kind, value) : 'For You';
  const cacheKey =
    kind && value ? buildForYouInterestFeedCacheKey(kind, value) : '';
  const interestBoostKeyRef = useRef('');
  const rankTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(
    null,
  );

  // Paint cached rows on first frame — resolve reads module cache before ranking finishes.
  const [rankedArticles, setRankedArticles] = useState<Article[]>([]);
  const [isRevalidating, setIsRevalidating] = useState(false);
  const [emptyMessage, setEmptyMessage] = useState<string | undefined>();

  useEffect(() => {
    setRankedArticles([]);
    interestBoostKeyRef.current = '';
  }, [cacheKey]);

  const hasCachedFeed = useMemo(
    () => (cacheKey ? hasShowableForYouInterestFeedCache(cacheKey) : false),
    [cacheKey],
  );

  const quickPreview = useMemo(() => {
    if (hasCachedFeed || !kind || !value || articles.length === 0) return [];
    return buildQuickInterestFeedPreview(articles, kind, value, filterForYouFeedArticles);
  }, [hasCachedFeed, articles, kind, value, filterForYouFeedArticles]);

  useEffect(() => {
    if (!kind || !value) {
      setRankedArticles([]);
      return;
    }

    let cancelled = false;
    rankTaskRef.current?.cancel();
    rankTaskRef.current = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const filtered = filterForYouFeedArticles(articles);
      const ranked = getSingleInterestForYouFeed(filtered, kind, value, {
        interestKeywords: preferences?.forYouKeywords,
      });
      startTransition(() => {
        if (!cancelled) setRankedArticles(ranked);
      });
    });

    return () => {
      cancelled = true;
      rankTaskRef.current?.cancel();
    };
  }, [articles, kind, value, filterForYouFeedArticles, preferences?.forYouKeywords]);

  const feedArticles = useMemo(() => {
    if (!cacheKey) return [];
    return resolveForYouInterestFeedArticles({
      key: cacheKey,
      feedGeneration,
      rawLength: articles.length,
      computed: rankedArticles,
      preview: quickPreview,
      allowStaleDuringLoad: isLoading,
    });
  }, [cacheKey, feedGeneration, articles.length, rankedArticles, quickPreview, isLoading]);

  useEffect(() => {
    if (!cacheKey) {
      setIsRevalidating(false);
      return;
    }
    setIsRevalidating(
      isForYouInterestFeedRevalidating({
        key: cacheKey,
        feedGeneration,
        rawLength: articles.length,
        computedLength: rankedArticles.length,
      }),
    );
  }, [cacheKey, feedGeneration, articles.length, rankedArticles.length]);

  useEffect(() => {
    if (!kind || !value || articles.length === 0) return;
    prewarmForYouInterestFeedCache(
      articles,
      kind,
      value,
      filterForYouFeedArticles,
      feedGeneration,
    );
  }, [articles, kind, value, filterForYouFeedArticles, feedGeneration]);

  useEffect(() => {
    if (!kind || !value || !preferences || isLoading) return;
    if (rankedArticles.length > 0) return;
    if (cacheKey && hasShowableForYouInterestFeedCache(cacheKey)) return;

    const sourceIds = sourceIdsForForYouInterests(
      syntheticPrefsForInterest(preferences, kind, value),
    );
    if (sourceIds.length === 0) return;

    const boostKey = `${kind}\0${value}\0${articles.length}`;
    if (interestBoostKeyRef.current === boostKey) return;
    interestBoostKeyRef.current = boostKey;
    void boostArticlesForInterests(sourceIds, boostKey);
  }, [
    kind,
    value,
    preferences,
    isLoading,
    rankedArticles.length,
    articles.length,
    cacheKey,
    boostArticlesForInterests,
  ]);

  useEffect(() => {
    if (!kind || !value) {
      setEmptyMessage('This interest link is invalid.');
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const filtered = filterForYouFeedArticles(articles);
      setEmptyMessage(
        getForYouEmptyMessage({
          error,
          totalCount: articles.length,
          filteredCount: feedArticles.length,
          sourceFilteredCount: filtered.length,
          enabledTopics: preferences?.enabledTopics,
          enabledSportTags: preferences?.enabledSportTags,
          sourcesRestricted: !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
          usingDemoArticles,
          hasForYouTopics: true,
        }),
      );
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    kind,
    value,
    error,
    articles,
    feedArticles.length,
    filterForYouFeedArticles,
    preferences?.enabledTopics,
    preferences?.enabledSportTags,
    preferences?.enabledSourceIds,
    usingDemoArticles,
    preferences,
  ]);

  const showFeedLoading = isLoading && feedArticles.length === 0;

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerBackTitle: 'For You',
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
        }}
      />
      <ArticleFeedScreen
        articles={feedArticles}
        title={title}
        hideFeedHeader
        emptyMessage={emptyMessage}
        isLoading={showFeedLoading}
        isRefreshing={isRefreshing || isRevalidating}
        error={error}
        notice={notice}
        onRefresh={refresh}
        onLoadMore={loadMore}
        canLoadMore={hasMore}
        isLoadingMore={isLoadingMore}
        loadMoreCursor={articles.length}
        loadMoreEpoch={paginationRevision}
        onFeedClick={recordFeedClick}
        layout="newspaper"
      />
    </>
  );
}
