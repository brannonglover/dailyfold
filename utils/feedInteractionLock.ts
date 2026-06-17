/** Blocks feed pagination and display merges while a source sheet is open. */
let lockCount = 0;
const listeners = new Set<() => void>();

function notifyFeedInteractionLockChanged() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeFeedInteractionLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function acquireFeedInteractionLock(): () => void {
  lockCount += 1;
  return () => {
    const wasLocked = lockCount > 0;
    lockCount = Math.max(0, lockCount - 1);
    if (wasLocked && lockCount === 0) {
      notifyFeedInteractionLockChanged();
    }
  };
}

export function isFeedInteractionLocked(): boolean {
  return lockCount > 0;
}
