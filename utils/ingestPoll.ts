/**
 * Backoff while a background RSS ingest is still running.
 * Full catalog ingest often exceeds a single short delay, so we keep
 * re-fetching until the API reports the cycle finished (or we give up).
 */
export const INGEST_COMPLETION_POLL_DELAYS_MS = [
  3_000, 5_000, 8_000, 12_000, 15_000, 20_000,
] as const;

/**
 * How often the open app re-fetches the article API while foregrounded.
 * Keep this to a cheap cache read (not a full RSS re-ingest) so pull-to-refresh
 * usually has newcomers already queued — Flipboard-style instant merge.
 */
export const FOREGROUND_FEED_POLL_INTERVAL_MS = 60_000;

/** After this long away, resume force-refreshes instead of only queuing pending. */
export const RESUME_REFRESH_AFTER_MS = 60_000;

export function nextIngestPollDelayMs(attempt: number): number {
  if (attempt < 0) return INGEST_COMPLETION_POLL_DELAYS_MS[0];
  const last = INGEST_COMPLETION_POLL_DELAYS_MS.length - 1;
  return INGEST_COMPLETION_POLL_DELAYS_MS[Math.min(attempt, last)]!;
}

export function isIngestPendingMeta(meta?: {
  ingestTriggered?: boolean;
  ingestAwaited?: boolean;
} | null): boolean {
  return !!meta?.ingestTriggered && !meta?.ingestAwaited;
}
