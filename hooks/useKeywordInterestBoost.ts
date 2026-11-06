import { useEffect, useMemo } from 'react';

import { useArticles } from '@/hooks/useArticles';
import { isBikeRelatedInterest, normalizeForYouKeyword } from '@/utils/forYouTopics';

const KEY_SEPARATOR = '\0';

/**
 * Keeps the article pool stocked for saved keyword interests.
 *
 * The feed pool is only the latest window of stories, so a niche keyword ("Fantasy Books")
 * can match nothing in it even though the archive has plenty. This asks the server for the
 * interest's archive matches once the feed has loaded, and again after each feed refresh
 * replaces the pool or the keyword list changes.
 *
 * Bike interests are skipped: they are served by the cycling-publisher path, which scores
 * with a different matcher than the one the server query mirrors.
 */
export function useKeywordInterestBoost(
  keywords: readonly string[] | undefined,
  enabled = true,
): void {
  const { boostArticlesForKeywords, feedGeneration, isLoading } = useArticles();

  const key = useMemo(
    () =>
      (keywords ?? [])
        .filter((keyword) => !isBikeRelatedInterest(normalizeForYouKeyword(keyword)))
        .join(KEY_SEPARATOR),
    [keywords],
  );

  useEffect(() => {
    if (!enabled || !key || isLoading) return;
    void boostArticlesForKeywords(key.split(KEY_SEPARATOR));
  }, [enabled, key, isLoading, feedGeneration, boostArticlesForKeywords]);
}
