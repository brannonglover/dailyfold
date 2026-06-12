import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { Article, UserPreferences } from '@/types';

import { applyArticleLikeSignals } from './interestSignals';

function basePrefs(): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
  };
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'New series season preview',
    excerpt: 'A culture story about television',
    body: 'body',
    source: 'Mens Health',
    imageUrl: 'https://example.com/1.jpg',
    topics: ['culture'],
    readTimeMinutes: 3,
    publishedAt: new Date().toISOString(),
    url: 'https://example.com/a1',
    ...overrides,
  };
}

test('applyArticleLikeSignals boosts topics and keywords, not source', () => {
  const prefs = basePrefs();
  const signals = applyArticleLikeSignals(prefs, article(), false);

  assert.equal(signals.topicScores.culture, 1);
  assert.ok(Object.keys(signals.keywordScores).length > 0);
  assert.equal(Object.keys(signals.sportTagScores).length, 0);
  assert.equal('sourceScores' in signals, false);
});

test('applyArticleLikeSignals records sport tags for sports articles', () => {
  const prefs = basePrefs();
  const signals = applyArticleLikeSignals(
    prefs,
    article({
      title: 'NFL playoff preview',
      excerpt: 'Football championship race heats up',
      topics: ['sports'],
      sportTags: ['football'],
    }),
    false,
  );

  assert.equal(signals.topicScores.sports, 1);
  assert.ok(signals.sportTagScores.football > 0);
});
