import { ARTICLE_PAGE_SIZE, fetchArticles, type FetchArticlesResult } from '@/services/articles';

let warmPromise: Promise<FetchArticlesResult | undefined> | null = null;
let warmResult: FetchArticlesResult | null = null;

/** Kick off an article fetch as early as possible (e.g. on app boot). */
export function warmArticleCache(): void {
  if (warmPromise || warmResult) return;
  warmPromise = fetchArticles({ limit: ARTICLE_PAGE_SIZE })
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
