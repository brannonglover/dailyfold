import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runBackgroundFeedRefreshWithDeps,
  type BackgroundFeedRefreshDeps,
} from '@/services/feedBackgroundRefresh';
import {
  buildFeedSnapshotRecord,
  diffFeedSnapshots,
  type FeedSnapshotRecord,
} from '@/shared/feed/snapshot';
import { Article, FeedSource, UserPreferences } from '@/types';
import { decideResumeFeedSnapshot } from '@/utils/feedSnapshotSession';

function article(id: string): Article {
  return {
    id,
    title: `Story ${id}`,
    excerpt: '',
    body: '',
    source: 'Test',
    imageUrl: 'https://example.com/i.jpg',
    topics: ['world'],
    readTimeMinutes: 1,
    publishedAt: `2026-10-01T1${id}:00:00.000Z`,
    url: `https://example.com/${id}`,
  };
}

const SNAPSHOT_A = [article('1'), article('2'), article('3')];
const SNAPSHOT_B = [article('2'), article('3'), article('4'), article('5')];

function prefs(): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: {} as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    forYouTopics: [],
    forYouKeywords: [],
    forYouSportTags: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: true,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
  } as UserPreferences;
}

function persist(
  articles: Article[],
  previous: FeedSnapshotRecord | null,
  at: string,
): FeedSnapshotRecord {
  const record = buildFeedSnapshotRecord(articles, previous, {
    lastFeedRefreshAt: at,
    newestPublishedAt: articles[articles.length - 1]?.publishedAt,
    rankWindowStart: '2026-09-30T00:00:00.000Z',
  });
  if (!record) throw new Error('expected a persistable snapshot');
  return record;
}

function createStore(initial: FeedSnapshotRecord) {
  const store = { current: initial as FeedSnapshotRecord | null };
  const counters = { fetch: 0, save: 0, notify: 0 };
  let incoming = SNAPSHOT_B;
  let fetchError: Error | null = null;
  let expireAfterFetch = false;
  let expired = false;

  const deps: BackgroundFeedRefreshDeps = {
    nowMs: () => Date.parse('2026-10-01T18:00:00.000Z'),
    isExpired: () => expired,
    loadUser: async () => ({ id: 'user-1' }),
    loadPreferences: async () => prefs(),
    loadRecord: async () => store.current,
    saveRecord: async (_userId, _key, articles, extras) => {
      counters.save += 1;
      const next = persist(articles, store.current, extras.lastFeedRefreshAt);
      store.current = {
        ...next,
        newestPublishedAt: extras.newestPublishedAt ?? next.newestPublishedAt,
        rankWindowStart: extras.rankWindowStart ?? next.rankWindowStart,
      };
      return store.current;
    },
    fetchFeed: async () => {
      counters.fetch += 1;
      if (expireAfterFetch) expired = true;
      if (fetchError) throw fetchError;
      return {
        articles: incoming,
        meta: {
          newestPublishedAt: incoming[incoming.length - 1]?.publishedAt ?? null,
          rankWindowStart: '2026-09-30T12:00:00.000Z',
        },
      };
    },
    fetchSources: async () => [] as FeedSource[],
    evaluateNotifications: async () => {
      counters.notify += 1;
    },
    notificationsEligible: async () => true,
  };

  return {
    store,
    counters,
    deps,
    setIncoming(articles: Article[]) {
      incoming = articles;
    },
    failFetch(error: Error) {
      fetchError = error;
    },
    expireAfterFetch() {
      expireAfterFetch = true;
    },
  };
}

function reopen(
  hydratedRevision: number,
  persisted: FeedSnapshotRecord | null,
  nowMs = Date.parse('2026-10-01T18:05:00.000Z'),
) {
  const decision = decideResumeFeedSnapshot(hydratedRevision, persisted, nowMs);
  const visible = decision.adopt && persisted ? persisted.articles : SNAPSHOT_A;
  return { decision, visible };
}

