import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { buildNewspaperFeaturedIds, groupNewspaperFeedRows } from '@/utils/newspaperFeedRows';

function article(id: string, source: string, publishedAt: string): Article {
  return {
    id,
    title: id,
    excerpt: '',
    body: '',
    source,
    imageUrl: 'https://example.com/img.jpg',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

test('buildNewspaperFeaturedIds excludes hero and picks one burst leader per outlet', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const recent = new Date(now - 30 * 60 * 1000).toISOString();
  const articles = [
    article('hero', 'Wire', recent),
    article('burst-a', 'Bloomberg', recent),
    article('burst-b', 'Bloomberg', recent),
    article('lone', 'Engadget', recent),
  ];

  const featured = buildNewspaperFeaturedIds(articles, now);
  assert.equal(featured.has('hero'), false);
  assert.equal(featured.has('burst-a'), true);
  assert.equal(featured.has('burst-b'), false);
  assert.equal(featured.has('lone'), false);
});

test('buildNewspaperFeaturedIds ignores standalone breaking stories', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const recent = new Date(now - 20 * 60 * 1000).toISOString();
  const articles = [
    article('hero', 'Wire', recent),
    article('solo-a', 'Engadget', recent),
    article('solo-b', 'ESPN', recent),
    article('solo-c', 'Reuters', recent),
  ];

  const featured = buildNewspaperFeaturedIds(articles, now);
  assert.equal(featured.size, 0);
});

test('groupNewspaperFeedRows inserts featured rows for hot stories', () => {
  const below = [
    article('a', 'Wire', '2026-06-09T11:00:00.000Z'),
    article('b', 'Wire', '2026-06-09T11:00:00.000Z'),
    article('hot', 'Bloomberg', '2026-06-09T11:00:00.000Z'),
    article('c', 'Engadget', '2026-06-09T11:00:00.000Z'),
    article('d', 'ESPN', '2026-06-09T11:00:00.000Z'),
  ];
  const featuredIds = new Set(['hot']);

  const rows = groupNewspaperFeedRows(below, featuredIds);
  assert.deepEqual(
    rows.map((row) => row.type),
    ['compactPair', 'featured', 'compactPair'],
  );
});

test('groupNewspaperFeedRows keeps mostly compact pairs without hot signals', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const recent = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const below = [
    article('1', 'A', recent),
    article('2', 'B', recent),
    article('3', 'C', recent),
    article('4', 'D', recent),
    article('5', 'E', recent),
    article('6', 'F', recent),
  ];

  const rows = groupNewspaperFeedRows(below, new Set());
  assert.deepEqual(
    rows.map((row) => row.type),
    ['compactPair', 'compactPair', 'compactPair'],
  );
});

test('groupNewspaperFeedRows leaves singleton compact row before featured break', () => {
  const below = [
    article('a', 'Wire', '2026-06-09T11:00:00.000Z'),
    article('b', 'Wire', '2026-06-09T11:00:00.000Z'),
    article('guardian', 'The Guardian', '2026-06-09T11:00:00.000Z'),
    article('hot', 'Bloomberg', '2026-06-09T11:00:00.000Z'),
    article('c', 'Engadget', '2026-06-09T11:00:00.000Z'),
  ];
  const featuredIds = new Set(['hot']);

  const rows = groupNewspaperFeedRows(below, featuredIds);
  assert.deepEqual(
    rows.map((row) => row.type),
    ['compactPair', 'compactPair', 'featured', 'compactPair'],
  );
  const singletonRow = rows[1];
  assert.equal(singletonRow?.type, 'compactPair');
  if (singletonRow?.type === 'compactPair') {
    assert.equal(singletonRow.articles.length, 1);
    assert.equal(singletonRow.articles[0]?.id, 'guardian');
  }
});

test('groupNewspaperFeedRows inserts occasional featured breaks for burst leaders', () => {
  const now = Date.parse('2026-06-09T12:00:00.000Z');
  const recent = new Date(now - 30 * 60 * 1000).toISOString();
  const articles = [
    article('hero', 'Wire', recent),
    article('burst-a', 'Bloomberg', recent),
    article('burst-b', 'Bloomberg', recent),
    article('1', 'A', recent),
    article('2', 'B', recent),
    article('3', 'C', recent),
    article('4', 'D', recent),
  ];
  const featuredIds = buildNewspaperFeaturedIds(articles, now);
  const below = articles.slice(1);

  const rows = groupNewspaperFeedRows(below, featuredIds);
  const types = rows.map((row) => row.type);
  const featuredCount = types.filter((type) => type === 'featured').length;
  const compactCount = types.filter((type) => type === 'compactPair').length;

  assert.equal(featuredCount, 1);
  assert.equal(compactCount, 3);
  assert.equal(types[0], 'featured');
});
