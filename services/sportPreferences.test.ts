import assert from 'node:assert/strict';
import test from 'node:test';

import { nextEnabledSportTags } from '@/services/sportPreferences';

test('nextEnabledSportTags selects one chip from All', () => {
  assert.deepEqual(nextEnabledSportTags([], 'football'), ['football']);
});

test('nextEnabledSportTags replaces the previous chip instead of appending', () => {
  assert.deepEqual(nextEnabledSportTags(['football'], 'college-football'), ['college-football']);
  assert.deepEqual(nextEnabledSportTags(['college-football'], 'premier-league'), ['premier-league']);
  assert.deepEqual(
    nextEnabledSportTags(['football', 'college-football'], 'premier-league'),
    ['premier-league'],
  );
});

test('nextEnabledSportTags tapping the selected chip returns to All', () => {
  assert.deepEqual(nextEnabledSportTags(['football'], 'football'), []);
});

test('nextEnabledSportTags keeps football as the NFL chip id', () => {
  assert.deepEqual(nextEnabledSportTags([], 'football'), ['football']);
});
