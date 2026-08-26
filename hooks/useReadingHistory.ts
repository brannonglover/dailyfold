import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { usePreferences } from '@/contexts/PreferencesContext';
import { fetchArticleById } from '@/services/articles';
import {
  missingClickedArticleIds,
  resolveContinueReadingArticles,
} from '@/services/clickedArticles';
import { useArticles } from '@/hooks/useArticles';
import { Article } from '@/types';

interface UseReadingHistoryResult {
  articles: Article[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  notice: string | null;
  refresh: () => Promise<void>;
}

export function useReadingHistory(): UseReadingHistoryResult {
  const { preferences, rememberClickedArticles } = usePreferences();
  const { articles: feedArticles, isRefreshing, error, notice, refresh } = useArticles();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const backfillInFlightRef = useRef(false);
  const isFocused = useIsFocused();

  const clickedArticleIds = preferences?.clickedArticleIds ?? [];
  const clickedArticlesCache = preferences?.clickedArticles ?? {};
  const readLaterIds = useMemo(
    () => new Set(preferences?.likedArticleIds ?? []),
    [preferences?.likedArticleIds],
  );

  const articles = useMemo(
    () =>
      resolveContinueReadingArticles(
        clickedArticleIds,
        clickedArticlesCache,
        feedArticles,
        readLaterIds,
        preferences?.articleEngagement ?? {},
      ),
    [
      clickedArticleIds,
      clickedArticlesCache,
      feedArticles,
      readLaterIds,
      preferences?.articleEngagement,
    ],
  );

  const backfillMissing = useCallback(async () => {
    if (!preferences || backfillInFlightRef.current) return;

    const missing = missingClickedArticleIds(
      preferences.clickedArticleIds ?? [],
      preferences.clickedArticles ?? {},
      feedArticles,
    );
    if (missing.length === 0) return;

    backfillInFlightRef.current = true;
    setIsBackfilling(true);
    try {
      const fetched = (
        await Promise.all(missing.map((id) => fetchArticleById(id)))
      ).filter((article): article is Article => article != null);
      if (fetched.length > 0) {
        await rememberClickedArticles(fetched);
      }
    } finally {
      backfillInFlightRef.current = false;
      setIsBackfilling(false);
    }
  }, [preferences, feedArticles, rememberClickedArticles]);

  useEffect(() => {
    if (!isFocused) return;

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      void backfillMissing();
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [isFocused, backfillMissing]);

  const isLoading =
    (clickedArticleIds.length > 0 && articles.length === 0 && isBackfilling) ||
    (clickedArticleIds.length > 0 && articles.length === 0 && feedArticles.length === 0);

  return {
    articles,
    isLoading,
    isRefreshing,
    error,
    notice,
    refresh,
  };
}
