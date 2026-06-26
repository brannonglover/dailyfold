/** Sync feed scroll state — shared by card taps and the source menu trigger. */
export const FEED_OVERLAY_OPEN_DELAY_MS = 50;

/** Scroll end can be lost when the list remounts or paginates mid-gesture. */
export const FEED_DRAG_STALE_MS = 3_000;

let dragging = false;
let dragStartedAt = 0;
let endedAt = 0;

export function markFeedScrollBeginDrag(now = Date.now()): void {
  dragging = true;
  dragStartedAt = now;
}

export function markFeedScrollEnded(now = Date.now()): void {
  dragging = false;
  endedAt = now;
}

export function isFeedScrollDragging(now = Date.now()): boolean {
  clearStaleFeedDrag(now);
  return dragging;
}

function clearStaleFeedDrag(now = Date.now()): void {
  if (!dragging) return;
  if (now - dragStartedAt <= FEED_DRAG_STALE_MS) return;
  dragging = false;
  endedAt = 0;
}

/** True when overlay taps (source menu) should be honored — not used for article open. */
export function canOpenFeedOverlay(now = Date.now()): boolean {
  clearStaleFeedDrag(now);
  if (dragging) return false;
  if (endedAt === 0) return true;
  return now - endedAt > FEED_OVERLAY_OPEN_DELAY_MS;
}

export function resetFeedScrollState(): void {
  dragging = false;
  dragStartedAt = 0;
  endedAt = 0;
}

/** Clear a drag left open after pagination or list remount. */
export function reconcileFeedScrollAfterContentChange(now = Date.now()): void {
  if (!dragging) return;
  markFeedScrollEnded(now);
}
