import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { FALLBACK_SOURCES } from '@/data/sources';
import {
  addBlockedKeywordsFromArticle,
  disableSourceInPreferences,
  filterArticlesByBlocks,
} from '@/services/blockPreferences';
import { Article, UserPreferences } from '@/types';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
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
    ...overrides,
  };
}

const article: Article = {
  id: '1',
  title: 'Quantum computing breakthrough announced',
  excerpt: 'Scientists reveal new chip design',
  body: 'body',
  source: 'Wired',
  imageUrl: '',
  topics: ['technology'],
  readTimeMinutes: 4,
  publishedAt: '2026-06-01T12:00:00Z',
  url: 'https://example.com/1',
};

test('disableSourceInPreferences removes outlet from all-sources mode', () => {
  const wired = FALLBACK_SOURCES.find((s) => s.name === 'Wired');
  assert.ok(wired);
  const prefs = basePrefs();
  const next = disableSourceInPreferences(prefs, FALLBACK_SOURCES, wired!.id);
  assert.ok(next);
  assert.ok(!next!.enabledSourceIds.includes(wired!.id));
});

test('filterArticlesByBlocks hides articles with blocked keywords', () => {
  const prefs = addBlockedKeywordsFromArticle(basePrefs(), article);
  const result = filterArticlesByBlocks([article], prefs);
  assert.equal(result.length, 0);
});
