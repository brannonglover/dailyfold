import { hasPersonalizationSignals } from '@/services/interestSignals';
import { getPersonalizedFeed } from '@/services/recommendations';
import { Article, UserPreferences } from '@/types';
import { orderPersonalizedFeed } from '@/utils/feedOrdering';
import {
  isForYouDisplayCacheFresh,
  readTabDisplayCache,
  writeTabDisplayCache,
} from '@/utils/tabDisplayCache';

export function buildForYouCacheKeys(preferences: UserPreferences) {
  const feedFilterKey = JSON.stringify({
    topics: preferences.enabledTopics ?? [],
    sports: preferences.enabledSportTags ?? [],
    sources: preferences.enabledSourceIds ?? [],
  });
  const personalizationKey = JSON.stringify({
    liked: [...(preferences.likedArticleIds ?? [])].sort(),
    clicked: [...(preferences.clickedArticleIds ?? [])].sort(),
  });
  return { feedFilterKey, personalizationKey };
}

/** Background rank for For You so first tab visit can paint from cache. */
export function prewarmForYouDisplayCache(
  articles: Article[],
  preferences: UserPreferences,
  feedGeneration: number,
  filterFeedArticles: (items: Article[]) => Article[],
): boolean {
  if (!hasPersonalizationSignals(preferences) || articles.length === 0) return false;

  const { feedFilterKey, personalizationKey } = buildForYouCacheKeys(preferences);
  const existing = readTabDisplayCache('for-you');
  if (
    existing &&
    isForYouDisplayCacheFresh(
      existing,
      feedGeneration,
      articles.length,
      feedFilterKey,
      personalizationKey,
    )
  ) {
    return false;
  }

  const filtered = filterFeedArticles(articles);
  const ranked = getPersonalizedFeed(filtered, preferences);
  const ordered = orderPersonalizedFeed(ranked);

  writeTabDisplayCache('for-you', {
    displayArticles: ordered,
    displayReady: true,
    feedGeneration,
    rawLength: articles.length,
    filterKey: feedFilterKey,
    personalizationKey,
    orderLocked: existing?.orderLocked ?? false,
  });

  return true;
}
