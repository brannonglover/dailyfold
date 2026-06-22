import assert from 'node:assert/strict';
import test from 'node:test';

import type { FetchArticlesResult } from '@/services/articles';
import type { Article } from '@/types';

import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from './feedLoadMoreGate';
import { fetchFeedUntilStocked } from './feedInitialStock';

function article(id: string): Article {
  return {
    id,
    title: id,
    excerpt: '',
    body: '',
    source: 'Test',
    publishedAt: '2026-01-01T00:00:00.000Z',
    url: `https://example.com/${id}`,
    imageUrl: '',
    readTimeMinutes: 1,
    topics: [],
    sportTags: [],
  };
}

function page(
  ids: string[],
  options?: { hasMore?: boolean; nextCursor?: string | null },
): FetchArticlesResult {
  return {
    articles: ids.map(article),
    meta: {
      hasMore: options?.hasMore ?? false,
      nextCursor: options?.nextCursor ?? null,
      lastIngestAt: null,
    },
  };
}

test('fetchFeedUntilStocked returns the first page when minimum is already met', async () => {
  const ids = Array.from({ length: MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION }, (_, i) => `a-${i}`);
  let calls = 0;

  const result = await fetchFeedUntilStocked(async () => {
    calls += 1;
    return page(ids, { hasMore: true, nextCursor: 'cursor-1' });
  });

  assert.equal(calls, 1);
  assert.equal(result.articles.length, MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION);
  assert.equal(result.meta?.hasMore, true);
  assert.equal(result.meta?.nextCursor, 'cursor-1');
});

test('fetchFeedUntilStocked chains pages in the background until minimum is stocked', async () => {
  const calls: Array<string | undefined> = [];

  const result = await fetchFeedUntilStocked(async (cursor) => {
    calls.push(cursor);
    if (!cursor) {
      return page(['a-1', 'a-2'], { hasMore: true, nextCursor: 'cursor-1' });
    }
    if (cursor === 'cursor-1') {
      return page(['a-3', 'a-4'], { hasMore: true, nextCursor: 'cursor-2' });
    }
    return page(
      Array.from({ length: MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION - 4 }, (_, i) => `a-${i + 5}`),
      { hasMore: true, nextCursor: 'cursor-3' },
    );
  });

  assert.deepEqual(calls, [undefined, 'cursor-1', 'cursor-2']);
  assert.equal(result.articles.length, MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION);
  assert.equal(result.meta?.hasMore, true);
  assert.equal(result.meta?.nextCursor, 'cursor-3');
});

test('fetchFeedUntilStocked stops when the feed is exhausted before minimum', async () => {
  const result = await fetchFeedUntilStocked(async (cursor) => {
    if (!cursor) {
      return page(['a-1', 'a-2'], { hasMore: true, nextCursor: 'cursor-1' });
    }
    return page(['a-3'], { hasMore: false, nextCursor: null });
  });

  assert.equal(result.articles.length, 3);
  assert.equal(result.meta?.hasMore, false);
  assert.equal(result.meta?.nextCursor, null);
});

test('fetchFeedUntilStocked uses isStocked instead of raw count', async () => {
  const calls: Array<string | undefined> = [];

  const result = await fetchFeedUntilStocked(
    async (cursor) => {
      calls.push(cursor);
      if (!cursor) {
        return page(['a-1', 'a-2', 'a-3', 'a-4'], { hasMore: true, nextCursor: 'cursor-1' });
      }
      return page(['a-5', 'a-6', 'a-7', 'a-8'], { hasMore: true, nextCursor: 'cursor-2' });
    },
    {
      isStocked: (articles) => articles.length >= 6,
    },
  );

  assert.deepEqual(calls, [undefined, 'cursor-1']);
  assert.equal(result.articles.length, 8);
});

test('fetchFeedUntilStocked returns only newly fetched rows when startingArticles is set', async () => {
  const seed = [article('seed-1'), article('seed-2')];

  const result = await fetchFeedUntilStocked(
    async (cursor) => {
      if (!cursor) {
        return page(['seed-1', 'a-3', 'a-4'], { hasMore: true, nextCursor: 'cursor-1' });
      }
      return page(['a-5'], { hasMore: false, nextCursor: null });
    },
    {
      startingArticles: seed,
      minimum: 4,
    },
  );

  assert.deepEqual(
    result.articles.map((row) => row.id),
    ['a-3', 'a-4'],
  );
});
