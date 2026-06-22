import type { FetchArticlesResult } from '@/services/articles';
import type { Article } from '@/types';

import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from '@/utils/feedLoadMoreGate';

function appendUniqueArticles(prev: Article[], incoming: Article[]): Article[] {
  if (incoming.length === 0) return prev;
  const seen = new Set(prev.map((article) => article.id));
  const fresh = incoming.filter((article) => !seen.has(article.id));
  return fresh.length > 0 ? [...prev, ...fresh] : prev;
}

export type FetchFeedUntilStockedOptions = {
  /** Raw article count target when `isStocked` is omitted. */
  minimum?: number;
  /** When set, stocking continues until this returns true (e.g. filtered visible count). */
  isStocked?: (articles: Article[]) => boolean;
  /** Articles already in the feed (append flows). */
  startingArticles?: Article[];
  /** Safety cap on chained page fetches. */
  maxPages?: number;
};

function resolveIsStocked(
  options?: FetchFeedUntilStockedOptions,
): (articles: Article[]) => boolean {
  const minimum = options?.minimum ?? MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION;
  return options?.isStocked ?? ((articles) => articles.length >= minimum);
}

/** Fetch pages in the background until the feed is stocked or exhausted. */
export async function fetchFeedUntilStocked(
  fetchPage: (cursor?: string) => Promise<FetchArticlesResult>,
  options?: FetchFeedUntilStockedOptions,
): Promise<FetchArticlesResult> {
  const isStocked = resolveIsStocked(options);
  const maxPages = options?.maxPages ?? 10;
  const startingArticles = options?.startingArticles ?? [];

  const first = await fetchPage();
  let articles = appendUniqueArticles(startingArticles, first.articles);
  let cursor = first.meta?.nextCursor ?? null;
  let hasMore = first.meta?.hasMore ?? false;
  let meta = first.meta;
  let pagesFetched = 1;

  while (!isStocked(articles) && hasMore && cursor && pagesFetched < maxPages) {
    const beforeCount = articles.length;
    const page = await fetchPage(cursor);
    pagesFetched += 1;
    if (page.articles.length === 0) break;
    articles = appendUniqueArticles(articles, page.articles);
    cursor = page.meta?.nextCursor ?? null;
    hasMore = page.meta?.hasMore ?? false;
    meta = page.meta;
    if (articles.length === beforeCount) break;
  }

  const newArticles =
    startingArticles.length > 0
      ? articles.slice(startingArticles.length)
      : articles;

  return {
    articles: newArticles,
    meta: meta
      ? { ...meta, hasMore, nextCursor: cursor }
      : { hasMore, nextCursor: cursor, lastIngestAt: null },
  };
}
