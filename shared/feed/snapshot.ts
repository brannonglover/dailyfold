import { Article } from '../../types';

export const FEED_SNAPSHOT_SOURCE_ALL = '__all_sources__';

/** Skip a background network refresh if the last one succeeded this recently. */
export const BACKGROUND_FEED_REFRESH_FLOOR_MS = 5 * 60 * 1000;

export interface FeedSnapshotMeta {
  lastFeedRefreshAt: string | null;
  newestPublishedAt: string | null;
  rankWindowStart: string | null;
  snapshotRevision: number;
}

export interface FeedSnapshotRecord extends FeedSnapshotMeta {
  articles: Article[];
}

export interface FeedSnapshotDiff {
  newCount: number;
  removedCount: number;
  /** True when the id sequence changed (new ranking or membership). */
  replaced: boolean;
}

export function feedSnapshotSourceKey(enabledSourceIds: string[] | undefined): string {
  if (!enabledSourceIds || enabledSourceIds.length === 0) return FEED_SNAPSHOT_SOURCE_ALL;
  return enabledSourceIds.join(',');
}

export function emptyFeedSnapshotMeta(): FeedSnapshotMeta {
  return {
    lastFeedRefreshAt: null,
    newestPublishedAt: null,
    rankWindowStart: null,
    snapshotRevision: 0,
  };
}

export function newestPublishedAtFromArticles(articles: Article[]): string | null {
  let newest: string | null = null;
  for (const article of articles) {
    if (!article.publishedAt) continue;
    if (!newest || article.publishedAt > newest) newest = article.publishedAt;
  }
  return newest;
}

export function articleIdOrder(articles: Article[]): string[] {
  return articles.map((article) => article.id);
}

export function diffFeedSnapshots(previous: Article[], next: Article[]): FeedSnapshotDiff {
  const prevIds = new Set(previous.map((article) => article.id));
  const nextIds = new Set(next.map((article) => article.id));
  let newCount = 0;
  for (const id of nextIds) {
    if (!prevIds.has(id)) newCount += 1;
  }
  let removedCount = 0;
  for (const id of prevIds) {
    if (!nextIds.has(id)) removedCount += 1;
  }
  const prevOrder = articleIdOrder(previous);
  const nextOrder = articleIdOrder(next);
  const replaced =
    prevOrder.length !== nextOrder.length ||
    prevOrder.some((id, index) => id !== nextOrder[index]);
  return { newCount, removedCount, replaced };
}

/**
 * Incoming background/foreground pages only replace a valid snapshot when they
 * actually contain articles. An empty or failed fetch must leave the previous
 * record untouched.
 */
export function canReplaceFeedSnapshot(articles: Article[]): boolean {
  return articles.length > 0;
}

export function shouldSkipBackgroundRefresh(
  lastFeedRefreshAt: string | null | undefined,
  nowMs: number,
  floorMs: number = BACKGROUND_FEED_REFRESH_FLOOR_MS,
): boolean {
  if (!lastFeedRefreshAt) return false;
  const last = Date.parse(lastFeedRefreshAt);
  if (!Number.isFinite(last)) return false;
  return nowMs - last < floorMs;
}

export function shouldAdoptPersistedSnapshot(
  hydratedRevision: number | null | undefined,
  persistedRevision: number,
): boolean {
  return persistedRevision > (hydratedRevision ?? -1);
}

export function snapshotAgeMs(
  lastFeedRefreshAt: string | null | undefined,
  nowMs: number,
): number | null {
  if (!lastFeedRefreshAt) return null;
  const last = Date.parse(lastFeedRefreshAt);
  if (!Number.isFinite(last)) return null;
  return Math.max(0, nowMs - last);
}

export function nextSnapshotRevision(
  previous: FeedSnapshotMeta | null | undefined,
  replaced: boolean,
): number {
  const current = previous?.snapshotRevision ?? 0;
  if (current <= 0) return 1;
  return replaced ? current + 1 : current;
}

/**
 * Accept both the versioned record and the Phase 2 bare article array.
 * Never throw — a corrupt payload is treated as missing so we keep the
 * previous valid snapshot in memory.
 */
export function parseFeedSnapshotRecord(raw: unknown): FeedSnapshotRecord | null {
  if (raw == null) return null;

  if (Array.isArray(raw)) {
    const articles = raw as Article[];
    if (articles.length === 0) return null;
    return {
      articles,
      ...emptyFeedSnapshotMeta(),
      newestPublishedAt: newestPublishedAtFromArticles(articles),
    };
  }

  if (typeof raw !== 'object') return null;
  const record = raw as Partial<FeedSnapshotRecord>;
  if (!Array.isArray(record.articles) || record.articles.length === 0) return null;

  const revision =
    typeof record.snapshotRevision === 'number' && Number.isFinite(record.snapshotRevision)
      ? Math.max(0, Math.floor(record.snapshotRevision))
      : 0;

  return {
    articles: record.articles,
    lastFeedRefreshAt:
      typeof record.lastFeedRefreshAt === 'string' ? record.lastFeedRefreshAt : null,
    newestPublishedAt:
      typeof record.newestPublishedAt === 'string'
        ? record.newestPublishedAt
        : newestPublishedAtFromArticles(record.articles),
    rankWindowStart:
      typeof record.rankWindowStart === 'string' ? record.rankWindowStart : null,
    snapshotRevision: revision,
  };
}

export function buildFeedSnapshotRecord(
  articles: Article[],
  previous: FeedSnapshotRecord | null | undefined,
  extras: {
    lastFeedRefreshAt: string;
    newestPublishedAt?: string | null;
    rankWindowStart?: string | null;
  },
): FeedSnapshotRecord | null {
  if (!canReplaceFeedSnapshot(articles)) return null;
  const diff = diffFeedSnapshots(previous?.articles ?? [], articles);
  return {
    articles,
    lastFeedRefreshAt: extras.lastFeedRefreshAt,
    newestPublishedAt:
      extras.newestPublishedAt ?? newestPublishedAtFromArticles(articles),
    rankWindowStart: extras.rankWindowStart ?? previous?.rankWindowStart ?? null,
    snapshotRevision: nextSnapshotRevision(previous, diff.replaced),
  };
}
