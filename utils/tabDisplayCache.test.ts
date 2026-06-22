import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import {
  hydrateTabDisplayState,
  isDisplayFeedUnderstocked,
  isDisplayFeedSynced,
  isForYouDisplayCacheFresh,
  isTabDisplayCacheFresh,
  readTabDisplayCache,
  resolveTabDisplayFeed,
  writeTabDisplayCache,
  wouldClobberFreshTabDisplayCache,
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
    personalizationKey: '{"forYouTopics":["technology"]}',
    orderLocked: true,
  };

  assert.equal(
    isForYouDisplayCacheFresh(entry, 3, 100, 'k1', '{"forYouTopics":["technology"]}'),
    true,
  );
  assert.equal(
    isForYouDisplayCacheFresh(entry, 3, 100, 'k1', '{"forYouTopics":["culture"]}'),
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

test('resolveTabDisplayFeed shows same-filter cache while context is loading', () => {
  const cached = [article('cached-1'), article('cached-2')];
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
      contextLoading: true,
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

test('resolveTabDisplayFeed hides display while context is loading without cache', () => {
  assert.deepEqual(
    resolveTabDisplayFeed({
      contextLoading: true,
      displayArticles: [],
      displayReady: false,
      tabKey: 'latest',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k-no-cache',
    }),
    [],
  );
});

test('resolveTabDisplayFeed falls back to cache before displayReady', () => {
  const cached = [article('cached-1'), article('cached-2')];
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

test('resolveTabDisplayFeed prefers in-progress display over cache', () => {
  const cached = [article('cached-1'), article('cached-2')];
  const inProgress = [article('live-1'), article('live-2'), article('live-3')];
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
      displayArticles: inProgress,
      displayReady: false,
      tabKey: 'latest',
      feedGeneration: 2,
      rawLength: 20,
      filterKey: 'k1',
    }),
    inProgress,
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

test('resolveTabDisplayFeed ignores cache when filter key changed', () => {
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
      filterKey: 'k2',
    }),
    [],
  );
});

test('resolveTabDisplayFeed shows stale cache during loading after feed generation drift', () => {
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
      contextLoading: true,
      displayArticles: [],
      displayReady: false,
      tabKey: 'latest',
      feedGeneration: 3,
      rawLength: 25,
      filterKey: 'k1',
    }),
    cached,
  );
});

test('resolveTabDisplayFeed ignores stale cache after load completes', () => {
  const cached = Array.from({ length: 4 }, (_, index) => article(`cached-${index}`));
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
      feedGeneration: 3,
      rawLength: 25,
      filterKey: 'k1',
    }),
    [],
  );
});

test('isDisplayFeedUnderstocked detects truncated visible feeds', () => {
  assert.equal(isDisplayFeedUnderstocked(4, 20), true);
  assert.equal(isDisplayFeedUnderstocked(20, 20), false);
  assert.equal(isDisplayFeedUnderstocked(0, 20), false);
});

test('hydrateTabDisplayState seeds in-memory state from a fresh cache snapshot', () => {
  const cached = Array.from({ length: 5 }, (_, index) => article(`cached-${index}`));
  writeTabDisplayCache('latest', {
    displayArticles: cached,
    displayReady: true,
    feedGeneration: 2,
    rawLength: 20,
    filterKey: 'k1',
    orderLocked: false,
  });

  assert.deepEqual(
    hydrateTabDisplayState({
      tabKey: 'latest',
      filterKey: 'k1',
      feedGeneration: 2,
      rawLength: 20,
    }),
    { displayArticles: cached, displayReady: true },
  );
});

test('hydrateTabDisplayState ignores stale cache snapshots', () => {
  writeTabDisplayCache('latest', {
    displayArticles: [article('stale')],
    displayReady: true,
    feedGeneration: 1,
    rawLength: 2,
    filterKey: 'k1',
    orderLocked: false,
  });

  assert.deepEqual(
    hydrateTabDisplayState({
      tabKey: 'latest',
      filterKey: 'k1',
      feedGeneration: 2,
      rawLength: 20,
    }),
    { displayArticles: [], displayReady: false },
  );
});

test('wouldClobberFreshTabDisplayCache blocks wiping a fresh cache with empty state', () => {
  writeTabDisplayCache('latest', {
    displayArticles: [article('a1')],
    displayReady: true,
    feedGeneration: 2,
    rawLength: 20,
    filterKey: 'k1',
    orderLocked: false,
  });

  assert.equal(
    wouldClobberFreshTabDisplayCache('latest', [], false, 2, 20, 'k1'),
    true,
  );
  assert.equal(
    wouldClobberFreshTabDisplayCache('latest', [article('live')], true, 2, 20, 'k1'),
    false,
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
