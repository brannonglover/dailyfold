import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import {
  mergeArticleFeed,
  mergeArticlePreferringHero,
  resolveSilentFeedUpdate,
  updateExistingFeedArticles,
} from './mergeArticleFeed';

function article(
  id: string,
  source: string,
  publishedAt: string,
  imageUrl = 'https://example.com/1.jpg',
): Article {
  return {
    id,
    title: `Title ${id}`,
    excerpt: 'excerpt',
    body: 'body',
    source,
    imageUrl,
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

test("mergeArticleFeed leads with the batch's most trending story", () => {
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

test('updateExistingFeedArticles keeps a real hero when silent refresh returns blank imageUrl', () => {
  const prev = [article('a1', 'Wire', '2026-07-29T12:00:00.000Z', 'https://cdn.example.com/hero.jpg')];
  const incoming = [
    {
      ...prev[0]!,
      title: 'Updated title',
      imageUrl: '',
    },
  ];

  const next = updateExistingFeedArticles(prev, incoming);
  assert.equal(next[0]?.title, 'Updated title');
  assert.equal(next[0]?.imageUrl, 'https://cdn.example.com/hero.jpg');
});

test('mergeArticlePreferringHero adopts a newly available hero', () => {
  const existing = article('a1', 'Wire', '2026-07-29T12:00:00.000Z', '');
  const incoming = article('a1', 'Wire', '2026-07-29T12:00:00.000Z', 'https://cdn.example.com/new.jpg');
  const merged = mergeArticlePreferringHero(existing, incoming);
  assert.equal(merged.imageUrl, 'https://cdn.example.com/new.jpg');
});

test('resolveSilentFeedUpdate queues newcomers as pending by default', () => {
  const prev = [article('old', 'Wire', '2026-08-14T08:00:00.000Z')];
  const incoming = [
    article('new', 'Wire', '2026-08-14T12:00:00.000Z'),
    ...prev,
  ];

  const result = resolveSilentFeedUpdate({
    prev,
    incoming,
    pending: [],
    dismissedIds: new Set(),
    suppressFeedMutation: false,
    promoteNewcomers: false,
  });

  assert.deepEqual(result.articles.map((item) => item.id), ['old']);
  assert.deepEqual(result.pending.map((item) => item.id), ['new']);
});

test('resolveSilentFeedUpdate merges newcomers after an explicit refresh', () => {
  const prev = [article('old', 'Wire', '2026-08-14T08:00:00.000Z')];
  const incoming = [
    article('new', 'Wire', '2026-08-14T12:00:00.000Z'),
    ...prev,
  ];

  const result = resolveSilentFeedUpdate({
    prev,
    incoming,
    pending: [],
    dismissedIds: new Set(),
    suppressFeedMutation: false,
    promoteNewcomers: true,
  });

  assert.ok(result.articles.some((item) => item.id === 'new'));
  assert.ok(result.articles.some((item) => item.id === 'old'));
  assert.equal(result.pending.length, 0);
});

test('resolveSilentFeedUpdate does not promote when silent mutation is suppressed', () => {
  const prev = [article('old', 'Wire', '2026-08-14T08:00:00.000Z')];
  const incoming = [
    article('new', 'Wire', '2026-08-14T12:00:00.000Z'),
    ...prev,
  ];

  const result = resolveSilentFeedUpdate({
    prev,
    incoming,
    pending: [],
    dismissedIds: new Set(),
    suppressFeedMutation: true,
    promoteNewcomers: true,
  });

  assert.deepEqual(result.articles.map((item) => item.id), ['old']);
  assert.deepEqual(result.pending.map((item) => item.id), ['new']);
});
