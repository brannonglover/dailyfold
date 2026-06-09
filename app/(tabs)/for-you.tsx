import { useEffect, useMemo, useRef, useState } from 'react';

import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { FeedTopicFilterBar } from '@/components/FeedTopicFilterBar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { getPersonalizedFeed, hasLikedArticles } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { getForYouEmptyMessage } from '@/utils/feedEmptyMessage';
import { orderPersonalizedFeed } from '@/utils/feedOrdering';
import { mergePaginatedDisplayFeed } from '@/utils/mergeDisplayFeed';
import { Article } from '@/types';

export default function ForYouScreen() {
  const {
    preferences,
    isLoading: isPreferencesLoading,
    personalizationSummary,
    filterFeedArticles,
  } = usePreferences();
  const {
    articles,
    feedGeneration,
    isLoading,
    isRefreshing,
    error,
    notice,
    usingDemoArticles,
    pendingCount,
    dismissPendingArticles,
    refresh,
  } = useArticles();

  const likedArticlesReady = preferences != null;
  const userHasLikedArticles = likedArticlesReady && hasLikedArticles(preferences);
  const [displayArticles, setDisplayArticles] = useState<Article[]>([]);
  const prevFeedGenerationRef = useRef(0);
  const prevRawLengthRef = useRef(0);

  useEffect(() => {
    if (!userHasLikedArticles || !preferences) {
      setDisplayArticles([]);
      prevRawLengthRef.current = 0;
      return;
    }

    const filtered = filterFeedArticles(articles);
    const ranked = getPersonalizedFeed(filtered, preferences);
    const generationChanged = feedGeneration !== prevFeedGenerationRef.current;

    if (generationChanged || prevRawLengthRef.current === 0) {
      setDisplayArticles(orderPersonalizedFeed(ranked));
      prevFeedGenerationRef.current = feedGeneration;
    } else if (articles.length > prevRawLengthRef.current) {
      setDisplayArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const newOnly = ranked.filter((a) => !seen.has(a.id));
        return mergePaginatedDisplayFeed(prev, newOnly, ranked, orderPersonalizedFeed);
      });
    } else if (prevRawLengthRef.current > 0) {
      setDisplayArticles((prev) => {
        if (prev.length === 0) return prev;
        const byId = new Map(ranked.map((a) => [a.id, a]));
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
  }, [articles, feedGeneration, filterFeedArticles, preferences, userHasLikedArticles]);

  const personalized = displayArticles;

  const emptyMessage = useMemo(
    () => {
      const filtered = filterFeedArticles(articles);
      return getForYouEmptyMessage({
        error,
        totalCount: articles.length,
        filteredCount: personalized.length,
        sourceFilteredCount: filtered.length,
        enabledTopics: preferences?.enabledTopics,
        enabledSportTags: preferences?.enabledSportTags,
        sourcesRestricted:
          !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
        usingDemoArticles,
        hasLikedArticles: userHasLikedArticles,
      });
    },
    [
      error,
      articles.length,
      personalized.length,
      preferences?.enabledTopics,
      preferences?.enabledSportTags,
      preferences?.enabledSourceIds,
      usingDemoArticles,
      userHasLikedArticles,
      filterFeedArticles,
      articles,
    ],
  );

  return (
    <ArticleFeedScreen
      articles={personalized}
      title="For You"
      subtitle={personalizationSummary}
      emptyMessage={emptyMessage}
      isLoading={isLoading || (isPreferencesLoading && !likedArticlesReady)}
      isRefreshing={isRefreshing}
      error={error}
      notice={notice}
      onRefresh={refresh}
      pendingCount={pendingCount}
      onDismissPending={dismissPendingArticles}
      headerExtra={<FeedTopicFilterBar />}
    />
  );
}
