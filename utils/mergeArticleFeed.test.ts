import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import { mergeArticleFeed } from './mergeArticleFeed';

function article(id: string, source: string, publishedAt: string): Article {
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

test('mergeArticleFeed leads with the batch\'s most trending story', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const prev = [article('old-1', 'Wire', recent(3 * 60 * 60 * 1000))];

  const incoming = [
    ...prev,
    article('plain-1', 'Solo', recent(2 * 60 * 60 * 1000)),
    article('burst-1', 'BurstCo', recent(20 * 60 * 1000)),
    article('burst-2', 'BurstCo', recent(30 * 60 * 1000)),
  ];

  const merged = mergeArticleFeed(prev, incoming);

  assert.equal(merged[0]?.id, 'burst-1');
});

test('mergeArticleFeed falls back to normal spread when no newcomer is trending', () => {
  const now = Date.now();
  const old = new Date(now - 8 * 60 * 60 * 1000).toISOString();

  const prev = [article('old-1', 'Wire', old)];
  const incoming = [...prev, article('new-1', 'Other', old)];

  const merged = mergeArticleFeed(prev, incoming);

  assert.equal(merged.length, 2);
  assert.ok(merged.some((a) => a.id === 'new-1'));
});
