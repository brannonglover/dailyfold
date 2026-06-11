import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { articleSpreadBucket } from '@/utils/feedOrdering';
import { mergePaginatedDisplayFeed } from '@/utils/mergeDisplayFeed';

function article(id: string, source = 'Source'): Article {
  return {
    id,
    title: id,
    excerpt: 'excerpt',
    body: 'body',
    source,
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

test('mergePaginatedDisplayFeed drops display rows no longer in the filtered source list', () => {
  const source = [article('a'), article('c'), article('d')];
  const prev = [article('a'), article('b'), article('c')];
  const newOnly = [article('d')];

  const merged = mergePaginatedDisplayFeed(prev, newOnly, source, (items) => items);

  assert.deepEqual(
    merged.map((item) => item.id),
    ['a', 'c', 'd'],
  );
});

test('mergePaginatedDisplayFeed spreads prepended batches against the feed head', () => {
  const source = [
    article('n1', 'ESPN NFL'),
    article('n2', 'ESPN NFL'),
    article('n3', 'ESPN NFL'),
    article('a', 'BBC News'),
    article('b', 'CNN'),
  ];
  const prev = [article('a', 'BBC News'), article('b', 'CNN')];
  const newOnly = [article('n1', 'ESPN NFL'), article('n2', 'ESPN NFL'), article('n3', 'ESPN NFL')];

  const merged = mergePaginatedDisplayFeed(prev, newOnly, source, (items) => items);

  assert.notEqual(articleSpreadBucket(merged[0]!), articleSpreadBucket(merged[1]!));
  assert.ok(merged.some((item) => item.id === 'n1'));
  assert.ok(merged.some((item) => item.id === 'a'));
});
