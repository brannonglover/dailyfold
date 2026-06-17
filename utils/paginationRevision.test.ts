import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLoadMoreTriggerKey,
  shouldBumpPaginationRevision,
} from './paginationRevision';

test('shouldBumpPaginationRevision bumps on append even when metadata is unchanged', () => {
  const meta = { hasMore: true, nextCursor: '2026-06-01T00:00:00.000Z|abc' };
  assert.equal(shouldBumpPaginationRevision('append', meta, meta), true);
});

test('shouldBumpPaginationRevision bumps when hasMore becomes available after silent refresh', () => {
  const prev = { hasMore: false, nextCursor: null };
  const next = { hasMore: true, nextCursor: '2026-06-01T00:00:00.000Z|abc' };
  assert.equal(shouldBumpPaginationRevision('silent', prev, next), true);
});

test('shouldBumpPaginationRevision skips silent refresh with unchanged pagination metadata', () => {
  const meta = { hasMore: true, nextCursor: '2026-06-01T00:00:00.000Z|abc' };
  assert.equal(shouldBumpPaginationRevision('silent', meta, meta), false);
});

test('buildLoadMoreTriggerKey changes when epoch advances without cursor growth', () => {
  const before = buildLoadMoreTriggerKey(80, 1);
  const after = buildLoadMoreTriggerKey(80, 2);
  assert.notEqual(before, after);
});
