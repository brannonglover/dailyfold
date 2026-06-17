import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import {
  isDisplayFeedSynced,
  isForYouDisplayCacheFresh,
  isTabDisplayCacheFresh,
  readTabDisplayCache,
  resolveTabDisplayFeed,
  writeTabDisplayCache,
} from '@/utils/tabDisplayCache';

const article = (id: string): Article => ({
  id,
  title: `Title ${id}`,
  excerpt: 'Excerpt',
  body: 'Body',
  source: 'Source',
  imageUrl: 'https://example.com/image.jpg',
  publishedAt: '2026-01-01T00:00:00.000Z',
  topics: ['world'],
  url: `https://example.com/${id}`,
  readTimeMinutes: 3,
});

test('tabDisplayCache round-trips display state per tab key', () => {
  writeTabDisplayCache('latest', {
    displayArticles: [article('a1')],
    displayReady: true,
    feedGeneration: 2,
    rawLength: 50,
    filterKey: '{"topics":[]}',
    orderLocked: true,
  });

  const cached = readTabDisplayCache('latest');
  assert.equal(cached?.displayArticles.length, 1);
  assert.equal(cached?.displayReady, true);
  assert.equal(cached?.orderLocked, true);
});

test('tabDisplayCache detects fresh cache snapshots', () => {
  const entry = {
    displayArticles: [article('a1')],
    displayReady: true,
    feedGeneration: 3,
    rawLength: 100,
    filterKey: 'k1',
    orderLocked: true,
  };

  assert.equal(isTabDisplayCacheFresh(entry, 3, 100, 'k1'), true);
  assert.equal(isTabDisplayCacheFresh(entry, 4, 100, 'k1'), false);
  assert.equal(isTabDisplayCacheFresh(entry, 3, 101, 'k1'), false);
  assert.equal(isTabDisplayCacheFresh(entry, 3, 100, 'k2'), false);
});

test('forYou display cache requires matching personalization key', () => {
  const entry = {
    displayArticles: [article('a1')],
    displayReady: true,
    feedGeneration: 3,
    rawLength: 100,
    filterKey: 'k1',
    personalizationKey: '{"liked":["a1"],"clicked":[]}',
    orderLocked: true,
  };

  assert.equal(
    isForYouDisplayCacheFresh(entry, 3, 100, 'k1', '{"liked":["a1"],"clicked":[]}'),
    true,
  );
  assert.equal(
    isForYouDisplayCacheFresh(entry, 3, 100, 'k1', '{"liked":["a2"],"clicked":[]}'),
    false,
  );
});

test('hasShowableTabDisplayCache is true when cached articles exist', () => {
  writeTabDisplayCache('for-you', {
    displayArticles: [article('fy1')],
    displayReady: true,
    feedGeneration: 1,
    rawLength: 10,
    filterKey: 'k',
    orderLocked: false,
  });

  assert.equal(readTabDisplayCache('for-you')?.displayArticles.length, 1);
});

test('resolveTabDisplayFeed hides display while context is loading', () => {
  assert.deepEqual(
    resolveTabDisplayFeed({
      contextLoading: true,
      displayArticles: [article('stale-1'), article('stale-2')],
      displayReady: true,
      tabKey: 'latest',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    [],
  );
});

test('resolveTabDisplayFeed hides in-memory display until displayReady', () => {
  assert.deepEqual(
    resolveTabDisplayFeed({
      contextLoading: false,
      displayArticles: [article('old-1'), article('old-2')],
      displayReady: false,
      tabKey: 'latest',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    [],
  );
});

test('resolveTabDisplayFeed returns ready display articles', () => {
  const visible = Array.from({ length: 20 }, (_, index) => article(`live-${index}`));

  assert.deepEqual(
    resolveTabDisplayFeed({
      contextLoading: false,
      displayArticles: visible,
      displayReady: true,
      tabKey: 'latest',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    visible,
  );
});

test('resolveTabDisplayFeed can fall back to a fresh cache snapshot', () => {
  const cached = Array.from({ length: 20 }, (_, index) => article(`cached-${index}`));
  writeTabDisplayCache('latest', {
    displayArticles: cached,
    displayReady: true,
    feedGeneration: 2,
    rawLength: 20,
    filterKey: 'k1',
    orderLocked: false,
  });

  assert.deepEqual(
    resolveTabDisplayFeed({
      contextLoading: false,
      displayArticles: [],
      displayReady: false,
      tabKey: 'latest',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    cached,
  );
});

test('resolveTabDisplayFeed ignores stale cache fallback', () => {
  writeTabDisplayCache('latest', {
    displayArticles: [article('stale-1'), article('stale-2')],
    displayReady: true,
    feedGeneration: 1,
    rawLength: 2,
    filterKey: 'k1',
    orderLocked: false,
  });

  assert.deepEqual(
    resolveTabDisplayFeed({
      contextLoading: false,
      displayArticles: [],
      displayReady: false,
      tabKey: 'latest',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    [],
  );
});

test('isDisplayFeedSynced requires generation, length, and filter key', () => {
  assert.equal(
    isDisplayFeedSynced({
      displayReady: true,
      displayFeedGeneration: 2,
      displayRawLength: 20,
      displayFilterKey: 'k1',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    true,
  );

  assert.equal(
    isDisplayFeedSynced({
      displayReady: true,
      displayFeedGeneration: 1,
      displayRawLength: 20,
      displayFilterKey: 'k1',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    false,
  );
});
