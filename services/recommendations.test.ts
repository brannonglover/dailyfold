import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { Article, UserPreferences } from '@/types';

import { articleAffinityScore, rankArticles } from './recommendations';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: ['liked-1'],
    likedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    sourceScores: { 'Mens Health': 5 },
    keywordScores: { series: 3, season: 2 },
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

function article(
  id: string,
  title: string,
  options?: { source?: string; topics?: UserPreferences['topicScores'] extends Record<infer K, number> ? K[] : never },
): Article {
  return {
    id,
    title,
    excerpt: title,
    body: title,
    source: options?.source ?? 'Wire',
    imageUrl: 'https://example.com/1.jpg',
    topics: options?.topics ?? ['culture'],
    readTimeMinutes: 3,
    publishedAt: new Date().toISOString(),
    url: `https://example.com/${id}`,
  };
}

test('articleAffinityScore ignores legacy source scores', () => {
  const prefs = basePrefs();
  const sameSource = article('a', 'Random headline', { source: 'Mens Health' });
  const matchingKeywords = article('b', 'Best new series season preview');

  assert.equal(articleAffinityScore(sameSource, prefs), 0);
  assert.ok(articleAffinityScore(matchingKeywords, prefs) > 0);
});

test('rankArticles prefers keyword matches over shared source', () => {
  const prefs = basePrefs({
    topicScores: { ...basePrefs().topicScores, culture: 1 },
  });

  const ranked = rankArticles(
    [
      article('source-match', 'Unrelated politics roundup', { source: 'Mens Health', topics: ['politics'] }),
      article('keyword-match', 'Must-watch series season finale', { source: 'Other Outlet', topics: ['culture'] }),
    ],
    prefs,
    new Set(['liked-1']),
  );

  assert.equal(ranked[0]?.id, 'keyword-match');
});
