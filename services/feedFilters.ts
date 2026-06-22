import { FALLBACK_SOURCES } from '@/data/sources';
import { filterArticlesByBlocks } from '@/services/blockPreferences';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import {
  buildSourcePrimaryTopicMap,
  filterArticlesBySources,
} from '@/services/sourcePreferences';
import { filterArticlesBySportTags } from '@/services/sportPreferences';
import { filterArticlesByTopics, isAllTopicsEnabled } from '@/services/topicPreferences';
import { Article, FeedSource, UserPreferences } from '@/types';
import { applyArticleStoryFallbacks } from '@/utils/articleStoryFallback';
import { hasRealHeroImage } from '@/utils/articleStoryMatch';

/** Drop feed rows without a real hero image (after story dedupe at fetch). */
export function filterArticlesWithRealHeroImage(articles: Article[]): Article[] {
  return articles.filter(hasRealHeroImage);
}

/**
 * Client-side feed filter pipeline.
 * Source toggles always apply. All topics (`enabledTopics: []`) bypasses topic and
 * sport filters so the feed is not stuck on sports-only outlets from a prior category
 * or Profile selection.
 */
export function applyFeedFilters(
  articles: Article[],
  preferences: UserPreferences | null | undefined,
  sources: FeedSource[],
): Article[] {
  let result = applyArticleStoryFallbacks(articles);

  if (preferences) {
    const prefs = normalizeFeedPreferences(preferences);
    const catalogSources = sources.length > 0 ? sources : FALLBACK_SOURCES;

    result = filterArticlesBySources(result, catalogSources, prefs.enabledSourceIds);

    if (!isAllTopicsEnabled(prefs.enabledTopics)) {
      const sourcePrimaryByName = buildSourcePrimaryTopicMap(catalogSources);
      result = filterArticlesByTopics(result, prefs.enabledTopics, sourcePrimaryByName);
      result = filterArticlesBySportTags(result, prefs.enabledSportTags, prefs.enabledTopics);
    }

    result = filterArticlesByBlocks(result, prefs);
  }

  return filterArticlesWithRealHeroImage(result);
}

/**
 * For You candidate pool — source toggles and blocks apply, but profile topic/sport
 * chips do not. Interest tiles drive what stories qualify, not Latest category filters.
 */
export function filterForYouFeedArticles(
  articles: Article[],
  preferences: UserPreferences | null | undefined,
  sources: FeedSource[],
): Article[] {
  let result = applyArticleStoryFallbacks(articles);

  if (preferences) {
    const prefs = normalizeFeedPreferences(preferences);
    const catalogSources = sources.length > 0 ? sources : FALLBACK_SOURCES;
    result = filterArticlesBySources(result, catalogSources, prefs.enabledSourceIds);
    result = filterArticlesByBlocks(result, prefs);
  }

  return filterArticlesWithRealHeroImage(result);
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
  result = filterArticlesBySportTags(result, prefs.enabledSportTags, prefs.enabledTopics);
  return filterArticlesByBlocks(result, prefs);
}
