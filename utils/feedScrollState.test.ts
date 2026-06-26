import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FEED_DRAG_STALE_MS,
  FEED_OVERLAY_OPEN_DELAY_MS,
  canOpenFeedOverlay,
  isFeedScrollDragging,
  markFeedScrollBeginDrag,
  markFeedScrollEnded,
  reconcileFeedScrollAfterContentChange,
  resetFeedScrollState,
} from './feedScrollState';

test('canOpenFeedOverlay allows taps when scroll is idle', () => {
  resetFeedScrollState();
  assert.equal(canOpenFeedOverlay(1_000), true);
});

test('canOpenFeedOverlay blocks while dragging', () => {
  resetFeedScrollState();
  markFeedScrollBeginDrag(1_000);
  assert.equal(isFeedScrollDragging(1_000), true);
  assert.equal(canOpenFeedOverlay(1_050), false);
});

test('canOpenFeedOverlay blocks briefly after scroll ends', () => {
  resetFeedScrollState();
  const endedAt = 1_000;
  markFeedScrollEnded(endedAt);
  assert.equal(canOpenFeedOverlay(endedAt + 1), false);
  assert.equal(
    canOpenFeedOverlay(endedAt + FEED_OVERLAY_OPEN_DELAY_MS + 1),
    true,
  );
});

test('canOpenFeedOverlay recovers from stale drag without scroll end', () => {
  resetFeedScrollState();
  markFeedScrollBeginDrag(1_000);
  assert.equal(canOpenFeedOverlay(1_000 + FEED_DRAG_STALE_MS + 1), true);
  assert.equal(isFeedScrollDragging(1_000 + FEED_DRAG_STALE_MS + 1), false);
});

test('reconcileFeedScrollAfterContentChange clears an active drag', () => {
  resetFeedScrollState();
  markFeedScrollBeginDrag(5_000);
  reconcileFeedScrollAfterContentChange(5_100);
  assert.equal(isFeedScrollDragging(5_100), false);
  assert.equal(canOpenFeedOverlay(5_100 + FEED_OVERLAY_OPEN_DELAY_MS + 1), true);
});
