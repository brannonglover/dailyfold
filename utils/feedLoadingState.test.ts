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

test('shouldShowArticleFeedLoading stays hidden for a short cached snapshot even while fetching', () => {
  assert.equal(
    shouldShowArticleFeedLoading({
      articleCount: 6,
      isLoading: true,
      feedReady: true,
      persistedHydrated: true,
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
    false,
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

test('shouldShowFilteredFeedLoading stays true while a chip boost is in flight', () => {
  assert.equal(
    shouldShowFilteredFeedLoading({
      contextLoading: false,
      rawCount: 40,
      filteredCount: 0,
      displayReady: true,
      awaitingChipBoost: true,
    }),
    true,
  );

  assert.equal(
    shouldShowFilteredFeedLoading({
      contextLoading: false,
      rawCount: 40,
      filteredCount: 8,
      displayReady: true,
      awaitingChipBoost: true,
    }),
    false,
  );
});
