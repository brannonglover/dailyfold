import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import {
  derivePaginationCursorFromArticles,
  encodeArticlePaginationCursor,
  reconcilePaginationAfterFetch,
  resolveLoadMoreCursor,
  shouldAssumeMoreArticlesAvailable,
} from './articlePagination';
import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from './feedLoadMoreGate';

function article(id: string, publishedAt: string): Article {
  return {
    id,
    title: id,
    excerpt: '',
    body: '',
    source: 'Test',
    publishedAt,
    url: `https://example.com/${id}`,
    imageUrl: '',
    readTimeMinutes: 1,
    topics: [],
    sportTags: [],
  };
}

test('encodeArticlePaginationCursor matches backend cursor format', () => {
  assert.equal(
    encodeArticlePaginationCursor('2026-06-01T12:00:00.000Z', 'abc'),
    '2026-06-01T12:00:00.000Z|abc',
  );
});

test('derivePaginationCursorFromArticles uses the oldest row in a newest-first feed', () => {
  const articles = [
    article('newest', '2026-06-03T00:00:00.000Z'),
    article('middle', '2026-06-02T00:00:00.000Z'),
    article('oldest', '2026-06-01T00:00:00.000Z'),
  ];

  assert.equal(
    derivePaginationCursorFromArticles(articles),
    '2026-06-01T00:00:00.000Z|oldest',
  );
});

test('shouldAssumeMoreArticlesAvailable is true for stocked and maxed snapshots', () => {
  assert.equal(shouldAssumeMoreArticlesAvailable(MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION), true);
  assert.equal(shouldAssumeMoreArticlesAvailable(80, 80), true);
  assert.equal(shouldAssumeMoreArticlesAvailable(5), false);
});

test('resolveLoadMoreCursor uses the oldest article in the feed', () => {
  const articles = [
    article('newest', '2026-06-03T00:00:00.000Z'),
    article('oldest', '2026-06-01T00:00:00.000Z'),
  ];
  assert.equal(
    resolveLoadMoreCursor(articles),
    '2026-06-01T00:00:00.000Z|oldest',
  );
});

test('reconcilePaginationAfterFetch preserves feed-tail cursor on silent refresh', () => {
  const feed = Array.from({ length: 120 }, (_, index) =>
    article(`row-${index}`, `2026-06-${String((index % 28) + 1).padStart(2, '0')}T00:00:00.000Z`),
  );
  const tailCursor = derivePaginationCursorFromArticles(feed);

  const reconciled = reconcilePaginationAfterFetch({
    mode: 'silent',
    feedArticles: feed,
    incomingCount: 100,
    apiMeta: { hasMore: true, nextCursor: '2026-06-01T00:00:00.000Z|page-one' },
    previousMeta: { hasMore: true, nextCursor: tailCursor },
  });

  assert.equal(reconciled.nextCursor, tailCursor);
  assert.equal(reconciled.hasMore, true);
});

test('reconcilePaginationAfterFetch advances API cursor on empty append pages', () => {
  const feed = [
    article('newest', '2026-06-03T00:00:00.000Z'),
    article('oldest', '2026-06-01T00:00:00.000Z'),
  ];

  const reconciled = reconcilePaginationAfterFetch({
    mode: 'append',
    feedArticles: feed,
    incomingCount: 0,
    apiMeta: { hasMore: true, nextCursor: '2026-05-31T00:00:00.000Z|next' },
    previousMeta: { hasMore: true, nextCursor: '2026-06-01T00:00:00.000Z|oldest' },
  });

  assert.equal(reconciled.nextCursor, '2026-05-31T00:00:00.000Z|next');
});

test('reconcilePaginationAfterFetch uses feed tail after successful append', () => {
  const feed = [
    article('newest', '2026-06-03T00:00:00.000Z'),
    article('older', '2026-06-02T00:00:00.000Z'),
    article('oldest', '2026-06-01T00:00:00.000Z'),
  ];

  const reconciled = reconcilePaginationAfterFetch({
    mode: 'append',
    feedArticles: feed,
    incomingCount: 1,
    apiMeta: { hasMore: true, nextCursor: '2026-05-31T00:00:00.000Z|stale' },
    previousMeta: { hasMore: true, nextCursor: '2026-06-02T00:00:00.000Z|older' },
  });

  assert.equal(reconciled.nextCursor, '2026-06-01T00:00:00.000Z|oldest');
});
