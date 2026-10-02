import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveColdLaunchFeedMode } from './feedSnapshotSession';

test('cold launch without a snapshot constructs exactly once via initial /api/feed', () => {
  assert.equal(resolveColdLaunchFeedMode(false), 'initial');
});

test('cold launch with a snapshot paints first and catches up with one silent /api/feed', () => {
  assert.equal(resolveColdLaunchFeedMode(true), 'silent');
});
