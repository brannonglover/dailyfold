import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import { findHotTrendingCandidates } from '@/utils/trendingArticles';

function article(
  id: string,
  source: string,
  publishedAt: string,
): Article {
  return {
    id,
    title: `Title ${id}`,
    excerpt: 'excerpt',
    body: 'body',
    source,
    imageUrl: 'https://example.com/1.jpg',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

test('findHotTrendingCandidates prefers outlet burst over single older story', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const burst = [
    article('a1', 'Wire', recent(30 * 60 * 1000)),
    article('a2', 'Wire', recent(45 * 60 * 1000)),
  ];
  const lone = [article('b1', 'Other', recent(2 * 60 * 60 * 1000))];

  const hot = findHotTrendingCandidates([...burst, ...lone], now);
  assert.equal(hot.length, 2);
  assert.equal(hot[0]?.article.id, 'a1');
  assert.equal(hot[0]?.burstCount, 2);
});

test('findHotTrendingCandidates includes breaking story within one hour', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const breaking = [article('x1', 'Solo', recent(20 * 60 * 1000))];
  const hot = findHotTrendingCandidates(breaking, now);
  assert.equal(hot.length, 1);
  assert.equal(hot[0]?.article.id, 'x1');
});

test('findHotTrendingCandidates ignores stories outside trending window', () => {
  const now = Date.now();
  const old = new Date(now - 8 * 60 * 60 * 1000).toISOString();
  const hot = findHotTrendingCandidates([article('old', 'Wire', old)], now);
  assert.equal(hot.length, 0);
});
