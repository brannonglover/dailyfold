import { Article } from '@/types';

/** Pending stories that are not already in the live feed. */
export function pendingNotAlreadyInFeed(pending: Article[], articles: Article[]): Article[] {
  if (pending.length === 0) return pending;
  if (articles.length === 0) return pending;
  const seen = new Set(articles.map((article) => article.id));
  return pending.filter((article) => !seen.has(article.id));
}

export function hasActionablePending(pending: Article[], articles: Article[]): boolean {
  return pendingNotAlreadyInFeed(pending, articles).length > 0;
}

/** Drop pending rows already present in either feed snapshot. */
export function reconcilePendingWithFeeds(
  pending: Article[],
  ...feeds: Article[][]
): Article[] {
  if (pending.length === 0) return pending;
  const seen = new Set<string>();
  for (const feed of feeds) {
    for (const article of feed) {
      seen.add(article.id);
    }
  }
  if (seen.size === 0) return pending;
  return pending.filter((article) => !seen.has(article.id));
}
