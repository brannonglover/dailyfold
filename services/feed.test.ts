import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFeedRequestPayload } from '@/services/feedPreferencesPayload';
import { UserPreferences } from '@/types';

function prefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: { sports: 3 } as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: { cycling: 2 },
    sportTagScores: { mtb: 4 },
    enabledSourceIds: ['espn'],
    enabledTopics: ['sports'],
    forYouTopics: [],
    forYouKeywords: [],
    forYouSportTags: [],
    enabledSportTags: ['mtb'],
    trendingNotificationsEnabled: false,
    blockedTopics: ['politics'],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

test('the broad feed request drops the active chip so Latest can slice locally', () => {
  const payload = buildFeedRequestPayload(prefs());

  assert.deepEqual(payload.enabledTopics, []);
  assert.deepEqual(payload.enabledSportTags, []);
  assert.deepEqual(payload.enabledSourceIds, ['espn']);
  assert.deepEqual(payload.blockedTopics, ['politics']);
  assert.equal(payload.topicScores.sports, 3);
});

test('a chip-scoped request is an explicit candidate set, not a pagination walk', () => {
  const payload = buildFeedRequestPayload(prefs(), {
    scope: { enabledTopics: ['sports'], enabledSportTags: ['mtb'] },
  });

  assert.deepEqual(payload.enabledTopics, ['sports']);
  assert.deepEqual(payload.enabledSportTags, ['mtb']);
  assert.deepEqual(payload.enabledSourceIds, ['espn']);
});

test('a source-scoped request is used for For You publisher boosts', () => {
  const payload = buildFeedRequestPayload(prefs(), {
    scope: { enabledSourceIds: ['bicycling', 'cyclingnews'] },
  });

  assert.deepEqual(payload.enabledSourceIds, ['bicycling', 'cyclingnews']);
  assert.deepEqual(payload.enabledTopics, []);
});
