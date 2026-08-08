import assert from 'node:assert/strict';
import test from 'node:test';

import { findHotTrendingCandidates, isBreakingTrendingArticle } from './trendingArticles';
import { Article } from '../types';

function article(overrides: Partial<Article> & { id: string; source: string; publishedAt: string }): Article {
  return {
    title: 'Story',
    excerpt: 'Story',
    body: 'body',
    imageUrl: 'https://example.com/1.jpg',
    topics: ['world'],
    readTimeMinutes: 3,
    url: `https://example.com/${overrides.id}`,
    ...overrides,
  };
}

test('isBreakingTrendingArticle is true within the last hour', () => {
  const now = Date.now();
  const fresh = article({ id: 'a', source: 'Wire', publishedAt: new Date(now - 30 * 60 * 1000).toISOString() });
  const old = article({ id: 'b', source: 'Wire', publishedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString() });

  assert.equal(isBreakingTrendingArticle(fresh, now), true);
  assert.equal(isBreakingTrendingArticle(old, now), false);
});

test('findHotTrendingCandidates includes breaking stories even without a burst', () => {
  const now = Date.now();
  const breaking = article({ id: 'a', source: 'Wire', publishedAt: new Date(now - 10 * 60 * 1000).toISOString() });

  const candidates = findHotTrendingCandidates([breaking], now);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].article.id, 'a');
  assert.equal(candidates[0].burstCount, 1);
});

test('findHotTrendingCandidates includes outlet bursts (2+ recent stories) even if not breaking', () => {
  const now = Date.now();
  const publishedAt = new Date(now - 2 * 60 * 60 * 1000).toISOString();
  const burst = [
    article({ id: 'a', source: 'Wire', publishedAt }),
    article({ id: 'b', source: 'Wire', publishedAt }),
  ];

  const candidates = findHotTrendingCandidates(burst, now);
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].burstCount, 2);
});

test('findHotTrendingCandidates excludes a single old story from one outlet', () => {
  const now = Date.now();
  const single = article({
    id: 'a',
    source: 'Wire',
    publishedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
  });

  assert.equal(findHotTrendingCandidates([single], now).length, 0);
});

test('findHotTrendingCandidates excludes stories outside the 6h trending window', () => {
  const now = Date.now();
  const stale = article({
    id: 'a',
    source: 'Wire',
    publishedAt: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
  });

  assert.equal(findHotTrendingCandidates([stale], now).length, 0);
});

test('findHotTrendingCandidates sorts by burst count, then recency', () => {
  const now = Date.now();
  const publishedAt = new Date(now - 3 * 60 * 60 * 1000).toISOString();
  const smallBurst = [
    article({ id: 'a', source: 'Wire', publishedAt }),
    article({ id: 'b', source: 'Wire', publishedAt }),
  ];
  const biggerBurst = [
    article({ id: 'c', source: 'Herald', publishedAt }),
    article({ id: 'd', source: 'Herald', publishedAt }),
    article({ id: 'e', source: 'Herald', publishedAt }),
  ];

  const candidates = findHotTrendingCandidates([...smallBurst, ...biggerBurst], now);
  assert.equal(candidates[0].article.source, 'Herald');
  assert.equal(candidates[0].burstCount, 3);
});
