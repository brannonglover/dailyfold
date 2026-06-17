import assert from 'node:assert/strict';
import test from 'node:test';

import { readLastFeedListHeight, rememberFeedListHeight } from './feedListViewport';

test('rememberFeedListHeight stores positive heights', () => {
  rememberFeedListHeight(640);
  assert.equal(readLastFeedListHeight(), 640);
});

test('rememberFeedListHeight ignores non-positive heights', () => {
  rememberFeedListHeight(500);
  rememberFeedListHeight(0);
  assert.equal(readLastFeedListHeight(), 500);
});
