import { Article, SportTag, Topic } from '@/types';

/**
 * A chip's scoped candidates, fetched ahead of the tap. Held in memory only and kept out
 * of the feed pool until the reader selects the chip, so prewarming never reshuffles the
 * list they are looking at.
 */
export const CHIP_PREWARM_TTL_MS = 30 * 60_000;

interface Entry {
  articles: Article[];
  at: number;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<Article[] | null>>();

export function chipPrewarmKey(topics: readonly Topic[], sportTags: readonly SportTag[]): string {
  return JSON.stringify({ t: [...topics].sort(), s: [...sportTags].sort() });
}

export function readChipPrewarm(key: string, nowMs = Date.now()): Article[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (nowMs - entry.at > CHIP_PREWARM_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.articles;
}

/**
 * Cached → in-flight → fetch, in that order, so a tap that lands mid-prewarm joins the
 * running request instead of issuing a second one. `bypassCache` is for explicit
 * "pull for this chip" requests (force refresh), which must hit the network.
 * Resolves null on error or an empty page; nothing is cached for those.
 */
export function loadChipArticles(
  key: string,
  fetcher: () => Promise<Article[]>,
  options?: { bypassCache?: boolean; nowMs?: number },
): Promise<Article[] | null> {
  if (!options?.bypassCache) {
    const cached = readChipPrewarm(key, options?.nowMs);
    if (cached) return Promise.resolve(cached);
    const running = inFlight.get(key);
    if (running) return running;
  }

  const request = fetcher()
    .then((articles) => {
      if (articles.length === 0) return null;
      cache.set(key, { articles, at: options?.nowMs ?? Date.now() });
      return articles;
    })
    .catch(() => null)
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export function clearChipPrewarmForTests(): void {
  cache.clear();
  inFlight.clear();
}
