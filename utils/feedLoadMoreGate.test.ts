import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION,
  shouldAllowFeedLoadMore,
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
