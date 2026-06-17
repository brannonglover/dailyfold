import {
  buildNotForMeOptions,
  getCachedNotForMeOptions,
  NotForMeOption,
} from '@/services/notForMeOptions';
import { Article, FeedSource } from '@/types';
import { deferAfterPaint } from '@/utils/deferAfterPaint';

/** Warm options off the press/tap critical path without waiting for scroll to settle. */
export function scheduleWarmNotForMeOptions(article: Article, sources: FeedSource[]): () => void {
  if (getCachedNotForMeOptions(article, sources)) {
    return () => {};
  }

  let cancelled = false;
  const cancelDefer = deferAfterPaint(() => {
    if (!cancelled) buildNotForMeOptions(article, sources);
  });

  return () => {
    cancelled = true;
    cancelDefer();
  };
}

/** Load options after the sheet can paint; does not wait for feed scroll to end. */
export function scheduleLoadNotForMeOptions(
  article: Article,
  sources: FeedSource[],
  onReady: (options: NotForMeOption[]) => void,
): () => void {
  let cancelled = false;
  const cached = getCachedNotForMeOptions(article, sources);

  const deliver = () => {
    if (cancelled) return;
    onReady(cached ?? buildNotForMeOptions(article, sources));
  };

  if (cached) {
    queueMicrotask(deliver);
    return () => {
      cancelled = true;
    };
  }

  const cancelDefer = deferAfterPaint(deliver);
  return () => {
    cancelled = true;
    cancelDefer();
  };
}
