import {
  canReplaceFeedSnapshot,
  diffFeedSnapshots,
  feedSnapshotSourceKey,
  shouldSkipBackgroundRefresh,
  type FeedSnapshotRecord,
} from '@/shared/feed/snapshot';
import { Article, FeedSource, UserPreferences } from '@/types';
import {
  logBackgroundRefreshEnd,
  logBackgroundRefreshStart,
} from '@/utils/feedLifecycleLog';

export type BackgroundFeedRefreshStatus =
  | 'replaced'
  | 'unchanged'
  | 'skipped'
  | 'empty'
  | 'expired'
  | 'failed';

export interface BackgroundFeedRefreshResult {
  status: BackgroundFeedRefreshStatus;
  articleCount: number;
  newCount: number;
  removedCount: number;
  replaced: boolean;
  lastFeedRefreshAt: string | null;
  newestPublishedAt: string | null;
  durationMs: number;
  fetchDurationMs: number;
  notificationsReused: boolean;
  previousIntact: boolean;
}

export interface BackgroundFeedFetchResult {
  articles: Article[];
  meta?: {
    newestPublishedAt?: string | null;
    rankWindowStart?: string | null;
    lastIngestAt?: string | null;
  };
}

export interface BackgroundFeedRefreshDeps {
  nowMs: () => number;
  isExpired: () => boolean;
  loadUser: () => Promise<{ id: string } | null>;
  loadPreferences: (userId: string) => Promise<UserPreferences>;
  loadRecord: (userId: string, sourceIdsKey: string) => Promise<FeedSnapshotRecord | null>;
  saveRecord: (
    userId: string,
    sourceIdsKey: string,
    articles: Article[],
    extras: {
      lastFeedRefreshAt: string;
      newestPublishedAt?: string | null;
      rankWindowStart?: string | null;
    },
  ) => Promise<FeedSnapshotRecord | null>;
  fetchFeed: (preferences: UserPreferences, knownArticles: Article[]) => Promise<BackgroundFeedFetchResult>;
  fetchSources: () => Promise<FeedSource[]>;
  evaluateNotifications: (
    userId: string,
    articles: Article[],
    preferences: UserPreferences,
    sources: FeedSource[],
  ) => Promise<void>;
  notificationsEligible: (preferences: UserPreferences) => Promise<boolean>;
}

export function createBackgroundFeedRefreshResult(
  status: BackgroundFeedRefreshStatus,
  extras: Partial<BackgroundFeedRefreshResult> = {},
): BackgroundFeedRefreshResult {
  return {
    status,
    articleCount: 0,
    newCount: 0,
    removedCount: 0,
    replaced: false,
    lastFeedRefreshAt: null,
    newestPublishedAt: null,
    durationMs: 0,
    fetchDurationMs: 0,
    notificationsReused: false,
    previousIntact: true,
    ...extras,
  };
}

/**
 * Background maintenance: fetch a full ranked feed and atomically replace the
 * persisted snapshot. The previous snapshot stays on disk until the new page
 * is in hand and ready to write.
 */
export async function runBackgroundFeedRefreshWithDeps(
  deps: BackgroundFeedRefreshDeps,
): Promise<BackgroundFeedRefreshResult> {
  const startedAt = deps.nowMs();
  logBackgroundRefreshStart();

  const finish = (
    status: BackgroundFeedRefreshStatus,
    extras: Partial<BackgroundFeedRefreshResult> = {},
  ): BackgroundFeedRefreshResult => {
    const result = createBackgroundFeedRefreshResult(status, {
      durationMs: deps.nowMs() - startedAt,
      ...extras,
    });
    logBackgroundRefreshEnd(result);
    return result;
  };

  try {
    if (deps.isExpired()) return finish('expired');

    const user = await deps.loadUser();
    if (!user) return finish('skipped');
    if (deps.isExpired()) return finish('expired');

    const preferences = await deps.loadPreferences(user.id);
    const sourceIdsKey = feedSnapshotSourceKey(preferences.enabledSourceIds);
    const previous = await deps.loadRecord(user.id, sourceIdsKey);

    if (shouldSkipBackgroundRefresh(previous?.lastFeedRefreshAt, deps.nowMs())) {
      const reused = await maybeNotify(
        deps,
        user.id,
        previous?.articles ?? [],
        preferences,
        true,
      );
      return finish('skipped', {
        articleCount: previous?.articles.length ?? 0,
        lastFeedRefreshAt: previous?.lastFeedRefreshAt ?? null,
        newestPublishedAt: previous?.newestPublishedAt ?? null,
        notificationsReused: reused,
      });
    }

    if (deps.isExpired()) return finish('expired');

    const knownArticles = [
      ...(previous?.articles ?? []),
      ...Object.values(preferences.likedArticles ?? {}),
      ...Object.values(preferences.clickedArticles ?? {}),
    ];
    const fetchStartedAt = deps.nowMs();
    const feed = await deps.fetchFeed(preferences, knownArticles);
    const fetchDurationMs = deps.nowMs() - fetchStartedAt;

    if (deps.isExpired()) {
      return finish('expired', {
        articleCount: previous?.articles.length ?? 0,
        lastFeedRefreshAt: previous?.lastFeedRefreshAt ?? null,
        newestPublishedAt: previous?.newestPublishedAt ?? null,
        fetchDurationMs,
      });
    }

    if (!canReplaceFeedSnapshot(feed.articles)) {
      return finish('empty', {
        articleCount: previous?.articles.length ?? 0,
        lastFeedRefreshAt: previous?.lastFeedRefreshAt ?? null,
        newestPublishedAt: previous?.newestPublishedAt ?? null,
        fetchDurationMs,
      });
    }

    const refreshedAt = new Date(deps.nowMs()).toISOString();
    const saved = await deps.saveRecord(user.id, sourceIdsKey, feed.articles, {
      lastFeedRefreshAt: refreshedAt,
      newestPublishedAt: feed.meta?.newestPublishedAt,
      rankWindowStart: feed.meta?.rankWindowStart,
    });

    const diff = diffFeedSnapshots(previous?.articles ?? [], saved?.articles ?? feed.articles);
    const reused = await maybeNotify(deps, user.id, feed.articles, preferences, true);

    return finish(diff.replaced ? 'replaced' : 'unchanged', {
      articleCount: saved?.articles.length ?? feed.articles.length,
      newCount: diff.newCount,
      removedCount: diff.removedCount,
      replaced: diff.replaced,
      lastFeedRefreshAt: saved?.lastFeedRefreshAt ?? refreshedAt,
      newestPublishedAt: saved?.newestPublishedAt ?? feed.meta?.newestPublishedAt ?? null,
      fetchDurationMs,
      notificationsReused: reused,
    });
  } catch {
    return finish('failed');
  }
}

async function maybeNotify(
  deps: BackgroundFeedRefreshDeps,
  userId: string,
  articles: Article[],
  preferences: UserPreferences,
  reusedFeed: boolean,
): Promise<boolean> {
  if (articles.length === 0) return false;
  if (deps.isExpired()) return false;
  if (!(await deps.notificationsEligible(preferences))) return false;

  const sources = await deps.fetchSources();
  await deps.evaluateNotifications(userId, articles, preferences, sources);
  return reusedFeed;
}
