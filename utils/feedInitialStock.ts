import type { FetchArticlesResult } from '@/services/articles';
import type { Article } from '@/types';

import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from '@/utils/feedLoadMoreGate';

function appendUniqueArticles(prev: Article[], incoming: Article[]): Article[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((article) => article.id));
  const fresh = incoming.filter((article) => !seen.has(article.id));
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}

/** Fetch pages in the background until the feed is stocked or exhausted. */
export async function fetchFeedUntilStocked(
  fetchPage: (cursor?: string) => Promise<FetchArticlesResult>,
  minimum = MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION,
): Promise<FetchArticlesResult> {
  const first = await fetchPage();
  let articles = [...first.articles];
  let cursor = first.meta?.nextCursor ?? null;
  let hasMore = first.meta?.hasMore ?? false;
  let meta = first.meta;

  while (articles.length < minimum && hasMore && cursor) {
    const page = await fetchPage(cursor);
    if (page.articles.length === 0) break;
    articles = appendUniqueArticles(articles, page.articles);
    cursor = page.meta?.nextCursor ?? null;
    hasMore = page.meta?.hasMore ?? false;
    meta = page.meta;
  }

  return {
    articles,
    meta: meta ? { ...meta, hasMore, nextCursor: cursor } : { hasMore, nextCursor: cursor },
  };
}
