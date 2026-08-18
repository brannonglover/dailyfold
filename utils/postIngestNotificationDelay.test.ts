import assert from 'node:assert/strict';
import test from 'node:test';

import {
  POST_INGEST_NOTIFICATION_DELAY_MS,
  POST_INGEST_NOTIFY_SETTLE_MS,
  remainingPostIngestNotificationDelayMs,
  shouldDeferNotificationsAfterIngest,
} from './postIngestNotificationDelay';

test('remainingPostIngestNotificationDelayMs is 0 when ingest time is unknown', () => {
  assert.equal(remainingPostIngestNotificationDelayMs(null, Date.now()), 0);
  assert.equal(remainingPostIngestNotificationDelayMs(undefined, Date.now()), 0);
  assert.equal(remainingPostIngestNotificationDelayMs(Number.NaN, Date.now()), 0);
});

test('remainingPostIngestNotificationDelayMs waits out the delay after ingest', () => {
  const ingestedAt = Date.parse('2026-08-18T16:00:00.000Z');
  const during = ingestedAt + 90_000;
  const after = ingestedAt + POST_INGEST_NOTIFICATION_DELAY_MS;

  assert.equal(
    remainingPostIngestNotificationDelayMs(ingestedAt, during),
    POST_INGEST_NOTIFICATION_DELAY_MS - 90_000,
  );
  assert.equal(remainingPostIngestNotificationDelayMs(ingestedAt, after), 0);
});

test('shouldDeferNotificationsAfterIngest uses the shorter server settle window', () => {
  const ingestedAt = Date.parse('2026-08-18T16:00:00.000Z');

  assert.equal(
    shouldDeferNotificationsAfterIngest(ingestedAt, ingestedAt + 60_000),
    true,
  );
  assert.equal(
    shouldDeferNotificationsAfterIngest(
      ingestedAt,
      ingestedAt + POST_INGEST_NOTIFY_SETTLE_MS,
    ),
    false,
  );
});
