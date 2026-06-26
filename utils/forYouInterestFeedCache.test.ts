import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import {
  FOR_YOU_INTEREST_FEED_CACHE_TTL_MS,
  buildForYouInterestFeedCacheKey,
  clearForYouInterestFeedCache,
  isForYouInterestFeedCacheShowable,
  isForYouInterestFeedCacheWithinTtl,
  isForYouInterestFeedRevalidating,
  prewarmForYouInterestFeedCache,
  readForYouInterestFeedCache,
  resolveForYouInterestFeedArticles,
  writeForYouInterestFeedCache,
} from './forYouInterestFeedCache';

function article(id: string, topic: 'sports' | 'technology' = 'sports'): Article {
  return {
    id,
    title: `${id} title`,
    excerpt: `${id} excerpt`,
    body: '',
    url: `https://example.com/${id}`,
    source: 'Example',
    publishedAt: '2026-06-01T12:00:00.000Z',
    topics: [topic],
    imageUrl: `https://example.com/${id}.jpg`,
  };
}

test.beforeEach(() => {
  clearForYouInterestFeedCache();
});

test('prewarmForYouInterestFeedCache stores ranked interest rows', () => {
  const key = buildForYouInterestFeedCacheKey('topic', 'sports');
  const articles = [article('a'), article('b', 'technology')];
  const warmed = prewarmForYouInterestFeedCache(
    articles,
    'topic',
    'sports',
    (items) => items,
    1,
  );
  assert.equal(warmed, true);
  const cached = readForYouInterestFeedCache(key);
  assert.ok(cached);
  assert.equal(cached!.articles.length, 1);
  assert.equal(cached!.articles[0]?.id, 'a');
});

test('resolveForYouInterestFeedArticles serves stale cache while upstream loads', () => {
  const key = buildForYouInterestFeedCacheKey('keyword', 'cycling');
  const cachedArticle = article('bike-1');
  const now = Date.now();
  writeForYouInterestFeedCache(key, {
    articles: [cachedArticle],
    feedGeneration: 2,
    rawLength: 120,
    cachedAt: now,
  });

  const resolved = resolveForYouInterestFeedArticles({
    key,
    feedGeneration: 2,
    rawLength: 0,
    computed: [],
    allowStaleDuringLoad: true,
  });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.id, 'bike-1');
});

test('resolveForYouInterestFeedArticles serves TTL-stale cache without loading flag', () => {
  const key = buildForYouInterestFeedCacheKey('topic', 'sports');
  const cachedArticle = article('cached-1');
  const now = Date.now();
  writeForYouInterestFeedCache(key, {
    articles: [cachedArticle],
    feedGeneration: 1,
    rawLength: 50,
    cachedAt: now,
  });

  const resolved = resolveForYouInterestFeedArticles({
    key,
    feedGeneration: 2,
    rawLength: 80,
    computed: [],
  });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.id, 'cached-1');
});

test('resolveForYouInterestFeedArticles drops expired cache outside TTL', () => {
  const key = buildForYouInterestFeedCacheKey('topic', 'sports');
  writeForYouInterestFeedCache(key, {
    articles: [article('old')],
    feedGeneration: 1,
    rawLength: 50,
    cachedAt: Date.now() - FOR_YOU_INTEREST_FEED_CACHE_TTL_MS - 1,
  });

  const resolved = resolveForYouInterestFeedArticles({
    key,
    feedGeneration: 2,
    rawLength: 80,
    computed: [],
  });

  assert.equal(resolved.length, 0);
});

test('resolveForYouInterestFeedArticles falls back to preview when cache is empty', () => {
  const key = buildForYouInterestFeedCacheKey('topic', 'sports');
  const preview = [article('preview-1')];

  const resolved = resolveForYouInterestFeedArticles({
    key,
    feedGeneration: 1,
    rawLength: 10,
    computed: [],
    preview,
  });

  assert.equal(resolved.length, 1);
  assert.equal(resolved[0]?.id, 'preview-1');
});

test('prewarmForYouInterestFeedCache skips work when TTL cache is still showable', () => {
  const key = buildForYouInterestFeedCacheKey('topic', 'sports');
  writeForYouInterestFeedCache(key, {
    articles: [article('cached')],
    feedGeneration: 1,
    rawLength: 10,
    cachedAt: Date.now(),
  });

  const warmed = prewarmForYouInterestFeedCache(
    [article('a'), article('b', 'technology')],
    'topic',
    'sports',
    (items) => items,
    2,
  );

  assert.equal(warmed, false);
  assert.equal(readForYouInterestFeedCache(key)?.articles[0]?.id, 'cached');
});

test('isForYouInterestFeedRevalidating is true for TTL-stale metadata with no computed rows', () => {
  const key = buildForYouInterestFeedCacheKey('keyword', 'cycling');
  writeForYouInterestFeedCache(key, {
    articles: [article('bike-1')],
    feedGeneration: 1,
    rawLength: 40,
    cachedAt: Date.now(),
  });

  assert.equal(
    isForYouInterestFeedRevalidating({
      key,
      feedGeneration: 2,
      rawLength: 60,
      computedLength: 0,
    }),
    true,
  );
});

test('isForYouInterestFeedCacheShowable respects TTL window', () => {
  const entry = {
    articles: [article('a')],
    feedGeneration: 1,
    rawLength: 10,
    cachedAt: Date.now() - FOR_YOU_INTEREST_FEED_CACHE_TTL_MS + 1000,
  };

  assert.equal(isForYouInterestFeedCacheShowable(entry, 2, 20), true);
  assert.equal(isForYouInterestFeedCacheWithinTtl(entry), true);
});
