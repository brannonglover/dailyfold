import {
  shouldAdoptPersistedSnapshot,
  snapshotAgeMs,
  type FeedSnapshotRecord,
} from '@/shared/feed/snapshot';
import { isRenderableFeedSnapshot } from '@/utils/feedSnapshotHydration';

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