test('foreground A → background B → reopen renders B immediately', async () => {
  const snapshotA = persist(SNAPSHOT_A, null, '2026-10-01T12:00:00.000Z');
  const harness = createStore(snapshotA);
  harness.setIncoming(SNAPSHOT_B);

  const result = await runBackgroundFeedRefreshWithDeps(harness.deps);
  assert.equal(result.status, 'replaced');
  assert.equal(result.replaced, true);
  assert.equal(result.newCount, 2);
  assert.equal(result.notificationsReused, true);
  assert.equal(harness.counters.notify, 1);
  assert.deepEqual(harness.store.current?.articles.map((item) => item.id), ['2', '3', '4', '5']);

  const { decision, visible } = reopen(snapshotA.snapshotRevision, harness.store.current);
  assert.equal(decision.adopt, true);
  assert.equal(decision.silentAfter, true);
  assert.ok((decision.snapshotAgeMs ?? 0) >= 0);
  assert.deepEqual(visible.map((item) => item.id), ['2', '3', '4', '5']);
  assert.equal(
    diffFeedSnapshots(SNAPSHOT_A, visible).newCount,
    2,
    'B articles are the next session starting feed, not pending',
  );
});

test('foreground A → background B → offline reopen still renders B', async () => {
  const snapshotA = persist(SNAPSHOT_A, null, '2026-10-01T12:00:00.000Z');
  const harness = createStore(snapshotA);
  harness.setIncoming(SNAPSHOT_B);
  await runBackgroundFeedRefreshWithDeps(harness.deps);

  const persistedB = harness.store.current;
  harness.failFetch(new Error('network disabled'));
  const fetchesAfterRefresh = harness.counters.fetch;

  const { decision, visible } = reopen(snapshotA.snapshotRevision, persistedB);
  assert.equal(decision.adopt, true);
  assert.equal(decision.silentAfter, true);
  assert.equal(harness.counters.fetch, fetchesAfterRefresh);
  assert.deepEqual(harness.store.current?.articles.map((item) => item.id), ['2', '3', '4', '5']);
  assert.deepEqual(visible.map((item) => item.id), ['2', '3', '4', '5']);
});

test('background refresh failure or expiration leaves snapshot A intact', async () => {
  const snapshotA = persist(SNAPSHOT_A, null, '2026-10-01T12:00:00.000Z');

  const failing = createStore(snapshotA);
  failing.failFetch(new Error('timeout'));
  const failed = await runBackgroundFeedRefreshWithDeps(failing.deps);
  assert.equal(failed.status, 'failed');
  assert.equal(failing.counters.save, 0);
  assert.deepEqual(failing.store.current?.articles.map((item) => item.id), ['1', '2', '3']);

  const expired = createStore(snapshotA);
  expired.setIncoming(SNAPSHOT_B);
  expired.expireAfterFetch();
  const expiredResult = await runBackgroundFeedRefreshWithDeps(expired.deps);
  assert.equal(expiredResult.status, 'expired');
  assert.equal(expired.counters.save, 0);
  assert.deepEqual(expired.store.current?.articles.map((item) => item.id), ['1', '2', '3']);

  const { decision, visible } = reopen(snapshotA.snapshotRevision, failing.store.current);
  assert.equal(decision.adopt, false);
  assert.deepEqual(visible.map((item) => item.id), ['1', '2', '3']);
});

test('a background run with no new articles updates metadata without replacing the ranking', async () => {
  const snapshotA = persist(SNAPSHOT_A, null, '2026-10-01T12:00:00.000Z');
  const harness = createStore(snapshotA);
  harness.setIncoming(SNAPSHOT_A);

  const result = await runBackgroundFeedRefreshWithDeps(harness.deps);
  assert.equal(result.status, 'unchanged');
  assert.equal(result.replaced, false);
  assert.equal(result.newCount, 0);
  assert.equal(harness.counters.save, 1);
  assert.equal(harness.store.current?.snapshotRevision, snapshotA.snapshotRevision);
  assert.notEqual(harness.store.current?.lastFeedRefreshAt, snapshotA.lastFeedRefreshAt);
  assert.deepEqual(harness.store.current?.articles.map((item) => item.id), ['1', '2', '3']);

  const { decision } = reopen(snapshotA.snapshotRevision, harness.store.current);
  assert.equal(decision.adopt, false);
  assert.equal(decision.silentAfter, true);
});
