import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from './feedLoadMoreGate';
import { isRenderableFeedSnapshot, isSessionFeedSnapshot } from './feedSnapshotHydration';

function article(id: string): Article {
  return {
    id,
    title: id,
    excerpt: '',
    body: '',
    source: 'Test',
    imageUrl: 'https://example.com/i.jpg',
    topics: ['world'],
    readTimeMinutes: 1,
    publishedAt: '2026-10-01T12:00:00.000Z',
    url: `https://example.com/${id}`,
  };
}

test('isRenderableFeedSnapshot accepts any non-empty list', () => {
  assert.equal(isRenderableFeedSnapshot(null), false);
  assert.equal(isRenderableFeedSnapshot([]), false);
  assert.equal(isRenderableFeedSnapshot([article('a')]), true);
  assert.equal(
    isRenderableFeedSnapshot(Array.from({ length: 6 }, (_, i) => article(String(i)))),
    true,
  );
});

test('isSessionFeedSnapshot is the stocked-feed gate, not the render gate', () => {
  const short = Array.from({ length: 6 }, (_, i) => article(String(i)));
  const stocked = Array.from(
    { length: MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION },
    (_, i) => article(String(i)),
  );
  assert.equal(isRenderableFeedSnapshot(short), true);
  assert.equal(isSessionFeedSnapshot(short), false);
  assert.equal(isSessionFeedSnapshot(stocked), true);
});
