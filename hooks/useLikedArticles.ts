import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { usePreferences } from '@/contexts/PreferencesContext';
import { fetchArticleById } from '@/services/articles';
import {
  missingLikedArticleIds,
  resolveLikedArticles,
} from '@/services/likedArticles';
import { useArticles } from '@/hooks/useArticles';
import { Article } from '@/types';

interface UseLikedArticlesResult {
  articles: Article[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  notice: string | null;
  refresh: () => Promise<void>;
}

export function useLikedArticles(): UseLikedArticlesResult {
  const { preferences, rememberLikedArticles } = usePreferences();
  const { articles: feedArticles, isRefreshing, error, notice, refresh } = useArticles();
  const [isBackfilling, setIsBackfilling] = useState(false);
  const backfillInFlightRef = useRef(false);
  const isFocused = useIsFocused();

  const likedArticleIds = preferences?.likedArticleIds ?? [];
  const likedArticlesCache = preferences?.likedArticles ?? {};

  const articles = useMemo(
    () => resolveLikedArticles(likedArticleIds, likedArticlesCache, feedArticles),
    [likedArticleIds, likedArticlesCache, feedArticles],
  );

  const backfillMissing = useCallback(async () => {
    if (!preferences || backfillInFlightRef.current) return;

    const missing = missingLikedArticleIds(
      preferences.likedArticleIds,
      preferences.likedArticles ?? {},
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
        await rememberLikedArticles(fetched);
      }
    } finally {
      backfillInFlightRef.current = false;
      setIsBackfilling(false);
    }
  }, [preferences, feedArticles, rememberLikedArticles]);

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
    (likedArticleIds.length > 0 && articles.length === 0 && isBackfilling) ||
    (likedArticleIds.length > 0 && articles.length === 0 && feedArticles.length === 0);

  return {
    articles,
    isLoading,
    isRefreshing,
    error,
    notice,
    refresh,
  };
}
