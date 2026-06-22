import { applyFeedFilters } from '@/services/feedFilters';
import { Article, FeedSource, UserPreferences } from '@/types';

import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from './feedLoadMoreGate';

/** Count feed rows that survive the client filter pipeline (hero image, sources, topics, blocks). */
export function countFilteredFeedArticles(
  articles: Article[],
  preferences: UserPreferences | null | undefined,
  sources: FeedSource[],
): number {
  return applyFeedFilters(articles, preferences, sources).length;
}

/** True when enough filtered stories are available to scroll-gate pagination. */
export function isFilteredFeedStocked(
  articles: Article[],
  preferences: UserPreferences | null | undefined,
  sources: FeedSource[],
  minimum = MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION,
): boolean {
  return countFilteredFeedArticles(articles, preferences, sources) >= minimum;
}
