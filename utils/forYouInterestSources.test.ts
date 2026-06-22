import assert from 'node:assert/strict';
import test from 'node:test';

import { sourceIdsForForYouInterests } from './forYouInterestSources';
import { CURIOSITY_ORDER } from '@/constants/curiosities';
import type { UserPreferences } from '@/types';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((topic) => [topic, 0])) as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    forYouTopics: [],
    forYouKeywords: [],
    forYouSportTags: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

test('sourceIdsForForYouInterests includes cycling publishers for bike keywords', () => {
  const ids = sourceIdsForForYouInterests(basePrefs({ forYouKeywords: ['bikes'] }));
  assert.ok(ids.includes('bicycling'));
  assert.ok(ids.includes('velo'));
  assert.ok(ids.includes('pinkbike'));
});

test('sourceIdsForForYouInterests includes cycling publishers for cycling sport tag', () => {
  const ids = sourceIdsForForYouInterests(basePrefs({ forYouSportTags: ['cycling'] }));
  assert.ok(ids.includes('cyclingnews'));
});

test('sourceIdsForForYouInterests returns empty without interests', () => {
  assert.deepEqual(sourceIdsForForYouInterests(basePrefs()), []);
});
