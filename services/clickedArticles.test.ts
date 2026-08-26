import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveContinueReadingArticles,
  resolveClickedArticles,
} from './clickedArticles';
import { Article } from '@/types';

function article(id: string): Article {
  return {
    id,
    title: `Title ${id}`,
    excerpt: 'Excerpt',
    body: '',
    source: 'Source',
    imageUrl: 'https://example.com/image.jpg',
    topics: ['technology'],
    readTimeMinutes: 5,
    publishedAt: '2026-01-01T00:00:00.000Z',
    url: `https://example.com/${id}`,
  };
}

test('resolveContinueReadingArticles excludes read-later saves and unread bounces', () => {
  const feed = [article('a'), article('b'), article('c')];
  const cache = { d: article('d') };
  const engagement = {
    a: { readPercent: 40, dwellSeconds: 30, updatedAt: '2026-01-01T00:00:00.000Z' },
    c: { readPercent: 0, dwellSeconds: 3, updatedAt: '2026-01-01T00:00:00.000Z' },
    d: { readPercent: 15, dwellSeconds: 20, updatedAt: '2026-01-01T00:00:00.000Z' },
  };
  const resolved = resolveContinueReadingArticles(
    ['a', 'b', 'c', 'd'],
    cache,
    feed,
    new Set(['b']),
    engagement,
  );

  assert.deepEqual(
    resolved.map((item) => item.id),
    ['d', 'a'],
  );
});

test('resolveClickedArticles prefers feed data and newest-first order', () => {
  const feed = [article('b')];
  const cache = { a: article('a'), c: article('c') };
  const resolved = resolveClickedArticles(['a', 'c', 'b'], cache, feed);

  assert.deepEqual(
    resolved.map((item) => item.id),
    ['b', 'c', 'a'],
  );
  assert.equal(resolved[1]?.title, 'Title c');
});
