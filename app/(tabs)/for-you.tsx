import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useDisplayOrderLock } from '@/hooks/useDisplayOrderLock';
import { getPersonalizedFeed, hasLikedArticles } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { getForYouEmptyMessage } from '@/utils/feedEmptyMessage';
import { orderPersonalizedFeed } from '@/utils/feedOrdering';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
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
  const syncDisplayHandledRef = useRef(false);
  const { markInitialDisplay, shouldAllowFullRebuild, shouldAllowSilentMerge, lockEpoch } =
    useDisplayOrderLock(isRefreshing);

  useLayoutEffect(() => {
    syncDisplayHandledRef.current = false;
    if (!userHasLikedArticles || !preferences) {
      setDisplayArticles([]);
      prevRawLengthRef.current = 0;
      return;
    }

    const filtered = filterFeedArticles(articles);
    const ranked = getPersonalizedFeed(filtered, preferences);
    const generationChanged = feedGeneration !== prevFeedGenerationRef.current;

    if (generationChanged || prevRawLengthRef.current === 0) {
      syncDisplayHandledRef.current = true;
      if (shouldAllowFullRebuild(false, '', '')) {
        setDisplayArticles(orderPersonalizedFeed(ranked));
        markInitialDisplay();
        prevFeedGenerationRef.current = feedGeneration;
      } else {
        setDisplayArticles((prev) => updateDisplayArticlesInPlace(prev, ranked));
      }
    } else if (articles.length > prevRawLengthRef.current) {
      syncDisplayHandledRef.current = true;
      setDisplayArticles((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        const newOnly = ranked.filter((a) => !seen.has(a.id));
        return mergePaginatedDisplayFeed(prev, newOnly, ranked, orderPersonalizedFeed);
      });
    }

    prevRawLengthRef.current = articles.length;
  }, [
    articles,
    feedGeneration,
    filterFeedArticles,
    preferences,
    userHasLikedArticles,
    markInitialDisplay,
    shouldAllowFullRebuild,
  ]);

  useEffect(() => {
    if (!userHasLikedArticles || !preferences || syncDisplayHandledRef.current) return;

    const filtered = filterFeedArticles(articles);
    const ranked = getPersonalizedFeed(filtered, preferences);
    setDisplayArticles((prev) => {
      if (prev.length === 0 && ranked.length > 0) {
        return orderPersonalizedFeed(ranked);
      }

      if (!shouldAllowSilentMerge()) {
        return updateDisplayArticlesInPlace(prev, ranked);
      }

      const prevIds = new Set(prev.map((article) => article.id));
      const newOnly = ranked.filter((article) => !prevIds.has(article.id));
      if (newOnly.length > 0) {
        return insertDisplayNewcomersAtSourceOrder(prev, newOnly, ranked);
      }

      return updateDisplayArticlesInPlace(prev, ranked);
    });
  }, [
    articles,
    feedGeneration,
    filterFeedArticles,
    preferences,
    userHasLikedArticles,
    lockEpoch,
    shouldAllowSilentMerge,
  ]);

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
    />
  );
}
