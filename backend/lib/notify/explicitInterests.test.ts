import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeFeedPreferences } from './normalizePushPreferences';
import { parsePushPreferences } from './parsePushPreferences';
import type { PushPreferences } from './types';
import { CURIOSITY_ORDER } from './curiosities';

/**
 * Phase 1 coverage: the three explicit-interest fields must survive the whole
 * client -> payload -> parse -> normalize path without being broadened, cleared or
 * merged with stale values. Persistence round-tripping through Postgres is covered
 * separately in lib/db.pushSubscriptions.test.ts (needs DATABASE_URL).
 */

/** Mirrors services/pushNotifications.ts:toPushPreferencesPayload. */
function clientPayload(overrides: Record<string, unknown> = {}) {
  return {
    topicScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledTopics: [],
    forYouTopics: ['technology'],
    forYouKeywords: ['mountain biking'],
    forYouSportTags: ['mtb'],
    enabledSourceIds: [],
    enabledSportTags: [],
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    trendingNotificationsEnabled: true,
    ...overrides,
  };
}

test('explicit interests survive the payload -> parse -> normalize path', () => {
  const parsed = parsePushPreferences(clientPayload());
  assert.ok(parsed);
  const prefs = normalizeFeedPreferences(parsed);

  assert.deepEqual(prefs.forYouTopics, ['technology']);
  assert.deepEqual(prefs.forYouKeywords, ['mountain biking']);
  assert.deepEqual(prefs.forYouSportTags, ['mtb']);
});

test('a body with no explicit interests parses as empty arrays, not null', () => {
  const body = clientPayload();
  delete (body as Record<string, unknown>).forYouTopics;
  delete (body as Record<string, unknown>).forYouKeywords;
  delete (body as Record<string, unknown>).forYouSportTags;

  const parsed = parsePushPreferences(body);
  assert.ok(parsed, 'older clients that omit the fields must stay valid');
  assert.deepEqual(parsed?.forYouTopics, []);
  assert.deepEqual(parsed?.forYouKeywords, []);
  assert.deepEqual(parsed?.forYouSportTags, []);
});

test('explicit interests reject malformed arrays', () => {
  assert.equal(parsePushPreferences(clientPayload({ forYouKeywords: ['ok', 7] })), null);
  assert.equal(parsePushPreferences(clientPayload({ forYouTopics: 'technology' })), null);
});

test('a full explicit topic selection is NOT collapsed to the All sentinel', () => {
  // enabledTopics uses [] to mean "all"; normalizeFeedPreferences collapses a full
  // selection to []. That rule must not reach forYouTopics, where [] means "none".
  const parsed = parsePushPreferences(
    clientPayload({ enabledTopics: [...CURIOSITY_ORDER], forYouTopics: [...CURIOSITY_ORDER] }),
  );
  assert.ok(parsed);
  const prefs = normalizeFeedPreferences(parsed);

  assert.deepEqual(prefs.enabledTopics, [], 'feed filter still collapses to All');
  assert.equal(
    prefs.forYouTopics.length,
    CURIOSITY_ORDER.length,
    'explicit interests keep every selected topic',
  );
});

test('explicit sport interests survive an all-topics feed filter', () => {
  // normalizeFeedPreferences clears enabledSportTags when topics are not narrowed to
  // sports. Explicit sport interests are independent of the topic filter.
  const parsed = parsePushPreferences(
    clientPayload({
      enabledTopics: [],
      enabledSportTags: ['basketball'],
      forYouSportTags: ['basketball'],
    }),
  );
  assert.ok(parsed);
  const prefs = normalizeFeedPreferences(parsed);

  assert.deepEqual(prefs.enabledSportTags, [], 'feed filter tags still cleared');
  assert.deepEqual(prefs.forYouSportTags, ['basketball'], 'explicit sport interest preserved');
});

test('explicit interests are deduped and keyword-normalized, not broadened', () => {
  const parsed = parsePushPreferences(
    clientPayload({
      forYouTopics: ['technology', 'technology', 'not-a-topic'],
      forYouKeywords: ['  Mountain   Biking ', 'mountain biking', 'AI', ''],
      forYouSportTags: ['mtb', 'mtb', 'not-a-tag'],
    }),
  );
  assert.ok(parsed);
  const prefs = normalizeFeedPreferences(parsed);

  assert.deepEqual(prefs.forYouTopics, ['technology']);
  assert.deepEqual(prefs.forYouKeywords, ['mountain biking', 'ai']);
  assert.deepEqual(prefs.forYouSportTags, ['mtb']);
});

test('soccer interests are not expanded into league tags', () => {
  // expandSoccerFilterTags broadens the *filter* field; explicit interests stay literal.
  const parsed = parsePushPreferences(clientPayload({ forYouSportTags: ['soccer'] }));
  assert.ok(parsed);
  const prefs = normalizeFeedPreferences(parsed);
  assert.deepEqual(prefs.forYouSportTags, ['soccer']);
});

test('removing an interest replaces the stored array rather than merging', () => {
  const first = normalizeFeedPreferences(
    parsePushPreferences(clientPayload({ forYouKeywords: ['ai', 'cycling'] })) as PushPreferences,
  );
  assert.deepEqual(first.forYouKeywords, ['ai', 'cycling']);

  // The client drops "cycling" and re-syncs the full array.
  const second = normalizeFeedPreferences(
    parsePushPreferences(clientPayload({ forYouKeywords: ['ai'] })) as PushPreferences,
  );
  assert.deepEqual(second.forYouKeywords, ['ai'], 'stale interest must not survive');
});
