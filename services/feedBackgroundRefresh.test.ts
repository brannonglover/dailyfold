import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runBackgroundFeedRefreshWithDeps,
  type BackgroundFeedRefreshDeps,
} from '@/services/feedBackgroundRefresh';
import { type FeedSnapshotRecord } from '@/shared/feed/snapshot';
import { Article, FeedSource, UserPreferences } from '@/types';

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

function record(articles: Article[], extras: Partial<FeedSnapshotRecord> = {}): FeedSnapshotRecord {
  return {
    articles,
    lastFeedRefreshAt: '2026-10-01T10:00:00.000Z',
    newestPublishedAt: articles[0]?.publishedAt ?? null,
    rankWindowStart: '2026-09-30T00:00:00.000Z',
    snapshotRevision: 1,
    ...extras,
  };
}

function createDeps(options: {
  previous: FeedSnapshotRecord | null;
  incoming: Article[];
  nowMs?: number;
  expireAfterFetch?: boolean;
  fetchError?: Error;
}): {
  deps: BackgroundFeedRefreshDeps;
  store: { current: FeedSnapshotRecord | null };
  counters: { fetch: number; save: number; notify: number };
} {
  const store = { current: options.previous };
  const counters = { fetch: 0, save: 0, notify: 0 };
  let expired = false;

  const deps: BackgroundFeedRefreshDeps = {
    nowMs: () => options.nowMs ?? Date.parse('2026-10-01T12:00:00.000Z'),
    isExpired: () => expired,
    loadUser: async () => ({ id: 'user-1' }),
    loadPreferences: async () => prefs(),
    loadRecord: async () => store.current,
    saveRecord: async (_userId, _key, articles, extras) => {
      counters.save += 1;
      store.current = {
        articles,
        lastFeedRefreshAt: extras.lastFeedRefreshAt,
        newestPublishedAt: extras.newestPublishedAt ?? null,
        rankWindowStart: extras.rankWindowStart ?? null,
        snapshotRevision: (store.current?.snapshotRevision ?? 0) + 1,
      };
      return store.current;
    },
    fetchFeed: async () => {
      counters.fetch += 1;
      if (options.expireAfterFetch) expired = true;
      if (options.fetchError) throw options.fetchError;
      return {
        articles: options.incoming,
        scores: {},
        meta: {
          lastIngestAt: null,
          newestPublishedAt: '2026-10-01T13:00:00.000Z',
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

  return { deps, store, counters };
}

test('foreground A → background refresh produces snapshot B', async () => {
  const { deps, store, counters } = createDeps({
    previous: record([article('1'), article('2')]),
    incoming: [article('2'), article('3'), article('4')],
  });
  const result = await runBackgroundFeedRefreshWithDeps(deps);

  assert.equal(result.status, 'replaced');
  assert.equal(result.replaced, true);
  assert.equal(result.newCount, 2);
  assert.equal(result.previousIntact, true);
  assert.deepEqual(store.current?.articles.map((item) => item.id), ['2', '3', '4']);
  assert.equal(result.notificationsReused, true);
  assert.equal(counters.notify, 1);
  assert.equal(counters.fetch, 1);
});

test('a background run with no new articles still refreshes metadata', async () => {
  const { deps, store, counters } = createDeps({
    previous: record([article('1'), article('2')]),
    incoming: [article('1'), article('2')],
  });
  const result = await runBackgroundFeedRefreshWithDeps(deps);

  assert.equal(result.status, 'unchanged');
  assert.equal(result.replaced, false);
  assert.equal(result.newCount, 0);
  assert.ok(result.lastFeedRefreshAt);
  assert.equal(counters.save, 1);
  assert.deepEqual(store.current?.articles.map((item) => item.id), ['1', '2']);
});

test('expiration after fetch leaves snapshot A intact', async () => {
  const { deps, store, counters } = createDeps({
    previous: record([article('1'), article('2')]),
    incoming: [article('9')],
    expireAfterFetch: true,
  });
  const result = await runBackgroundFeedRefreshWithDeps(deps);

  assert.equal(result.status, 'expired');
  assert.equal(counters.save, 0);
  assert.equal(result.previousIntact, true);
  assert.deepEqual(store.current?.articles.map((item) => item.id), ['1', '2']);
});

test('a failed fetch leaves snapshot A intact', async () => {
  const store = { current: record([article('1'), article('2')]) };
  const { deps } = createDeps({
    previous: store.current,
    incoming: [article('9')],
    fetchError: new Error('network down'),
  });
  deps.loadRecord = async () => store.current;
  deps.saveRecord = async () => {
    throw new Error('should not save');
  };
  const result = await runBackgroundFeedRefreshWithDeps(deps);

  assert.equal(result.status, 'failed');
  assert.equal(result.previousIntact, true);
  assert.deepEqual(store.current.articles.map((item) => item.id), ['1', '2']);
});

test('an empty feed response does not destroy the previous snapshot', async () => {
  const { deps, store, counters } = createDeps({
    previous: record([article('1')]),
    incoming: [],
  });
  const result = await runBackgroundFeedRefreshWithDeps(deps);

  assert.equal(result.status, 'empty');
  assert.equal(counters.save, 0);
  assert.deepEqual(store.current?.articles.map((item) => item.id), ['1']);
});

test('a recent successful refresh skips the network and reuses the snapshot for notifications', async () => {
  const { deps, store, counters } = createDeps({
    previous: record([article('1')], { lastFeedRefreshAt: '2026-10-01T11:58:00.000Z' }),
    incoming: [article('9')],
    nowMs: Date.parse('2026-10-01T12:00:00.000Z'),
  });
  const result = await runBackgroundFeedRefreshWithDeps(deps);

  assert.equal(result.status, 'skipped');
  assert.equal(counters.fetch, 0);
  assert.equal(counters.save, 0);
  assert.equal(result.notificationsReused, true);
  assert.deepEqual(store.current?.articles.map((item) => item.id), ['1']);
});
