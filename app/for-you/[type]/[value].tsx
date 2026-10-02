import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { InterestSettingsModal } from '@/components/InterestSettingsModal';
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

function interestDescription(kind: ForYouInterestKind, value: string): string {
  const label = interestTitle(kind, value);
  switch (kind) {
    case 'topic':
      return `Stories and news related to ${label.toLowerCase()}.`;
    case 'keyword':
      return `Articles, news, and stories related to ${label.toLowerCase()}.`;
    case 'sportTag':
      return `The latest stories and updates for ${label}.`;
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

function InterestFeedHeader({
  title,
  description,
  onSettingsPress,
}: {
  title: string;
  description: string;
  onSettingsPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={[headerStyles.container, { borderBottomColor: colors.border }]}>
      <View style={headerStyles.titleRow}>
        <Text style={[headerStyles.title, { color: colors.text }]}>{title}</Text>
        <Pressable
          onPress={onSettingsPress}
          accessibilityRole="button"
          accessibilityLabel="Interest settings"
          hitSlop={12}
          style={({ pressed }) => pressed && headerStyles.pressed}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>
      <Text style={[headerStyles.description, { color: colors.textSecondary }]}>
        {description}
      </Text>
    </View>
  );
}

export default function ForYouInterestFeedScreen() {
  const { type, value: rawValue } = useLocalSearchParams<{
    type: string | string[];
    value: string | string[];
  }>();
  const { colors } = useTheme();
  const kind = parseInterestKind(type);
  const value = parseInterestValue(rawValue);
  const [settingsVisible, setSettingsVisible] = useState(false);
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
  const description = kind && value ? interestDescription(kind, value) : '';
  const cacheKey =
    kind && value ? buildForYouInterestFeedCacheKey(kind, value) : '';
  const interestBoostKeyRef = useRef('');
  const rankTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(
    null,
  );

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
      const noStories = feedArticles.length === 0 && !isLoading;
      setEmptyMessage(
        noStories
          ? `Nothing worth showing yet.\nWe'll keep looking for stories about ${title}.`
          : getForYouEmptyMessage({
              error,
              totalCount: articles.length,
              filteredCount: feedArticles.length,
              sourceFilteredCount: filtered.length,
              enabledTopics: preferences?.enabledTopics,
              enabledSportTags: preferences?.enabledSportTags,
              sourcesRestricted:
                !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
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
    title,
    error,
    articles,
    isLoading,
    feedArticles.length,
    filterForYouFeedArticles,
    preferences?.enabledTopics,
    preferences?.enabledSportTags,
    preferences?.enabledSourceIds,
    usingDemoArticles,
    preferences,
  ]);

  const showFeedLoading = isLoading && feedArticles.length === 0;

  const openSettings = useCallback(() => setSettingsVisible(true), []);
  const closeSettings = useCallback(() => setSettingsVisible(false), []);

  const headerExtra = useMemo(() => {
    if (!kind || !value) return null;
    return (
      <InterestFeedHeader
        title={title}
        description={description}
        onSettingsPress={openSettings}
      />
    );
  }, [kind, value, title, description, openSettings]);

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
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
        layout="fold"
        headerExtra={headerExtra}
      />
      {kind && value ? (
        <InterestSettingsModal
          visible={settingsVisible}
          onClose={closeSettings}
          kind={kind}
          value={value}
        />
      ) : null}
    </>
  );
}

const headerStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: 'LoraBold',
    fontSize: 24,
    letterSpacing: -0.3,
  },
  description: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  pressed: {
    opacity: 0.6,
  },
});
