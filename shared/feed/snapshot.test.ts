import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '../../types';
import {
  BACKGROUND_FEED_REFRESH_FLOOR_MS,
  buildFeedSnapshotRecord,
  canReplaceFeedSnapshot,
  diffFeedSnapshots,
  feedSnapshotSourceKey,
  parseFeedSnapshotRecord,
  shouldAdoptPersistedSnapshot,
  shouldSkipBackgroundRefresh,
  snapshotAgeMs,
} from './snapshot';

function article(id: string, publishedAt = '2026-10-01T12:00:00.000Z'): Article {
  return {
    id,
    title: id,
    excerpt: '',
    body: 'full body',
    source: 'Test',
    imageUrl: 'https://example.com/i.jpg',
    topics: ['world'],
    readTimeMinutes: 1,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

test('feedSnapshotSourceKey matches the Latest cache key', () => {
  assert.equal(feedSnapshotSourceKey([]), '__all_sources__');
  assert.equal(feedSnapshotSourceKey(undefined), '__all_sources__');
  assert.equal(feedSnapshotSourceKey(['espn', 'bbc']), 'espn,bbc');
});

test('parseFeedSnapshotRecord accepts a Phase 2 bare article array', () => {
  const parsed = parseFeedSnapshotRecord([article('a'), article('b')]);
  assert.ok(parsed);
  assert.deepEqual(parsed.articles.map((item) => item.id), ['a', 'b']);
  assert.equal(parsed.snapshotRevision, 0);
  assert.equal(parsed.lastFeedRefreshAt, null);
  assert.equal(parsed.newestPublishedAt, '2026-10-01T12:00:00.000Z');
});

test('parseFeedSnapshotRecord accepts a versioned record and rejects empties', () => {
  assert.equal(parseFeedSnapshotRecord(null), null);
  assert.equal(parseFeedSnapshotRecord([]), null);
  assert.equal(parseFeedSnapshotRecord({ articles: [] }), null);
  const parsed = parseFeedSnapshotRecord({
    articles: [article('a')],
    lastFeedRefreshAt: '2026-10-01T18:00:00.000Z',
    newestPublishedAt: '2026-10-01T17:00:00.000Z',
    rankWindowStart: '2026-09-30T00:00:00.000Z',
    snapshotRevision: 4,
  });
  assert.ok(parsed);
  assert.equal(parsed.snapshotRevision, 4);
  assert.equal(parsed.lastFeedRefreshAt, '2026-10-01T18:00:00.000Z');
});

test('canReplaceFeedSnapshot never overwrites a valid snapshot with an empty page', () => {
  assert.equal(canReplaceFeedSnapshot([]), false);
  assert.equal(canReplaceFeedSnapshot([article('a')]), true);
  assert.equal(buildFeedSnapshotRecord([], null, { lastFeedRefreshAt: 'now' }), null);
});

test('diffFeedSnapshots reports membership and replacement separately', () => {
  const a = [article('1'), article('2'), article('3')];
  const same = [article('1'), article('2'), article('3')];
  const reordered = [article('3'), article('1'), article('2')];
  const next = [article('2'), article('4')];

  assert.deepEqual(diffFeedSnapshots(a, same), { newCount: 0, removedCount: 0, replaced: false });
  assert.deepEqual(diffFeedSnapshots(a, reordered), { newCount: 0, removedCount: 0, replaced: true });
  assert.deepEqual(diffFeedSnapshots(a, next), { newCount: 1, removedCount: 2, replaced: true });
});

test('buildFeedSnapshotRecord increments revision only when the ranking changes', () => {
  const previous = buildFeedSnapshotRecord(
    [article('a'), article('b')],
    null,
    { lastFeedRefreshAt: '2026-10-01T12:00:00.000Z' },
  )!;
  assert.equal(previous.snapshotRevision, 1);

  const unchanged = buildFeedSnapshotRecord(
    [article('a'), article('b')],
    previous,
    { lastFeedRefreshAt: '2026-10-01T12:10:00.000Z' },
  )!;
  assert.equal(unchanged.snapshotRevision, 1);
  assert.equal(unchanged.lastFeedRefreshAt, '2026-10-01T12:10:00.000Z');

  const replaced = buildFeedSnapshotRecord(
    [article('b'), article('c')],
    previous,
    { lastFeedRefreshAt: '2026-10-01T12:20:00.000Z' },
  )!;
  assert.equal(replaced.snapshotRevision, 2);
  assert.deepEqual(replaced.articles.map((item) => item.id), ['b', 'c']);
});

test('shouldSkipBackgroundRefresh is a floor, not a 15-minute assumption', () => {
  const last = '2026-10-01T12:00:00.000Z';
  const lastMs = Date.parse(last);
  assert.equal(shouldSkipBackgroundRefresh(last, lastMs + 60_000), true);
  assert.equal(
    shouldSkipBackgroundRefresh(last, lastMs + BACKGROUND_FEED_REFRESH_FLOOR_MS + 1),
    false,
  );
  assert.equal(shouldSkipBackgroundRefresh(null, lastMs), false);
});

test('shouldAdoptPersistedSnapshot only when the persisted revision is newer', () => {
  assert.equal(shouldAdoptPersistedSnapshot(null, 1), true);
  assert.equal(shouldAdoptPersistedSnapshot(1, 1), false);
  assert.equal(shouldAdoptPersistedSnapshot(1, 2), true);
  assert.equal(shouldAdoptPersistedSnapshot(3, 2), false);
});

test('snapshotAgeMs reports how stale the persisted feed is on resume', () => {
  const last = '2026-10-01T12:00:00.000Z';
  assert.equal(snapshotAgeMs(last, Date.parse(last) + 90_000), 90_000);
  assert.equal(snapshotAgeMs(null, Date.now()), null);
});
