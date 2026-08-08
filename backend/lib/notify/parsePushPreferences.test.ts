import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePushPreferences } from './parsePushPreferences';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    topicScores: { technology: 1 },
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

test('parsePushPreferences accepts a well-formed body', () => {
  const parsed = parsePushPreferences(validBody());
  assert.ok(parsed);
  assert.equal(parsed?.trendingNotificationsEnabled, true);
  assert.deepEqual(parsed?.topicScores, { technology: 1 });
});

test('parsePushPreferences rejects a non-object body', () => {
  assert.equal(parsePushPreferences(null), null);
  assert.equal(parsePushPreferences('nope'), null);
  assert.equal(parsePushPreferences(42), null);
});

test('parsePushPreferences rejects a score map with a non-numeric value', () => {
  assert.equal(parsePushPreferences(validBody({ topicScores: { technology: 'high' } })), null);
});

test('parsePushPreferences rejects a score map with a non-finite value', () => {
  assert.equal(parsePushPreferences(validBody({ topicScores: { technology: Infinity } })), null);
});

test('parsePushPreferences rejects a string array field with a non-string entry', () => {
  assert.equal(parsePushPreferences(validBody({ enabledTopics: ['world', 42] })), null);
});

test('parsePushPreferences rejects a non-boolean trendingNotificationsEnabled', () => {
  assert.equal(parsePushPreferences(validBody({ trendingNotificationsEnabled: 'yes' })), null);
});

test('parsePushPreferences rejects a missing field', () => {
  const body = validBody();
  delete (body as Record<string, unknown>).blockedKeywords;
  assert.equal(parsePushPreferences(body), null);
});
