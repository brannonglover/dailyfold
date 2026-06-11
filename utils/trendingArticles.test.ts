import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import {
  buildFeedTrendingBadgeByArticleId,
  calendarDaysSincePublished,
  findHotTrendingCandidates,
  TRENDING_BADGE_LABEL,
  trendingBadgeAccessibilityLabel,
  trendingBadgeLabel,
} from '@/utils/trendingArticles';

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

test('calendarDaysSincePublished uses local calendar day boundaries', () => {
  const now = new Date(2026, 5, 11, 12, 0, 0).getTime();
  const sameDay = new Date(2026, 5, 11, 1, 0, 0).toISOString();
  const yesterday = new Date(2026, 5, 10, 23, 0, 0).toISOString();
  const twoDaysAgo = new Date(2026, 5, 9, 10, 0, 0).toISOString();

  assert.equal(calendarDaysSincePublished(article('a', 'Wire', sameDay), now), 0);
  assert.equal(calendarDaysSincePublished(article('b', 'Wire', yesterday), now), 1);
  assert.equal(calendarDaysSincePublished(article('c', 'Wire', twoDaysAgo), now), 2);
});

test('trendingBadgeLabel reflects multi-day duration', () => {
  assert.equal(trendingBadgeLabel({ kind: 'trending', days: 0 }), TRENDING_BADGE_LABEL);
  assert.equal(trendingBadgeLabel({ kind: 'trending', days: 3 }), 'Trending · 3d');
  assert.equal(trendingBadgeLabel({ kind: 'still-trending', days: 0 }), TRENDING_BADGE_LABEL);
  assert.equal(trendingBadgeLabel({ kind: 'still-trending', days: 1 }), TRENDING_BADGE_LABEL);
  assert.equal(trendingBadgeLabel({ kind: 'still-trending', days: 2 }), 'Trending · 2d');
});

test('trendingBadgeAccessibilityLabel describes multi-day trending', () => {
  assert.equal(trendingBadgeAccessibilityLabel({ kind: 'still-trending', days: 0 }), TRENDING_BADGE_LABEL);
  assert.equal(trendingBadgeAccessibilityLabel({ kind: 'still-trending', days: 2 }), '2 days trending');
});

test('buildFeedTrendingBadgeByArticleId marks sticky multi-day hero with duration', () => {
  const now = new Date(2026, 5, 11, 12, 0, 0).getTime();
  const twoDaysAgo = new Date(2026, 5, 9, 10, 0, 0).toISOString();
  const recent = new Date(now - 2 * 60 * 60 * 1000).toISOString();

  const badges = buildFeedTrendingBadgeByArticleId(
    [article('hero', 'MSNBC', twoDaysAgo), article('fresh', 'Wire', recent)],
    { nowMs: now },
  );

  const heroBadge = badges.get('hero');
  assert.deepEqual(heroBadge, { kind: 'still-trending', days: 2 });
  assert.equal(trendingBadgeLabel(heroBadge!), 'Trending · 2d');
  assert.equal(trendingBadgeAccessibilityLabel(heroBadge!), '2 days trending');

  assert.equal(badges.has('fresh'), false);
});

test('buildFeedTrendingBadgeByArticleId badges hero and featured burst leaders only', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const articles = [
    article('hero', 'Wire', recent(20 * 60 * 1000)),
    article('burst-a', 'BurstCo', recent(25 * 60 * 1000)),
    article('burst-b', 'BurstCo', recent(35 * 60 * 1000)),
    article('plain', 'Other', recent(2 * 60 * 60 * 1000)),
  ];

  const badges = buildFeedTrendingBadgeByArticleId(articles, {
    featuredIds: new Set(['burst-a']),
    nowMs: now,
  });

  assert.deepEqual(badges.get('hero'), { kind: 'trending', days: 0 });
  assert.deepEqual(badges.get('burst-a'), { kind: 'trending', days: 0 });
  assert.equal(badges.has('plain'), false);
  assert.equal(badges.has('burst-b'), false);
});

test('buildFeedTrendingBadgeByArticleId skips hot compact-grid articles without featured row', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const articles = [
    article('hero', 'Polygon', recent(10 * 60 * 1000)),
    article('p1', 'Kotaku', recent(2 * 60 * 60 * 1000)),
    article('g1', 'GamesRadar+', recent(2.5 * 60 * 60 * 1000)),
    article('g2', 'GamesRadar+', recent(2.75 * 60 * 60 * 1000)),
    article('i1', 'IGN', recent(3 * 60 * 60 * 1000)),
  ];

  const badges = buildFeedTrendingBadgeByArticleId(articles, { nowMs: now });

  assert.deepEqual(badges.get('hero'), { kind: 'trending', days: 0 });
  assert.equal(badges.has('p1'), false);
  assert.equal(badges.has('g1'), false);
  assert.equal(badges.has('g2'), false);
  assert.equal(badges.has('i1'), false);
});

test('buildFeedTrendingBadgeByArticleId skips breaking-only stories outside featured row', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const articles = [
    article('hero', 'Wire', recent(20 * 60 * 1000)),
    article('breaking', 'Fox News', recent(15 * 60 * 1000)),
  ];

  const badges = buildFeedTrendingBadgeByArticleId(articles, { nowMs: now });

  assert.deepEqual(badges.get('hero'), { kind: 'trending', days: 0 });
  assert.equal(badges.has('breaking'), false);
});

test('buildFeedTrendingBadgeByArticleId marks in-window hero that is not hot', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const badges = buildFeedTrendingBadgeByArticleId(
    [article('hero', 'Solo', recent(2 * 60 * 60 * 1000))],
    { nowMs: now },
  );

  assert.deepEqual(badges.get('hero'), { kind: 'trending', days: 0 });
});
