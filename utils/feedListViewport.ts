/** Last measured feed list viewport height — avoids a blank frame on tab remount. */
let lastFeedListHeight = 0;

export function readLastFeedListHeight(): number {
  return lastFeedListHeight;
}

export function rememberFeedListHeight(height: number): void {
  if (height > 0) {
    lastFeedListHeight = height;
  }
}
