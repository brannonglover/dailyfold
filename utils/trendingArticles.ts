import { Article } from '@/types';
import { TRENDING_WINDOW_MS } from '@/utils/feedOrdering';

/** Single-outlet spike: multiple stories in the trending window. */
export const HOT_BURST_MIN_COUNT = 2;

/** Very recent story treated as breaking even without a burst. */
export const HOT_BREAKING_RECENCY_MS = 60 * 60 * 1000;

function publishedAtMs(article: Article): number {
  return new Date(article.publishedAt).getTime();
}

/** Published within the last hour — eligible for cold-start trending alerts. */
export function isBreakingTrendingArticle(article: Article, nowMs: number = Date.now()): boolean {
  return nowMs - publishedAtMs(article) <= HOT_BREAKING_RECENCY_MS;
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

/** Most trending story in a batch (highest outlet burst, then most recent) — promoted to the feed hero slot when a pending batch is applied. */
export function mostTrendingArticle(articles: Article[], nowMs: number = Date.now()): Article | null {
  return findHotTrendingCandidates(articles, nowMs)[0]?.article ?? null;
}

/** Article ids in the feed trending window (6h) — used for badges and hero styling, not sort order. */
export function buildFeedTrendingArticleIds(
  articles: Article[],
  nowMs: number = Date.now(),
): Set<string> {
  const ids = new Set<string>();
  for (const article of articles) {
    if (isInTrendingWindow(article, nowMs)) ids.add(article.id);
  }
  return ids;
}

const MS_PER_DAY = 86_400_000;

/** Calendar days between publish date and now (local midnight boundaries). */
export function calendarDaysSincePublished(article: Article, nowMs: number = Date.now()): number {
  const published = new Date(article.publishedAt);
  const now = new Date(nowMs);
  const pubDay = new Date(published.getFullYear(), published.getMonth(), published.getDate()).getTime();
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((nowDay - pubDay) / MS_PER_DAY));
}

export type TrendingBadgeKind = 'trending' | 'still-trending';

export type TrendingBadge = {
  kind: TrendingBadgeKind;
  days: number;
};

export const TRENDING_BADGE_LABEL = 'Trending';

/** Visible badge copy — adds duration once publish spans 2+ calendar days. */
export function trendingBadgeLabel(badge: TrendingBadge): string {
  if (badge.days >= 2) return `${TRENDING_BADGE_LABEL} · ${badge.days}d`;
  return TRENDING_BADGE_LABEL;
}

/** Full phrase for compact (icon-only) badges and screen readers. */
export function trendingBadgeAccessibilityLabel(badge: TrendingBadge): string {
  if (badge.days >= 2) return `${badge.days} days trending`;
  return TRENDING_BADGE_LABEL;
}

function makeTrendingBadge(
  article: Article,
  nowMs: number,
  kind: TrendingBadgeKind,
): TrendingBadge {
  return { kind, days: calendarDaysSincePublished(article, nowMs) };
}

/**
 * Feed cards that should show a trending badge and which label to use.
 *
 * Badges are limited to large card surfaces — hero and newspaper featured rows.
 * Compact grid cards never receive a badge from this builder.
 *
 * - Hero (#1): always — sticky head, including multi-day stories still pinned at top.
 * - Newspaper featured row (outlet burst leaders): "Trending".
 * - Compact grid / other hot-but-not-featured stories: no badge.
 * - Multi-day badges append duration (e.g. "Trending · 2d") once publish spans 2+ calendar days.
 */
export function buildFeedTrendingBadgeByArticleId(
  articles: Article[],
  options?: {
    featuredIds?: Set<string>;
    nowMs?: number;
  },
): Map<string, TrendingBadge> {
  const nowMs = options?.nowMs ?? Date.now();
  const featuredIds = options?.featuredIds ?? new Set<string>();
  const inWindow = buildFeedTrendingArticleIds(articles, nowMs);
  const hotIds = new Set(
    findHotTrendingCandidates(articles, nowMs).map((candidate) => candidate.article.id),
  );
  const badges = new Map<string, TrendingBadge>();

  articles.forEach((article, index) => {
    const isHero = index === 0;
    const inTrendingWindow = inWindow.has(article.id);
    const isHot = hotIds.has(article.id);
    const isFeatured = featuredIds.has(article.id);

    if (isHero) {
      const kind: TrendingBadgeKind =
        inTrendingWindow || isHot ? 'trending' : 'still-trending';
      badges.set(article.id, makeTrendingBadge(article, nowMs, kind));
      return;
    }

    if (isFeatured) {
      badges.set(article.id, makeTrendingBadge(article, nowMs, 'trending'));
    }
  });

  return badges;
}
