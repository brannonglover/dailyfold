import { Article } from '@/types';
import { TRENDING_WINDOW_MS } from '@/utils/feedOrdering';

/** Single-outlet spike: multiple stories in the trending window. */
export const HOT_BURST_MIN_COUNT = 2;

/** Very recent story treated as breaking even without a burst. */
export const HOT_BREAKING_RECENCY_MS = 60 * 60 * 1000;

function publishedAtMs(article: Article): number {
  return new Date(article.publishedAt).getTime();
}

export function isInTrendingWindow(article: Article, nowMs: number): boolean {
  return nowMs - publishedAtMs(article) <= TRENDING_WINDOW_MS;
}

function sourceBurstCounts(articles: Article[], nowMs: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const article of articles) {
    if (!isInTrendingWindow(article, nowMs)) continue;
    counts.set(article.source, (counts.get(article.source) ?? 0) + 1);
  }
  return counts;
}

export type HotTrendingCandidate = {
  article: Article;
  burstCount: number;
};

/**
 * Articles that are "hot" in the feed sense: in the 6h trending window and either
 * part of an outlet burst (2+ recent stories) or published within the last hour.
 */
export function findHotTrendingCandidates(
  articles: Article[],
  nowMs: number = Date.now(),
): HotTrendingCandidate[] {
  const burstCounts = sourceBurstCounts(articles, nowMs);
  const seen = new Set<string>();
  const candidates: HotTrendingCandidate[] = [];

  for (const article of articles) {
    if (!isInTrendingWindow(article, nowMs)) continue;
    if (seen.has(article.id)) continue;

    const burstCount = burstCounts.get(article.source) ?? 0;
    const isBreaking = nowMs - publishedAtMs(article) <= HOT_BREAKING_RECENCY_MS;
    if (burstCount < HOT_BURST_MIN_COUNT && !isBreaking) continue;

    seen.add(article.id);
    candidates.push({ article, burstCount });
  }

  candidates.sort((a, b) => {
    const burstDiff = b.burstCount - a.burstCount;
    if (burstDiff !== 0) return burstDiff;
    return publishedAtMs(b.article) - publishedAtMs(a.article);
  });

  return candidates;
}
