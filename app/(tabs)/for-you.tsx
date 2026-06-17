import { useIsFocused } from '@react-navigation/native';
import { startTransition, useEffect, useMemo, useRef, useState, memo } from 'react';
import { InteractionManager } from 'react-native';

import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDeferAfterFocus } from '@/hooks/useDeferAfterFocus';
import { useArticles } from '@/hooks/useArticles';
import { useDisplayOrderLock } from '@/hooks/useDisplayOrderLock';
import { useTabDisplayState } from '@/hooks/useTabDisplayState';
import { buildInterestProfile, hasInterestSignals, hasPersonalizationSignals } from '@/services/interestSignals';
import {
  buildArticleMatchReasonsById,
  getPersonalizedFeed,
} from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { buildForYouCacheKeys } from '@/utils/forYouPrewarm';
import { getForYouEmptyMessage } from '@/utils/feedEmptyMessage';
import { orderPersonalizedFeed } from '@/utils/feedOrdering';
import {
  insertDisplayNewcomersAtSourceOrder,
  mergePaginatedDisplayFeed,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';
import {
  isForYouDisplayCacheFresh,
  readTabDisplayCache,
} from '@/utils/tabDisplayCache';

function ForYouScreenContent() {
  const {
    preferences,
    isLoading: isPreferencesLoading,
    filterFeedArticles,
    recordFeedClick,
  } = usePreferences();
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

  const likedArticlesReady = preferences != null;
  const userHasPersonalizationSignals =
    likedArticlesReady && hasPersonalizationSignals(preferences);
  const syncDisplayHandledRef = useRef(false);
  const isFocused = useIsFocused();
  const [matchReasonsByArticleId, setMatchReasonsByArticleId] = useState(
    () => new Map<string, string[]>(),
  );
  const [emptyMessage, setEmptyMessage] = useState<string | undefined>();

  const { feedFilterKey, personalizationKey } = useMemo(
    () =>
      preferences
        ? buildForYouCacheKeys(preferences)
        : { feedFilterKey: '', personalizationKey: '' },
    [preferences],
  );

  const {
    displayArticles,
    displayReady,
    feedGenerationRef: prevFeedGenerationRef,
    rawLengthRef: prevRawLengthRef,
    setDisplayArticles,
    setDisplayReady,
  } = useTabDisplayState('for-you', feedFilterKey, {
    feedGeneration,
    rawLength: articles.length,
    personalizationKey,
  });

  const isForYouCacheFresh = useMemo(() => {
    const entry = readTabDisplayCache('for-you');
    return entry
      ? isForYouDisplayCacheFresh(
          entry,
          feedGeneration,
          articles.length,
          feedFilterKey,
          personalizationKey,
        )
      : false;
  }, [feedGeneration, articles.length, feedFilterKey, personalizationKey]);

  const { markInitialDisplay, shouldAllowFullRebuild, shouldAllowSilentMerge } =
    useDisplayOrderLock(isRefreshing, 'for-you');

  const showableArticles = useMemo(() => {
    if (!userHasPersonalizationSignals || !preferences) return [];
    if (displayArticles.length > 0) return displayArticles;
    const cached = readTabDisplayCache('for-you');
    if (cached && cached.displayArticles.length > 0) return cached.displayArticles;
    return [];
  }, [displayArticles, preferences, userHasPersonalizationSignals]);

  useEffect(() => {
    if (!isFocused) return;
    if (showableArticles.length > 0 && !displayReady) {
      setDisplayReady(true);
    }
  }, [isFocused, showableArticles.length, displayReady, setDisplayReady]);

  useEffect(() => {
    if (!isFocused || userHasPersonalizationSignals) return;
    if (displayArticles.length === 0 && !displayReady) return;
    startTransition(() => {
      setDisplayArticles([]);
      setDisplayReady(false);
      prevRawLengthRef.current = 0;
    });
  }, [
    isFocused,
    userHasPersonalizationSignals,
    displayArticles.length,
    displayReady,
    setDisplayArticles,
    setDisplayReady,
    prevRawLengthRef,
  ]);

  useDeferAfterFocus(
    isFocused,
    () => {
      syncDisplayHandledRef.current = false;
      if (!userHasPersonalizationSignals || !preferences) {
        return;
      }

      if (isForYouCacheFresh) {
        prevRawLengthRef.current = articles.length;
        prevFeedGenerationRef.current = feedGeneration;
        return;
      }

      startTransition(() => {
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
          setDisplayReady(true);
        } else if (articles.length > prevRawLengthRef.current) {
          syncDisplayHandledRef.current = true;
          setDisplayArticles((prev) => {
            const seen = new Set(prev.map((a) => a.id));
            const newOnly = ranked.filter((a) => !seen.has(a.id));
            return mergePaginatedDisplayFeed(prev, newOnly, ranked, orderPersonalizedFeed);
          });
          setDisplayReady(true);
        }

        prevRawLengthRef.current = articles.length;

        if (syncDisplayHandledRef.current) return;

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
        setDisplayReady(true);
      });
    },
    [
      articles,
      feedGeneration,
      filterFeedArticles,
      isForYouCacheFresh,
      preferences,
      userHasPersonalizationSignals,
      markInitialDisplay,
      shouldAllowFullRebuild,
      shouldAllowSilentMerge,
      setDisplayArticles,
      setDisplayReady,
      prevFeedGenerationRef,
      prevRawLengthRef,
    ],
    'paint',
  );

  useEffect(() => {
    if (
      !isFocused ||
      !displayReady ||
      !userHasPersonalizationSignals ||
      !preferences ||
      showableArticles.length === 0
    ) {
      setMatchReasonsByArticleId(new Map());
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      startTransition(() => {
        if (cancelled) return;
        const filtered = filterFeedArticles(articles);
        const profileArticles = [
          ...filtered,
          ...Object.values(preferences.likedArticles ?? {}),
          ...Object.values(preferences.clickedArticles ?? {}),
        ];
        const profile = buildInterestProfile(preferences, profileArticles);
        setMatchReasonsByArticleId(
          buildArticleMatchReasonsById(showableArticles, profile, preferences, profileArticles),
        );
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    isFocused,
    displayReady,
    userHasPersonalizationSignals,
    preferences,
    showableArticles,
    filterFeedArticles,
    articles,
  ]);

  useEffect(() => {
    if (!isFocused || !displayReady) {
      setEmptyMessage(undefined);
      return;
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      startTransition(() => {
        if (cancelled) return;

        const filtered = filterFeedArticles(articles);
        const profile = preferences
          ? buildInterestProfile(preferences, [
              ...filtered,
              ...Object.values(preferences.likedArticles ?? {}),
              ...Object.values(preferences.clickedArticles ?? {}),
            ])
          : null;
        setEmptyMessage(
          getForYouEmptyMessage({
            error,
            totalCount: articles.length,
            filteredCount: showableArticles.length,
            sourceFilteredCount: filtered.length,
            enabledTopics: preferences?.enabledTopics,
            enabledSportTags: preferences?.enabledSportTags,
            sourcesRestricted:
              !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
            usingDemoArticles,
            hasPersonalizationSignals: userHasPersonalizationSignals,
            hasInterestProfile: profile ? hasInterestSignals(profile) : false,
          }),
        );
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [
    isFocused,
    displayReady,
    error,
    articles.length,
    showableArticles.length,
    preferences?.enabledTopics,
    preferences?.enabledSportTags,
    preferences?.enabledSourceIds,
    usingDemoArticles,
    userHasPersonalizationSignals,
    filterFeedArticles,
    articles,
    preferences,
  ]);

  return (
    <ArticleFeedScreen
      articles={showableArticles}
      title="For You"
      matchReasonsByArticleId={matchReasonsByArticleId}
      emptyMessage={emptyMessage}
      isLoading={isLoading || (isPreferencesLoading && !likedArticlesReady)}
      isRefreshing={isRefreshing}
      error={error}
      notice={notice}
      onRefresh={refresh}
      onFeedClick={recordFeedClick}
    />
  );
}

export default memo(function ForYouScreen() {
  return <ForYouScreenContent />;
});
