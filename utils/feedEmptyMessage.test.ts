import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FOR_YOU_NO_MATCHES_MESSAGE,
  FOR_YOU_NO_SIGNALS_MESSAGE,
  getForYouEmptyMessage,
} from './feedEmptyMessage';

test('getForYouEmptyMessage prompts to add topics when none selected', () => {
  assert.equal(
    getForYouEmptyMessage({
      totalCount: 100,
      filteredCount: 0,
      sourceFilteredCount: 80,
      hasForYouTopics: false,
    }),
    FOR_YOU_NO_SIGNALS_MESSAGE,
  );
});

test('getForYouEmptyMessage reports no matches when topics are selected', () => {
  assert.equal(
    getForYouEmptyMessage({
      totalCount: 100,
      filteredCount: 0,
      sourceFilteredCount: 80,
      hasForYouTopics: true,
    }),
    FOR_YOU_NO_MATCHES_MESSAGE,
  );
});
