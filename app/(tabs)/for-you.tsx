import { useIsFocused } from '@react-navigation/native';
import { memo, startTransition, useEffect, useMemo, useRef } from 'react';
import { InteractionManager } from 'react-native';

import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { ForYouTopicPicker } from '@/components/ForYouTopicPicker';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useTabDisplayState } from '@/hooks/useTabDisplayState';
import { buildInterestProfile } from '@/services/interestSignals';
import { buildArticleMatchReasonsById, getForYouFeed } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { getForYouEmptyMessage } from '@/utils/feedEmptyMessage';
import { buildForYouCacheKeys } from '@/utils/forYouPrewarm';
import { hasForYouTopicSelection } from '@/utils/forYouTopics';
import { resolveTabDisplayFeed } from '@/utils/tabDisplayCache';

/**
 * Blended For You feed — merges every followed topic/keyword/sport into one feed
 * via getForYouFeed(), which was already computed and cached (see utils/forYouPrewarm.ts,
 * called from the Latest tab) but never rendered anywhere until now.
 */
function ForYouScreenContent() {
  const isFocused = useIsFocused();
  const { preferences, isLoading: isPreferencesLoading, filterForYouFeedArticles, recordFeedClick } =
    usePreferences();
  const {
    articles,
    feedGeneration,
    isLoading,
    isRefreshing,
    error,
    notice,
    usingDemoArticles,
    refresh,
  } = useArticles();

  const preferencesReady = preferences != null;
  const hasInterests = preferencesReady && hasForYouTopicSelection(preferences);

  const { feedFilterKey, personalizationKey } = useMemo(
    () =>
      preferences
        ? buildForYouCacheKeys(preferences)
        : { feedFilterKey: '', personalizationKey: '' },
    [preferences],
  );

  const { displayArticles, displayReady, setDisplayArticles, setDisplayReady } =
    useTabDisplayState('for-you', feedFilterKey, {
      feedGeneration,
      rawLength: articles.length,
      personalizationKey,
    });

  const rankTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(
    null,
  );

  // Rank in the background so tab switches stay instant — cache from prewarmForYouDisplayCache
  // (fired on every Latest focus) usually already has this ready before the user even taps here.
  useEffect(() => {
    if (!isFocused || !preferences || !hasInterests || articles.length === 0) return;

    let cancelled = false;
    rankTaskRef.current?.cancel();
    rankTaskRef.current = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const filtered = filterForYouFeedArticles(articles);
      const ranked = getForYouFeed(filtered, preferences);
      startTransition(() => {
        if (cancelled) return;
        setDisplayArticles(ranked);
        setDisplayReady(true);
      });
    });

    return () => {
      cancelled = true;
      rankTaskRef.current?.cancel();
    };
  }, [
    isFocused,
    articles,
    preferences,
    hasInterests,
    filterForYouFeedArticles,
    setDisplayArticles,
    setDisplayReady,
  ]);

  useEffect(() => {
    if (hasInterests) return;
    setDisplayArticles([]);
    setDisplayReady(false);
  }, [hasInterests, setDisplayArticles, setDisplayReady]);

  const feedArticles = useMemo(
    () =>
      resolveTabDisplayFeed({
        contextLoading: isLoading,
        displayArticles,
        displayReady,
        tabKey: 'for-you',
        feedGeneration,
        rawLength: articles.length,
        filterKey: feedFilterKey,
        personalizationKey,
      }),
    [
      isLoading,
      displayArticles,
      displayReady,
      feedGeneration,
      articles.length,
      feedFilterKey,
      personalizationKey,
    ],
  );

  const matchReasonsByArticleId = useMemo(() => {
    if (!preferences || feedArticles.length === 0) return new Map<string, string[]>();
    const profile = buildInterestProfile(preferences, articles);
    return buildArticleMatchReasonsById(feedArticles, profile, preferences, articles);
  }, [preferences, feedArticles, articles]);

  const emptyMessage = useMemo(() => {
    if (!hasInterests) {
      return 'Tap a topic above or search for stories, keywords, or topics to build your personalized feed.';
    }
    const filtered = filterForYouFeedArticles(articles);
    return getForYouEmptyMessage({
      error,
      totalCount: articles.length,
      filteredCount: feedArticles.length,
      sourceFilteredCount: filtered.length,
      enabledTopics: preferences?.enabledTopics,
      enabledSportTags: preferences?.enabledSportTags,
      sourcesRestricted: !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
      usingDemoArticles,
      hasForYouTopics: true,
    });
  }, [
    hasInterests,
    error,
    articles,
    feedArticles.length,
    filterForYouFeedArticles,
    preferences,
    usingDemoArticles,
  ]);

  const showFeedLoading =
    hasInterests && (isPreferencesLoading || isLoading) && feedArticles.length === 0;

  return (
    <ArticleFeedScreen
      articles={hasInterests ? feedArticles : []}
      title="For You"
      emptyMessage={emptyMessage}
      isLoading={showFeedLoading}
      isRefreshing={isRefreshing}
      error={error}
      notice={notice}
      onRefresh={refresh}
      matchReasonsByArticleId={matchReasonsByArticleId}
      onFeedClick={recordFeedClick}
      layout="snap"
      headerExtra={<ForYouTopicPicker articles={articles} />}
    />
  );
}

export default memo(function ForYouScreen() {
  return <ForYouScreenContent />;
});
