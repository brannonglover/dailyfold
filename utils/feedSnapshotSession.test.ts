import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveColdLaunchFeedMode } from './feedSnapshotSession';

test('cold launch without a snapshot constructs exactly once via initial /api/feed', () => {
  assert.equal(resolveColdLaunchFeedMode(false), 'initial');
});

test('cold launch with a snapshot paints first and catches up with one silent /api/feed', () => {
  assert.equal(resolveColdLaunchFeedMode(true), 'silent');
});

import {
  LAUNCH_CATCH_UP_WINDOW_MS,
  launchCatchUpDeadline,
  shouldPromoteSilentNewcomers,
  snapshotArticlesForSilentFetch,
} from './feedSnapshotSession';
import type { Article } from '@/types';

function story(id: string, publishedAt: string): Article {
  return {
    id,
    title: `Title ${id}`,
    excerpt: '',
    body: '',
    source: `Source ${id}`,
    imageUrl: 'https://example.com/1.jpg',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

test('launch catch-up promotes newcomers only inside its window', () => {
  const now = 1_000_000;
  const until = launchCatchUpDeadline(now);
  assert.equal(until - now, LAUNCH_CATCH_UP_WINDOW_MS);
  assert.equal(
    shouldPromoteSilentNewcomers({ explicitPromote: false, nowMs: now + 1_000, catchUpUntilMs: until }),
    true,
  );
  assert.equal(
    shouldPromoteSilentNewcomers({ explicitPromote: false, nowMs: until + 1, catchUpUntilMs: until }),
    false,
  );
  assert.equal(
    shouldPromoteSilentNewcomers({ explicitPromote: false, nowMs: now, catchUpUntilMs: 0 }),
    false,
  );
  assert.equal(
    shouldPromoteSilentNewcomers({ explicitPromote: true, nowMs: until + 1, catchUpUntilMs: 0 }),
    true,
  );
});

test('silent fetch persists queued newcomers so the next launch starts fresh', () => {
  const visible = [story('old', '2026-11-05T08:00:00.000Z')];
  const pending = [story('new', '2026-11-05T12:00:00.000Z')];

  const snapshot = snapshotArticlesForSilentFetch(visible, pending);
  assert.deepEqual(snapshot.map((a) => a.id).sort(), ['new', 'old']);
  assert.equal(snapshotArticlesForSilentFetch(visible, []), visible);
});
