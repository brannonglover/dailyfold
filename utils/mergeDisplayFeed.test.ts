import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { mergePaginatedDisplayFeed } from '@/utils/mergeDisplayFeed';

function article(id: string): Article {
  return {
    id,
    title: id,
    excerpt: 'excerpt',
    body: 'body',
    source: 'Source',
    imageUrl: '',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: '2026-06-08T12:00:00.000Z',
    url: `https://example.com/${id}`,
  };
}

test('mergePaginatedDisplayFeed appends when new items are later in the source list', () => {
  const source = [article('a'), article('b'), article('c'), article('d')];
  const prev = [article('a'), article('b')];
  const newOnly = [article('c'), article('d')];

  const merged = mergePaginatedDisplayFeed(prev, newOnly, source, (items) => items);

  assert.deepEqual(
    merged.map((item) => item.id),
    ['a', 'b', 'c', 'd'],
  );
});

test('mergePaginatedDisplayFeed prepends when new items are earlier in the source list', () => {
  const source = [article('n1'), article('n2'), article('a'), article('b')];
  const prev = [article('a'), article('b')];
  const newOnly = [article('n1'), article('n2')];

  const merged = mergePaginatedDisplayFeed(prev, newOnly, source, (items) => items);

  assert.deepEqual(
    merged.map((item) => item.id),
    ['n1', 'n2', 'a', 'b'],
  );
});
