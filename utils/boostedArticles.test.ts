import assert from 'node:assert/strict';
import test from 'node:test';

import type { Article } from '@/types';
import { createBoostedArticleStore } from '@/utils/boostedArticles';

const a = (id: string): Article =>
  ({ id, title: id, excerpt: '', source: 's', imageUrl: '', topics: ['books'], publishedAt: '2026-11-01T00:00:00Z', url: id, readTimeMinutes: 1 }) as Article;

test('a replaced pool gets remembered stories back, without duplicating', () => {
  const store = createBoostedArticleStore();
  store.remember([a('x'), a('y')]);
  const replaced = [a('1'), a('y')];
  assert.deepEqual(store.restoreInto(replaced).map((p) => p.id), ['1', 'y', 'x']);
});

test('returns the same pool when nothing is missing (no pointless state update)', () => {
  const store = createBoostedArticleStore();
  store.remember([a('x')]);
  const pool = [a('x'), a('2')];
  assert.equal(store.restoreInto(pool), pool);
});

test('an empty store leaves the pool untouched', () => {
  const pool = [a('1')];
  assert.equal(createBoostedArticleStore().restoreInto(pool), pool);
});
