import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { Article, UserPreferences } from '@/types';
import { isTrendingNotificationRelevant } from '@/utils/trendingNotificationInterest';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: true,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

function article(
  topics: UserPreferences['topicScores'] extends Record<infer K, number> ? K[] : never,
  title = 'Story',
): Article {
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

function prefsWithLike(liked: Article, overrides: Partial<UserPreferences> = {}): UserPreferences {
  return basePrefs({
    likedArticleIds: [liked.id],
    likedArticles: { [liked.id]: liked },
    ...overrides,
  });
}

test('isTrendingNotificationRelevant requires affinity when user has liked articles', () => {
  const liked = article(['technology'], 'New AI model release');
  const prefs = prefsWithLike(liked);

  assert.equal(isTrendingNotificationRelevant(article(['technology'], 'New AI model release'), prefs), true);
  assert.equal(isTrendingNotificationRelevant(article(['politics'], 'Election update'), prefs), false);
});

test('isTrendingNotificationRelevant requires breaking for all-topics feed with liked articles', () => {
  const liked = article(['technology'], 'New AI model release');
  const prefs = prefsWithLike(liked);
  const pressingOnly = {
    ...article(['technology'], 'New AI model release'),
    publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  };

  assert.equal(isTrendingNotificationRelevant(pressingOnly, prefs, Date.now(), 3), false);
  assert.equal(isTrendingNotificationRelevant(article(['technology'], 'New AI model release'), prefs, Date.now(), 3), true);
});

test('isTrendingNotificationRelevant allows pressing story with liked articles and narrowed topics', () => {
  const liked = article(['science'], 'Mars rover discovery');
  const prefs = prefsWithLike(liked, { enabledTopics: ['science'] });
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
