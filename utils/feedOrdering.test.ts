import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import {
  articleSpreadBucket,
  interleaveByPrimaryTopic,
  interleaveBySource,
  orderLatestFeed,
  orderPersonalizedFeed,
  spreadAgainstFeedHead,
  spreadArticlesBySource,
} from '@/utils/feedOrdering';
import type { SportTag } from '@/types';

function article(
  id: string,
  topic: Article['topics'][number],
  publishedAt: string,
  options?: { source?: string; sportTags?: SportTag[] },
): Article {
  return {
    id,
    title: id,
    excerpt: 'excerpt',
    body: 'body',
    source: options?.source ?? `Source ${topic}`,
    imageUrl: 'https://example.com/1.jpg',
    topics: [topic],
    sportTags: options?.sportTags,
    readTimeMinutes: 3,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

function maxConsecutiveSameBucket(items: Article[]): number {
  let max = 1;
  let run = 1;
  for (let i = 1; i < items.length; i += 1) {
    if (articleSpreadBucket(items[i]!) === articleSpreadBucket(items[i - 1]!)) {
      run += 1;
      max = Math.max(max, run);
    } else {
      run = 1;
    }
  }
  return max;
}

test('interleaveByPrimaryTopic mixes topics when sports dominates by count', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const sports = Array.from({ length: 12 }, (_, i) =>
    article(`sport-${i}`, 'sports', recent(i * 1000)),
  );
  const world = Array.from({ length: 3 }, (_, i) =>
    article(`world-${i}`, 'world', recent(20_000 + i * 1000)),
  );
  const tech = Array.from({ length: 2 }, (_, i) =>
    article(`tech-${i}`, 'technology', recent(30_000 + i * 1000)),
  );

  const ordered = interleaveByPrimaryTopic([...sports, ...world, ...tech]);
  const firstSixTopics = ordered.slice(0, 6).map((a) => a.topics[0]);
  const uniqueInHead = new Set(firstSixTopics);

  assert.ok(uniqueInHead.size >= 2, `expected mixed topics, got ${[...uniqueInHead].join(', ')}`);
});

test('interleaveBySource spreads a dominant outlet batch', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const espnNfl = Array.from({ length: 8 }, (_, i) =>
    article(`nfl-${i}`, 'sports', recent(i * 1000), {
      source: 'ESPN NFL',
      sportTags: ['nfl'],
    }),
  );
  const bbc = [article('bbc-0', 'world', recent(9_000), { source: 'BBC News' })];
  const cnn = [article('cnn-0', 'world', recent(10_000), { source: 'CNN' })];

  const ordered = interleaveBySource([...espnNfl, ...bbc, ...cnn]);
  const firstSixBuckets = ordered.slice(0, 6).map(articleSpreadBucket);
  const uniqueBuckets = new Set(firstSixBuckets);

  assert.ok(uniqueBuckets.size >= 2, `expected mixed outlets, got ${[...uniqueBuckets].join(', ')}`);
  assert.ok(
    maxConsecutiveSameBucket(ordered) < maxConsecutiveSameBucket([...espnNfl, ...bbc, ...cnn]),
    `expected spread to shorten runs, got ${maxConsecutiveSameBucket(ordered)}`,
  );
});

test('interleaveBySource splits same-outlet sport facets', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const espnNfl = Array.from({ length: 4 }, (_, i) =>
    article(`nfl-${i}`, 'sports', recent(i * 1000), {
      source: 'ESPN',
      sportTags: ['nfl'],
    }),
  );
  const espnSoccer = Array.from({ length: 4 }, (_, i) =>
    article(`soccer-${i}`, 'sports', recent(5_000 + i * 1000), {
      source: 'ESPN',
      sportTags: ['soccer'],
    }),
  );

  const ordered = interleaveBySource([...espnNfl, ...espnSoccer]);
  const firstEightBuckets = ordered.slice(0, 8).map(articleSpreadBucket);

  assert.ok(
    firstEightBuckets.includes('ESPN::nfl') && firstEightBuckets.includes('ESPN::soccer'),
    `expected both facets near the top, got ${firstEightBuckets.join(', ')}`,
  );
});

