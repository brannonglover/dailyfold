import type { Article } from '@/types';

/**
 * Stories fetched specifically for the user's interests (archive search, interest publishers).
 *
 * The feed pool is replaced wholesale by refreshes, snapshot adoption and the initial network
 * load — several times during a cold start — and each replacement drops these stories. Keeping
 * them here lets the pool get them straight back, instead of leaving interests empty until a
 * refetch happens to survive the next replacement.
 */
export interface BoostedArticleStore {
  remember(articles: readonly Article[]): void;
  /** `pool` plus any remembered stories it lacks (same array when nothing is missing). */
  restoreInto(pool: Article[]): Article[];
}

export function createBoostedArticleStore(): BoostedArticleStore {
  const byId = new Map<string, Article>();
  return {
    remember(articles) {
      for (const article of articles) byId.set(article.id, article);
    },
    restoreInto(pool) {
      if (byId.size === 0) return pool;
      const have = new Set(pool.map((article) => article.id));
      const missing: Article[] = [];
      for (const article of byId.values()) {
        if (!have.has(article.id)) missing.push(article);
      }
      return missing.length > 0 ? [...pool, ...missing] : pool;
    },
  };
}
