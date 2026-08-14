import assert from 'node:assert/strict';
import test from 'node:test';

import { nextEnabledTopics } from '@/services/topicPreferences';

test('nextEnabledTopics selects one chip from All', () => {
  assert.deepEqual(nextEnabledTopics([], 'world'), ['world']);
});

test('nextEnabledTopics replaces the previous chip instead of appending', () => {
  assert.deepEqual(nextEnabledTopics(['world'], 'sports'), ['sports']);
  assert.deepEqual(nextEnabledTopics(['sports'], 'world'), ['world']);
});

test('nextEnabledTopics tapping the selected chip returns to All', () => {
  assert.deepEqual(nextEnabledTopics(['sports'], 'sports'), []);
});
