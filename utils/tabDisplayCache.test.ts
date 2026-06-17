import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import {
  hasShowableTabDisplayCache,
  isForYouDisplayCacheFresh,
  isTabDisplayCacheFresh,
  readTabDisplayCache,
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

  assert.equal(hasShowableTabDisplayCache('for-you'), true);
});
