import assert from 'node:assert/strict';
import test from 'node:test';

import { toPushPreferencesPayload } from '@/services/pushPreferencesPayload';
import { UserPreferences } from '@/types';

/**
 * Phase 1 coverage for the client half of the sync path: the explicit For You
 * interests must actually leave the device. The server half (parse -> normalize ->
 * persistence) is covered in backend/lib/notify/explicitInterests.test.ts and
 * backend/lib/db.pushSubscriptions.test.ts.
 */

function prefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
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
    ...overrides,
  };
}

test('the sync payload carries the explicit For You interests', () => {
  const payload = toPushPreferencesPayload(
    prefs({
      forYouTopics: ['technology'],
      forYouKeywords: ['mountain biking'],
      forYouSportTags: ['mtb'],
    }),
  );

  assert.deepEqual(payload.forYouTopics, ['technology']);
  assert.deepEqual(payload.forYouKeywords, ['mountain biking']);
  assert.deepEqual(payload.forYouSportTags, ['mtb']);
});

test('the sync payload defaults missing explicit interests to empty arrays', () => {
  // Preferences persisted by an older build have no forYou* keys at all.
  const legacy = prefs();
  delete (legacy as Partial<UserPreferences>).forYouTopics;
  delete (legacy as Partial<UserPreferences>).forYouKeywords;
  delete (legacy as Partial<UserPreferences>).forYouSportTags;

  const payload = toPushPreferencesPayload(legacy);

  assert.deepEqual(payload.forYouTopics, []);
  assert.deepEqual(payload.forYouKeywords, []);
  assert.deepEqual(payload.forYouSportTags, []);
});

test('clearing an interest sends the shortened array, not the previous one', () => {
  const payload = toPushPreferencesPayload(prefs({ forYouKeywords: ['ai'] }));
  assert.deepEqual(payload.forYouKeywords, ['ai']);

  const cleared = toPushPreferencesPayload(prefs({ forYouKeywords: [] }));
  assert.deepEqual(cleared.forYouKeywords, []);
});
