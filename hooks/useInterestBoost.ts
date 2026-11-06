import { useEffect, useMemo } from 'react';

import { useArticles } from '@/hooks/useArticles';
import type { UserPreferences } from '@/types';
import { sourceIdsForForYouInterests } from '@/utils/forYouInterestSources';

const KEY_SEPARATOR = '\0';

type InterestSelection = Pick<
  UserPreferences,
  'forYouTopics' | 'forYouKeywords' | 'forYouSportTags'
>;

/**
 * Keeps the article pool stocked for every saved interest, whatever its kind.
 *
 * The feed pool is only the latest window of stories, so an interest can match nothing in it
 * even though the archive has plenty. Each kind has its own way of finding stories, and this
 * is the one place that runs all of them:
 *
 *  - keywords (generic and bike) → archive search on the server, which mirrors the client matcher
 *  - sport tags, topics, and bike keywords → the publishers that cover them
 *
 * Runs once the feed has loaded and again after a refresh replaces the pool or the selection
 * changes. Fetches are deduped per feed generation inside ArticlesContext.
 */
export function useInterestBoost(
  interests: InterestSelection | null | undefined,
  enabled = true,
): void {
  const { boostArticlesForKeywords, boostArticlesForInterests, feedGeneration, isLoading } =
    useArticles();

  const keywordsKey = (interests?.forYouKeywords ?? []).join(KEY_SEPARATOR);
  const publishersKey = useMemo(
    () => (interests ? sourceIdsForForYouInterests(interests as UserPreferences) : []).join(','),
    [interests],
  );

  useEffect(() => {
    if (!enabled || isLoading) return;
    if (keywordsKey) void boostArticlesForKeywords(keywordsKey.split(KEY_SEPARATOR));
    if (publishersKey) {
      void boostArticlesForInterests(
        publishersKey.split(','),
        `interests${KEY_SEPARATOR}${feedGeneration}${KEY_SEPARATOR}${publishersKey}`,
      );
    }
  }, [
    enabled,
    isLoading,
    feedGeneration,
    keywordsKey,
    publishersKey,
    boostArticlesForKeywords,
    boostArticlesForInterests,
  ]);
}
