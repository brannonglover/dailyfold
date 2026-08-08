import assert from 'node:assert/strict';
import test from 'node:test';

import { getSql } from './postgres';
import {
  deletePushSubscription,
  getPushSubscriptionByToken,
  listActivePushSubscriptions,
  listArticlesSince,
  updatePushSubscriptionNotifyState,
  upsertPushSubscription,
  upsertArticle,
} from './db';
import type { Article } from './types';
import type { PushPreferences } from './notify/types';

// These tests hit the real Postgres database in DATABASE_URL (Supabase), using
// unique per-run ids/tokens so they never collide with real data, cleaned up below.
const hasDatabaseUrl = !!process.env.DATABASE_URL?.trim();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function testArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: `notify-article-${runId}`,
    title: 'Test breaking story',
    excerpt: 'Excerpt',
    body: 'Body',
    source: 'Wire',
    imageUrl: 'https://example.com/1.jpg',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: new Date().toISOString(),
    url: `https://example.com/notify-${runId}`,
    ...overrides,
  };
}

function testPrefs(overrides: Partial<PushPreferences> = {}): PushPreferences {
  return {
    topicScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledTopics: [],
    enabledSourceIds: [],
    enabledSportTags: [],
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    trendingNotificationsEnabled: true,
    ...overrides,
  };
}

async function cleanupArticles(ids: string[]) {
  const sql = getSql();
  await sql`DELETE FROM articles WHERE id = ANY(${ids}::text[])`;
}

test('listArticlesSince returns articles published after the cutoff, newest first', { skip: !hasDatabaseUrl }, async () => {
  const oldId = `notify-old-${runId}`;
  const newId = `notify-new-${runId}`;

  try {
    const oldPublishedAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const newPublishedAt = new Date().toISOString();
    // upsertArticle takes published_at via the feedPublishedAt option, not Article.publishedAt.
    await upsertArticle(testArticle({ id: oldId, url: `https://example.com/${oldId}`, publishedAt: oldPublishedAt }), { feedPublishedAt: oldPublishedAt });
    await upsertArticle(testArticle({ id: newId, url: `https://example.com/${newId}`, publishedAt: newPublishedAt }), { feedPublishedAt: newPublishedAt });

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const results = await listArticlesSince(since, 500);
    const ids = results.map((a) => a.id);

    assert.ok(ids.includes(newId));
    assert.ok(!ids.includes(oldId));
  } finally {
    await cleanupArticles([oldId, newId]);
  }
});

test('upsertPushSubscription round-trips and does not reset notify state', { skip: !hasDatabaseUrl }, async () => {
  const token = `ExponentPushToken[test-${runId}]`;

  try {
    await upsertPushSubscription({ expoPushToken: token, userId: 'user-1', prefs: testPrefs() });
    let sub = await getPushSubscriptionByToken(token);
    assert.ok(sub);
    assert.equal(sub?.userId, 'user-1');
    assert.equal(sub?.notifiedArticleIds.length, 0);

    await updatePushSubscriptionNotifyState(token, ['article-1'], Date.now());

    // Re-syncing preferences must not clear the cooldown/dedup state just set.
    await upsertPushSubscription({
      expoPushToken: token,
      userId: 'user-1',
      prefs: testPrefs({ trendingNotificationsEnabled: false }),
    });
    sub = await getPushSubscriptionByToken(token);
    assert.deepEqual(sub?.notifiedArticleIds, ['article-1']);
    assert.ok(sub?.lastNotifiedAt);

    const active = await listActivePushSubscriptions();
    assert.ok(!active.some((s) => s.expoPushToken === token));
  } finally {
    await deletePushSubscription(token);
  }
});
