import {
  shouldAdoptPersistedSnapshot,
  snapshotAgeMs,
  type FeedSnapshotRecord,
} from '@/shared/feed/snapshot';
import { Article } from '@/types';
import { isRenderableFeedSnapshot } from '@/utils/feedSnapshotHydration';
import { mergeArticleFeed } from '@/utils/mergeArticleFeed';

export interface ResumeSnapshotDecision {
  /** Replace the in-memory session with the persisted snapshot (clear pending). */
  adopt: boolean;
  /** After the snapshot is on screen, catch up with a silent request — never construct. */
  silentAfter: boolean;
  snapshotAgeMs: number | null;
}

/**
 * Between sessions the persisted snapshot is the feed the user should see.
 * pending only protects an already-started reading session.
 */
/** Cold launch: empty store constructs once; a snapshot paints first and catches up silently. */
export function resolveColdLaunchFeedMode(
  hasRenderableSnapshot: boolean,
): 'initial' | 'silent' {
  return hasRenderableSnapshot ? 'silent' : 'initial';
}

/**
 * After a cold launch (or a long absence) the reader has not started reading yet, so
 * the first catch-up response may merge its newcomers straight into the feed instead of
 * parking them behind the "More stories available" banner. Bounded so a slow response
 * that lands after the reader is mid-scroll falls back to the banner.
 */
export const LAUNCH_CATCH_UP_WINDOW_MS = 15_000;

export function launchCatchUpDeadline(nowMs: number): number {
  return nowMs + LAUNCH_CATCH_UP_WINDOW_MS;
}

export function shouldPromoteSilentNewcomers(options: {
  /** Pull/resume kicked off ingest and asked for newcomers. */
  explicitPromote: boolean;
  nowMs: number;
  catchUpUntilMs: number;
}): boolean {
  return options.explicitPromote || options.nowMs <= options.catchUpUntilMs;
}

/**
 * What a silent fetch should persist as the next session's starting feed: the visible
 * feed plus any newcomers still queued behind the banner. Without this the queue lives
 * only in memory, so every relaunch repainted the stale snapshot and re-discovered the
 * same stories over the network.
 */
export function snapshotArticlesForSilentFetch(
  visible: Article[],
  pending: Article[],
): Article[] {
  return pending.length > 0 ? mergeArticleFeed(visible, pending) : visible;
}

export function decideResumeFeedSnapshot(
  hydratedRevision: number | null | undefined,
  persisted: FeedSnapshotRecord | null,
  nowMs: number,
): ResumeSnapshotDecision {
  const renderable = isRenderableFeedSnapshot(persisted?.articles);
  const adopt =
    !!persisted &&
    renderable &&
    shouldAdoptPersistedSnapshot(hydratedRevision, persisted.snapshotRevision);

  return {
    adopt,
    silentAfter: renderable,
    snapshotAgeMs: snapshotAgeMs(persisted?.lastFeedRefreshAt, nowMs),
  };
}
