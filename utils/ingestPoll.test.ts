import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  FOREGROUND_FEED_POLL_INTERVAL_MS,
  INGEST_COMPLETION_POLL_DELAYS_MS,
  isIngestPendingMeta,
  nextIngestPollDelayMs,
  RESUME_REFRESH_AFTER_MS,
} from './ingestPoll';

test('nextIngestPollDelayMs walks the backoff then clamps', () => {
  assert.equal(nextIngestPollDelayMs(0), INGEST_COMPLETION_POLL_DELAYS_MS[0]);
  assert.equal(nextIngestPollDelayMs(2), INGEST_COMPLETION_POLL_DELAYS_MS[2]);
  assert.equal(
    nextIngestPollDelayMs(INGEST_COMPLETION_POLL_DELAYS_MS.length + 5),
    INGEST_COMPLETION_POLL_DELAYS_MS[INGEST_COMPLETION_POLL_DELAYS_MS.length - 1],
  );
});

test('isIngestPendingMeta is true only for fire-and-forget ingest', () => {
  assert.equal(isIngestPendingMeta(undefined), false);
  assert.equal(isIngestPendingMeta({ ingestTriggered: false, ingestAwaited: false }), false);
  assert.equal(isIngestPendingMeta({ ingestTriggered: true, ingestAwaited: true }), false);
  assert.equal(isIngestPendingMeta({ ingestTriggered: true, ingestAwaited: false }), true);
});

test('foreground poll is frequent enough to prewarm pull-to-refresh', () => {
  assert.ok(FOREGROUND_FEED_POLL_INTERVAL_MS <= 60_000);
  assert.equal(RESUME_REFRESH_AFTER_MS, 60_000);
});
