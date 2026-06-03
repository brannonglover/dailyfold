import { FALLBACK_SOURCES } from '@/data/sources';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import {
  buildSourcePrimaryTopicMap,
  filterArticlesBySources,
} from '@/services/sourcePreferences';
import { filterArticlesBySportTags } from '@/services/sportPreferences';
import { filterArticlesByTopics, isAllTopicsEnabled } from '@/services/topicPreferences';
import { Article, FeedSource, UserPreferences } from '@/types';

/**
 * Client-side feed filter pipeline.
 * All topics (`enabledTopics: []`) bypasses topic, sport, and source filters so the
 * feed is not stuck on sports-only outlets from a prior category or Profile selection.
 */
export function applyFeedFilters(
  articles: Article[],
  preferences: UserPreferences | null | undefined,
  sources: FeedSource[],
): Article[] {
  if (!preferences) return articles;

  const prefs = normalizeFeedPreferences(preferences);
  if (isAllTopicsEnabled(prefs.enabledTopics)) {
    return articles;
  }

  const catalogSources = sources.length > 0 ? sources : FALLBACK_SOURCES;
  let result = filterArticlesBySources(articles, catalogSources, prefs.enabledSourceIds);
  const sourcePrimaryByName = buildSourcePrimaryTopicMap(catalogSources);
  result = filterArticlesByTopics(result, prefs.enabledTopics, sourcePrimaryByName);
  return filterArticlesBySportTags(result, prefs.enabledSportTags, prefs.enabledTopics);
}

/**
 * Trending notification filter pipeline.
 * Source toggles from the Sources screen always apply; topic/sport filters follow the
 * same all-topics bypass as the main feed.
 */
export function applyTrendingNotificationFilters(
  articles: Article[],
  preferences: UserPreferences | null | undefined,
  sources: FeedSource[],
): Article[] {
  if (!preferences) return articles;

  const prefs = normalizeFeedPreferences(preferences);
  const catalogSources = sources.length > 0 ? sources : FALLBACK_SOURCES;
  let result = filterArticlesBySources(articles, catalogSources, prefs.enabledSourceIds);

  if (isAllTopicsEnabled(prefs.enabledTopics)) {
    return result;
  }

  const sourcePrimaryByName = buildSourcePrimaryTopicMap(catalogSources);
  result = filterArticlesByTopics(result, prefs.enabledTopics, sourcePrimaryByName);
  return filterArticlesBySportTags(result, prefs.enabledSportTags, prefs.enabledTopics);
}
