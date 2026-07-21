import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { articleSpreadBucket } from '@/utils/feedOrdering';
import {
  articleFeedCardFieldsEqual,
  dedupeArticlesById,
  insertDisplayNewcomersAtSourceOrder,
  isFilterExpansion,
  mergePaginatedDisplayFeed,
  sliceOrderedArticles,
  updateDisplayArticlesInPlace,
} from '@/utils/mergeDisplayFeed';

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

test('dedupeArticlesById keeps first occurrence and preserves order', () => {
  const first = article('a');
  const duplicate = { ...article('a'), title: 'duplicate-title' };
  const deduped = dedupeArticlesById([first, article('b'), duplicate, article('c'), article('b')]);

  assert.deepEqual(
    deduped.map((item) => item.id),
    ['a', 'b', 'c'],
  );
  assert.equal(deduped[0], first);
});

test('mergePaginatedDisplayFeed drops duplicate ids when the same page is merged twice', () => {
  const source = [article('a'), article('b'), article('c'), article('d')];
  const prev = [article('a'), article('b')];
  const newOnly = [article('c'), article('d')];

  const once = mergePaginatedDisplayFeed(prev, newOnly, source, (items) => items);
  const twice = mergePaginatedDisplayFeed(once, newOnly, source, (items) => items);

  assert.equal(twice.length, 4);
  assert.deepEqual(new Set(twice.map((item) => item.id)), new Set(['a', 'b', 'c', 'd']));
});

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

test('insertDisplayNewcomersAtSourceOrder keeps existing order and slots newcomers by source index', () => {
  const source = [article('n1'), article('a'), article('n2'), article('b'), article('c')];
  const prev = [article('a'), article('b')];
  const newOnly = [article('n1'), article('n2'), article('c')];

  const merged = insertDisplayNewcomersAtSourceOrder(prev, newOnly, source);

  assert.deepEqual(
    merged.map((item) => item.id),
    ['n1', 'a', 'n2', 'b', 'c'],
  );
});

test('insertDisplayNewcomersAtSourceOrder does not reshuffle the existing head when newcomers arrive', () => {
  const source = [
    article('n1', 'ESPN NFL'),
    article('n2', 'ESPN NFL'),
    article('n3', 'ESPN NFL'),
    article('a', 'BBC News'),
    article('b', 'CNN'),
  ];
  const prev = [article('a', 'BBC News'), article('b', 'CNN')];
  const newOnly = [article('n1', 'ESPN NFL'), article('n2', 'ESPN NFL'), article('n3', 'ESPN NFL')];

  const merged = insertDisplayNewcomersAtSourceOrder(prev, newOnly, source);

  assert.deepEqual(
    merged.map((item) => item.id),
    ['n1', 'n2', 'n3', 'a', 'b'],
  );
});

test('articleFeedCardFieldsEqual ignores object identity when card fields match', () => {
  const left = article('a');
  const right = { ...article('a'), body: 'different-body-not-shown-in-feed' };
  assert.equal(articleFeedCardFieldsEqual(left, right), true);
});

test('updateDisplayArticlesInPlace keeps row references when only non-card fields change', () => {
  const prev = [article('a'), article('b')];
  const source = [
    { ...article('a'), body: 'updated-body' },
    { ...article('b'), body: 'updated-body' },
  ];

  const next = updateDisplayArticlesInPlace(prev, source);

  assert.equal(next, prev);
});

test('updateDisplayArticlesInPlace refreshes fields without reordering', () => {
  const prev = [article('a'), article('b')];
  const source = [
    { ...article('a'), title: 'updated-a' },
    { ...article('b'), title: 'updated-b' },
  ];

  const next = updateDisplayArticlesInPlace(prev, source);

  assert.deepEqual(
    next.map((item) => item.id),
    ['a', 'b'],
  );
  assert.equal(next[0]?.title, 'updated-a');
});

test('isFilterExpansion detects preference widening', () => {
  const prev = JSON.stringify({ topics: [], sports: [], sources: ['espn'] });
  const next = JSON.stringify({ topics: [], sports: [], sources: [] });
  assert.equal(isFilterExpansion(prev, next), true);
  assert.equal(isFilterExpansion(next, prev), false);
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

test('sliceOrderedArticles keeps allowed rows in their ranked order', () => {
  const ordered = [article('a'), article('b'), article('c'), article('d')];
  const allowed = [article('c'), article('a')];

  const sliced = sliceOrderedArticles(ordered, allowed);

  assert.deepEqual(sliced?.map((item) => item.id), ['a', 'c']);
});

test('sliceOrderedArticles returns null when the ranked order is missing an allowed row', () => {
  const ordered = [article('a'), article('b')];
  const allowed = [article('a'), article('z')];

  assert.equal(sliceOrderedArticles(ordered, allowed), null);
});

test('sliceOrderedArticles returns an empty list when nothing is allowed', () => {
  const ordered = [article('a'), article('b')];

  assert.deepEqual(sliceOrderedArticles(ordered, []), []);
});
