import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION,
  shouldAllowFeedLoadMore,
  shouldAutoTopUpFeed,
} from './feedLoadMoreGate';

test('shouldAllowFeedLoadMore allows bootstrap pagination before minimum is stocked', () => {
  assert.equal(shouldAllowFeedLoadMore(false, 0), true);
  assert.equal(shouldAllowFeedLoadMore(false, 19), true);
});

test('shouldAllowFeedLoadMore blocks pagination before user scroll once minimum is stocked', () => {
  assert.equal(shouldAllowFeedLoadMore(false, MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION), false);
  assert.equal(shouldAllowFeedLoadMore(false, 25), false);
});

test('shouldAllowFeedLoadMore allows pagination after user scroll once minimum is stocked', () => {
  assert.equal(shouldAllowFeedLoadMore(true, MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION), true);
  assert.equal(shouldAllowFeedLoadMore(true, 40), true);
});

test('shouldAllowFeedLoadMore allows pagination at feed end before scroll gate applies', () => {
  assert.equal(
    shouldAllowFeedLoadMore(false, MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION, true),
    true,
  );
});

test('shouldAutoTopUpFeed requests more pages while the visible feed is understocked', () => {
  assert.equal(shouldAutoTopUpFeed(0), false);
  assert.equal(shouldAutoTopUpFeed(4), true);
  assert.equal(shouldAutoTopUpFeed(MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION - 1), true);
  assert.equal(shouldAutoTopUpFeed(MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION), false);
});
