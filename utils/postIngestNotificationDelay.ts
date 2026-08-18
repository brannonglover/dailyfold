/** Wait after RSS import before trending alerts, so they don't land with the new stories. */
export const POST_INGEST_NOTIFICATION_DELAY_MS = 5 * 60 * 1000;

/**
 * Server-only race guard: skip a notify run if ingest finished this recently.
 * Shorter than the 5-minute notify-cron offset so a typical ingest still notifies
 * on the following slot instead of waiting another 15 minutes.
 */
export const POST_INGEST_NOTIFY_SETTLE_MS = 2 * 60 * 1000;

export function remainingPostIngestNotificationDelayMs(
  lastIngestAtMs: number | null | undefined,
  nowMs: number,
  delayMs: number = POST_INGEST_NOTIFICATION_DELAY_MS,
): number {
  if (lastIngestAtMs == null || !Number.isFinite(lastIngestAtMs)) return 0;
  const remaining = delayMs - (nowMs - lastIngestAtMs);
  return remaining > 0 ? remaining : 0;
}

export function shouldDeferNotificationsAfterIngest(
  lastIngestAtMs: number | null | undefined,
  nowMs: number,
  delayMs: number = POST_INGEST_NOTIFY_SETTLE_MS,
): boolean {
  return remainingPostIngestNotificationDelayMs(lastIngestAtMs, nowMs, delayMs) > 0;
}
