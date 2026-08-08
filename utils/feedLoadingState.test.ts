import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowArticleFeedLoading, shouldShowFilteredFeedLoading } from './feedLoadingState';

test('shouldShowArticleFeedLoading stays true until hydration and fetch settle', () => {
  assert.equal(
    shouldShowArticleFeedLoading({
      articleCount: 0,
      isLoading: true,
      feedReady: false,
      persistedHydrated: false,
    }),
    true,
  );

  assert.equal(
    shouldShowArticleFeedLoading({
      articleCount: 0,
      isLoading: false,
      feedReady: true,
      persistedHydrated: false,
    }),
    true,
  );

  assert.equal(
    shouldShowArticleFeedLoading({
      articleCount: 0,
      isLoading: false,
      feedReady: false,
      persistedHydrated: true,
    }),
    true,
  );
});

test('shouldShowArticleFeedLoading stays true while background ingest is pending', () => {
  assert.equal(
    shouldShowArticleFeedLoading({
      articleCount: 0,
      isLoading: false,
      feedReady: true,
      persistedHydrated: true,
      awaitingBackgroundFeed: true,
    }),
    true,
  );
});

test('shouldShowArticleFeedLoading is false when cached articles are available', () => {
  assert.equal(
    shouldShowArticleFeedLoading({
      articleCount: 12,
      isLoading: false,
      feedReady: true,
      persistedHydrated: true,
    }),
    false,
  );

  assert.equal(
    shouldShowArticleFeedLoading({
      articleCount: 5,
      isLoading: false,
      feedReady: false,
      persistedHydrated: false,
    }),
    false,
  );
});

test('shouldShowFilteredFeedLoading keeps skeleton while display rebuilds over raw stock', () => {
  assert.equal(
    shouldShowFilteredFeedLoading({
      contextLoading: false,
      rawCount: 40,
      filteredCount: 0,
      displayReady: false,
    }),
    true,
  );

  assert.equal(
    shouldShowFilteredFeedLoading({
      contextLoading: false,
      rawCount: 40,
      filteredCount: 0,
      displayReady: true,
      isLoadingMore: true,
    }),
    true,
  );

  assert.equal(
    shouldShowFilteredFeedLoading({
      contextLoading: false,
      rawCount: 40,
      filteredCount: 0,
      displayReady: true,
      isRefreshing: true,
    }),
    true,
  );

  assert.equal(
    shouldShowFilteredFeedLoading({
      contextLoading: false,
      rawCount: 40,
      filteredCount: 0,
      displayReady: true,
    }),
    false,
  );

  assert.equal(
    shouldShowFilteredFeedLoading({
      contextLoading: false,
      rawCount: 40,
      filteredCount: 12,
      displayReady: true,
    }),
    false,
  );
});
