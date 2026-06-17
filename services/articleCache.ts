import { fetchArticles, type FetchArticlesResult } from '@/services/articles';
import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from '@/utils/feedLoadMoreGate';

let warmPromise: Promise<FetchArticlesResult | undefined> | null = null;
let warmResult: FetchArticlesResult | null = null;

/** Kick off an article fetch as early as possible (e.g. on app boot). */
export function warmArticleCache(): void {
  if (warmPromise || warmResult) return;
  warmPromise = fetchArticles({ limit: MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION })
    .then((result) => {
      warmResult = result;
      return result;
    })
    .catch(() => undefined)
    .finally(() => {
      warmPromise = null;
    });
}

/** Returns a warm fetch once, so the feed can adopt it instead of starting over. */
export function takeWarmArticleCache(): Promise<FetchArticlesResult> | null {
  if (warmPromise) {
    const pending = warmPromise;
    warmPromise = null;
    warmResult = null;
    return pending.then((result) => {
      if (!result) throw new Error('Warm article cache unavailable');
      return result;
    });
  }
  if (warmResult) {
    const cached = warmResult;
    warmResult = null;
    return Promise.resolve(cached);
  }
  return null;
}