test('spreadArticlesBySource matches interleaveBySource', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const batch = [
    article('a', 'sports', recent(0), { source: 'ESPN NFL', sportTags: ['nfl'] }),
    article('b', 'sports', recent(1000), { source: 'ESPN NFL', sportTags: ['nfl'] }),
    article('c', 'world', recent(2000), { source: 'BBC News' }),
  ];

  assert.deepEqual(
    spreadArticlesBySource(batch).map((item) => item.id),
    interleaveBySource(batch).map((item) => item.id),
  );
});

test('spreadAgainstFeedHead avoids boundary clustering on prepend', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const prev = [
    article('prev-espn', 'sports', recent(60_000), { source: 'ESPN NFL', sportTags: ['nfl'] }),
    article('prev-bbc', 'world', recent(61_000), { source: 'BBC News' }),
  ];
  const newcomers = Array.from({ length: 4 }, (_, i) =>
    article(`new-nfl-${i}`, 'sports', recent(i * 1000), {
      source: 'ESPN NFL',
      sportTags: ['nfl'],
    }),
  );

  const merged = spreadAgainstFeedHead(newcomers, prev);
  assert.notEqual(articleSpreadBucket(merged[0]!), articleSpreadBucket(merged[1]!));
  assert.ok(merged.some((item) => item.id.startsWith('new-nfl')));
  assert.ok(merged.some((item) => item.id === 'prev-bbc'));
});

test('interleaveByPrimaryTopic spreads within a dominant topic bucket', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const espnNfl = Array.from({ length: 4 }, (_, i) =>
    article(`nfl-${i}`, 'sports', recent(i * 1000), {
      source: 'ESPN NFL',
      sportTags: ['nfl'],
    }),
  );
  const cbsNfl = Array.from({ length: 4 }, (_, i) =>
    article(`cbs-${i}`, 'sports', recent(12_000 + i * 1000), {
      source: 'CBS Sports',
      sportTags: ['nfl'],
    }),
  );
  const world = [article('world-0', 'world', recent(20_000), { source: 'BBC News' })];

  const ordered = interleaveByPrimaryTopic([...espnNfl, ...cbsNfl, ...world]);
  const sportsRun = maxConsecutiveSameBucket(
    ordered.filter((item) => item.topics[0] === 'sports').slice(0, 8),
  );

  assert.ok(sportsRun <= 2, `expected short sports outlet runs, got ${sportsRun}`);
});

test('orderLatestFeed diversifyTopics surfaces non-sports in the first cards', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const sports = Array.from({ length: 20 }, (_, i) =>
    article(`sport-${i}`, 'sports', recent(i * 1000)),
  );
  const world = [article('world-0', 'world', recent(25_000))];

  const ordered = orderLatestFeed([...sports, ...world], { diversifyTopics: true });
  const firstFiveTopics = ordered.slice(0, 5).map((a) => a.topics[0]);

  assert.ok(
    firstFiveTopics.some((topic) => topic !== 'sports'),
    `expected a non-sports card near the top, got ${firstFiveTopics.join(', ')}`,
  );
});

test('orderPersonalizedFeed interleaves by topic, not outlet burst priority', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const mensHealthCulture = Array.from({ length: 6 }, (_, i) =>
    article(`mh-${i}`, 'culture', recent(i * 1000), { source: 'Mens Health' }),
  );
  const otherCulture = [
    article('culture-other', 'culture', recent(7_000), { source: 'Vanity Fair' }),
  ];
  const tech = [article('tech-0', 'technology', recent(8_000), { source: 'Wired' })];

  const ordered = orderPersonalizedFeed([...mensHealthCulture, ...otherCulture, ...tech]);
  const firstFourTopics = ordered.slice(0, 4).map((a) => a.topics[0]);

  assert.ok(
    firstFourTopics.includes('technology'),
    `expected affinity-ranked non-dominant topics near the top, got ${firstFourTopics.join(', ')}`,
  );
  assert.ok(
    firstFourTopics.filter((topic) => topic === 'culture').length <= 3,
    `expected topic mixing in For You ordering, got ${firstFourTopics.join(', ')}`,
  );
});
