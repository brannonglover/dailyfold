import { Article } from '@/types';

import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from './feedLoadMoreGate';

/** Matches backend `encodeArticleCursor` (`publishedAt|id`). */
export function encodeArticlePaginationCursor(publishedAt: string, id: string): string {
  return `${publishedAt}|${id}`;
}

/** Cursor for the page after the oldest article in a newest-first feed. */
export function derivePaginationCursorFromArticles(articles: Article[]): string | null {
  if (articles.length === 0) return null;
  const oldest = articles[articles.length - 1];
  if (!oldest?.publishedAt || !oldest.id) return null;
  return encodeArticlePaginationCursor(oldest.publishedAt, oldest.id);
}

/** True when a stocked feed likely has older pages still on the server. */
export function shouldAssumeMoreArticlesAvailable(
  articleCount: number,
  maxSnapshotArticles = 80,
): boolean {
  return (
    articleCount >= MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION ||
    articleCount >= maxSnapshotArticles
  );
}

export type PaginationCursorMeta = {
  hasMore: boolean;
  nextCursor: string | null;
};

/** Cursor for the next load-more request — always continue from the on-screen feed tail. */
export function resolveLoadMoreCursor(articles: Article[]): string | null {
  return derivePaginationCursorFromArticles(articles);
}

/**
 * Reconcile pagination metadata after a fetch.
 * Silent refreshes must not adopt page-1 API cursors when the visible feed is longer.
 */
export function reconcilePaginationAfterFetch(options: {
  mode: 'initial' | 'refresh' | 'silent' | 'append';
  feedArticles: Article[];
  incomingCount: number;
  apiMeta?: PaginationCursorMeta;
  previousMeta: PaginationCursorMeta;
  maxSnapshotArticles?: number;
}): PaginationCursorMeta {
  const {
    mode,
    feedArticles,
    incomingCount,
    apiMeta,
    previousMeta,
    maxSnapshotArticles = 80,
  } = options;
  const apiHasMore = apiMeta?.hasMore ?? false;
  const apiCursor = apiMeta?.nextCursor ?? null;
  const tailCursor = derivePaginationCursorFromArticles(feedArticles);

  if (mode === 'silent' && feedArticles.length > 0) {
    if (
      tailCursor &&
      shouldAssumeMoreArticlesAvailable(feedArticles.length, maxSnapshotArticles)
    ) {
      return { hasMore: true, nextCursor: tailCursor };
    }
    if (tailCursor && previousMeta.hasMore) {
      return { hasMore: true, nextCursor: tailCursor };
    }
    return {
      hasMore: previousMeta.hasMore,
      nextCursor: tailCursor ?? previousMeta.nextCursor,
    };
  }

  if (mode === 'append') {
    if (incomingCount === 0 && apiCursor) {
      return { hasMore: apiHasMore, nextCursor: apiCursor };
    }
    return {
      hasMore: apiHasMore,
      nextCursor: tailCursor ?? apiCursor,
    };
  }

  return { hasMore: apiHasMore, nextCursor: apiCursor };
}
