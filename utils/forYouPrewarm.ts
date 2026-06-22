import { hasForYouTopicSelection } from '@/utils/forYouTopics';
import { getForYouFeed } from '@/services/recommendations';
import { Article, UserPreferences } from '@/types';
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
    forYouTopics: [...(preferences.forYouTopics ?? [])].sort(),
    forYouKeywords: [...(preferences.forYouKeywords ?? [])].sort(),
    forYouSportTags: [...(preferences.forYouSportTags ?? [])].sort(),
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
  if (!hasForYouTopicSelection(preferences) || articles.length === 0) return false;

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
  const ranked = getForYouFeed(filtered, preferences);

  writeTabDisplayCache('for-you', {
    displayArticles: ranked,
    displayReady: true,
    feedGeneration,
    rawLength: articles.length,
    filterKey: feedFilterKey,
    personalizationKey,
    orderLocked: existing?.orderLocked ?? false,
  });

  return true;
}
