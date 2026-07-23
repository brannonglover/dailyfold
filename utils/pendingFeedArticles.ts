import { articlesAreSameStory } from '@/utils/articleStoryMatch';
import { Article } from '@/types';

/** Minimum actionable pending stories before the "new stories ready" banner appears. */
export const MIN_PENDING_ARTICLES_FOR_BANNER = 10;

/**
 * True when a candidate is already covered by the feed — either the exact row (by id)
 * or a cross-source duplicate of the same story. Same-story matches happen a lot: two
 * outlets covering one event land with different ids, and the feed already collapses
 * those via applyArticleStoryFallbacks — without this check, the "tap to see new
 * stories" banner kept firing for content the reader could already see on screen.
 */
function isAlreadyRepresented(candidate: Article, seenIds: Set<string>, feed: Article[]): boolean {
  if (seenIds.has(candidate.id)) return true;
  return feed.some((existing) => articlesAreSameStory(existing, candidate));
}

/** Pending stories that are not already in the live feed (by id or by same underlying story). */
export function pendingNotAlreadyInFeed(pending: Article[], articles: Article[]): Article[] {
  if (pending.length === 0) return pending;
  if (articles.length === 0) return pending;
  const seen = new Set(articles.map((article) => article.id));
  return pending.filter((article) => !isAlreadyRepresented(article, seen, articles));
}

export function hasActionablePending(pending: Article[], articles: Article[]): boolean {
  return pendingNotAlreadyInFeed(pending, articles).length > 0;
}

/** Drop pending rows already present (by id or same underlying story) in either feed snapshot. */
export function reconcilePendingWithFeeds(
  pending: Article[],
  ...feeds: Article[][]
): Article[] {
  if (pending.length === 0) return pending;
  const allArticles = feeds.flat();
  if (allArticles.length === 0) return pending;
  const seen = new Set(allArticles.map((article) => article.id));
  return pending.filter((article) => !isAlreadyRepresented(article, seen, allArticles));
}
