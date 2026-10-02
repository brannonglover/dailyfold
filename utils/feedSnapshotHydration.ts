import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from './feedLoadMoreGate';
import { Article } from '@/types';

/**
 * A snapshot is renderable as soon as it has any articles. Completeness (stocked)
 * is a separate question — a 6-story cache should paint immediately rather than
 * being discarded for a spinner.
 */
export function isRenderableFeedSnapshot(
  snapshot: Article[] | null | undefined,
): boolean {
  return Array.isArray(snapshot) && snapshot.length > 0;
}

/**
 * True when the snapshot is a complete enough session feed that a launch/resume
 * refresh should not replace it underneath the reader. Short snapshots still
 * render, but the first network response of that launch may replace them.
 */
export function isSessionFeedSnapshot(snapshot: Article[]): boolean {
  return snapshot.length >= MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION;
}
