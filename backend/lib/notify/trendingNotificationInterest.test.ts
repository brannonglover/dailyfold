import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from './curiosities';
import { articleInterestKeywords } from './interestSignals';
import { getInterestKeywordWeight } from './interestKeywords';
import { articleSportTags } from './sportPreferences';
import { isTrendingNotificationRelevant } from './trendingNotificationInterest';
import type { PushPreferences } from './types';
import { Article, Topic } from '../types';

/**
 * Port of utils/trendingNotificationInterest.test.ts. The client version relies on
 * buildInterestProfile() resolving a liked-article snapshot to *derive* score maps at
 * call time; the server has no snapshot, only the already-derived scores (see the
 * "required logic edit" note in trendingNotificationInterest.ts). So instead of a
 * `prefsWithLike` helper that leaves scores at 0 and attaches a snapshot, this port's
 * `prefsWithLikedScores` pre-computes the same contribution profileFromLikedArticles()
 * would (topicScores +1 per topic, keywordScores +weight per extracted keyword,
 * sportTagScores +1 per tag) — i.e. the steady state after the client's reconcile —
 * so the same fixtures produce the same pass/fail outcomes.
 */

function basePrefs(overrides: Partial<PushPreferences> = {}): PushPreferences {
  return {
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as PushPreferences['topicScores'],
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: true,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    ...overrides,
  };
}

function article(topics: Topic[], title = 'Story'): Article {
  return {
    id: 'a1',
    title,
    excerpt: title,
    body: 'body',
    source: 'Wire',
    imageUrl: 'https://example.com/1.jpg',
    topics,
    readTimeMinutes: 3,
    publishedAt: new Date().toISOString(),
    url: 'https://example.com/a1',
  };
}

function prefsWithLikedScores(liked: Article, overrides: Partial<PushPreferences> = {}): PushPreferences {
  const topicScores = { ...basePrefs().topicScores };
  for (const topic of liked.topics) {
    topicScores[topic] = (topicScores[topic] ?? 0) + 1;
  }

  const keywordScores: Record<string, number> = {};
  for (const keyword of articleInterestKeywords(liked)) {
    keywordScores[keyword] = (keywordScores[keyword] ?? 0) + getInterestKeywordWeight(keyword);
  }

  const sportTagScores: Record<string, number> = {};
  for (const tag of articleSportTags(liked)) {
    sportTagScores[tag] = (sportTagScores[tag] ?? 0) + 1;
  }

  return basePrefs({ topicScores, keywordScores, sportTagScores, ...overrides });
}

test('isTrendingNotificationRelevant requires affinity when user has liked articles', () => {
  const liked = article(['technology'], 'New AI model release');
  const prefs = prefsWithLikedScores(liked);

  assert.equal(isTrendingNotificationRelevant(article(['technology'], 'New AI model release'), prefs), true);
  assert.equal(isTrendingNotificationRelevant(article(['politics'], 'Election update'), prefs), false);
});

test('isTrendingNotificationRelevant requires breaking for all-topics feed with liked articles', () => {
  const liked = article(['technology'], 'New AI model release');
  const prefs = prefsWithLikedScores(liked);
  const pressingOnly = {
    ...article(['technology'], 'New AI model release'),
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  };

  assert.equal(isTrendingNotificationRelevant(pressingOnly, prefs, Date.now(), 3), false);
  assert.equal(isTrendingNotificationRelevant(article(['technology'], 'New AI model release'), prefs, Date.now(), 3), true);
});

test('isTrendingNotificationRelevant allows pressing story with liked articles and narrowed topics', () => {
  const liked = article(['science'], 'Mars rover discovery');
  const prefs = prefsWithLikedScores(liked, { enabledTopics: ['science'] });
  const pressing = {
    ...article(['science'], 'Mars rover discovery'),
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  };

  assert.equal(isTrendingNotificationRelevant(pressing, prefs, Date.now(), 2), true);
  assert.equal(isTrendingNotificationRelevant(pressing, prefs, Date.now(), 1), false);
});

test('isTrendingNotificationRelevant allows breaking story in narrowed topics without likes', () => {
  const prefs = basePrefs({ enabledTopics: ['science'] });
  assert.equal(isTrendingNotificationRelevant(article(['science']), prefs), true);
});

test('isTrendingNotificationRelevant rejects outlet burst without likes even when topics narrowed', () => {
  const prefs = basePrefs({ enabledTopics: ['science'] });
  const old = {
    ...article(['science']),
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  };
  assert.equal(isTrendingNotificationRelevant(old, prefs), false);
});

test('isTrendingNotificationRelevant rejects source-only narrowing without likes', () => {
  const prefs = basePrefs({ enabledSourceIds: ['source-a'] });
  assert.equal(isTrendingNotificationRelevant(article(['world']), prefs), false);
});

test('isTrendingNotificationRelevant rejects all-topics feed with no personalization', () => {
  const prefs = basePrefs();
  assert.equal(isTrendingNotificationRelevant(article(['world']), prefs), false);
});
