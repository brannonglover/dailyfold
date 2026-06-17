import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import { hasActionablePending, pendingNotAlreadyInFeed, reconcilePendingWithFeeds } from './pendingFeedArticles';

function article(id: string): Article {
  return {
    id,
    title: id,
    excerpt: '',
    body: '',
    imageUrl: '',
    source: 'Test',
    sourceLogo: '',
    topics: [],
    sportTags: [],
    readTimeMinutes: 1,
    publishedAt: '2026-01-01T00:00:00.000Z',
    url: `https://example.com/articles/${id}`,
    requiresSubscription: false,
  };
}

test('pendingNotAlreadyInFeed keeps only stories missing from the feed', () => {
  const pending = [article('a'), article('b'), article('c')];
  const live = [article('b'), article('d')];

  assert.deepEqual(
    pendingNotAlreadyInFeed(pending, live).map((item) => item.id),
    ['a', 'c'],
  );
});

test('pendingNotAlreadyInFeed returns empty when every pending story is already live', () => {
  const pending = [article('a'), article('b')];
  const live = [article('a'), article('b'), article('c')];

  assert.deepEqual(pendingNotAlreadyInFeed(pending, live), []);
  assert.equal(hasActionablePending(pending, live), false);
});

test('hasActionablePending is true when at least one pending story is new', () => {
  const pending = [article('new')];
  const live = [article('old')];

  assert.equal(hasActionablePending(pending, live), true);
});

test('reconcilePendingWithFeeds drops rows already in any feed snapshot', () => {
  const pending = [article('a'), article('b'), article('c')];
  const contextFeed = [article('b')];
  const displayFeed = [article('c'), article('d')];

  assert.deepEqual(
    reconcilePendingWithFeeds(pending, contextFeed, displayFeed).map((item) => item.id),
    ['a'],
  );
});

test('reconcilePendingWithFeeds returns empty when every pending story is already visible', () => {
  const pending = [article('a'), article('b')];
  const contextFeed = [article('a')];
  const displayFeed = [article('b'), article('c')];

  assert.deepEqual(reconcilePendingWithFeeds(pending, contextFeed, displayFeed), []);
});
