import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import {
  ALL_TOPICS_SPORTS_PER_TAG_LIMIT,
  ALL_TOPICS_SPORTS_TOTAL_LIMIT,
  limitSportsInAllTopicsFeed,
} from '@/utils/limitAllTopicsSports';

function article(
  id: string,
  topics: Article['topics'],
  publishedAt: string,
  overrides: Partial<Article> = {},
): Article {
  return {
    id,
    title: `Title ${id}`,
    excerpt: 'excerpt',
    body: 'body',
    source: 'BBC Sport',
    imageUrl: 'https://example.com/1.jpg',
    topics,
    readTimeMinutes: 3,
    publishedAt,
    url: `https://example.com/${id}`,
    ...overrides,
  };
}

test('limitSportsInAllTopicsFeed drops non-trending sports but keeps other topics', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const old = new Date(now - 8 * 60 * 60 * 1000).toISOString();

  const articles = [
    article('tech', ['technology'], recent(60_000), { source: 'Wired' }),
    article('sport-old', ['sports'], old, { sportTags: ['football'] }),
    article('world', ['world'], recent(120_000), { source: 'The Guardian' }),
  ];

  const result = limitSportsInAllTopicsFeed(articles, now);
  assert.deepEqual(result.map((a) => a.id), ['tech', 'world']);
});

test('limitSportsInAllTopicsFeed keeps breaking sports stories', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const breaking = article('nfl-breaking', ['sports'], recent(20 * 60 * 1000), {
    source: 'ESPN',
    sportTags: ['football'],
    title: 'NFL quarterback injury update',
  });

  const result = limitSportsInAllTopicsFeed([breaking], now);
  assert.deepEqual(result.map((a) => a.id), ['nfl-breaking']);
});

test('limitSportsInAllTopicsFeed caps hot sports per league facet', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const nflBurst = Array.from({ length: 4 }, (_, index) =>
    article(`nfl-${index}`, ['sports'], recent(30 * 60 * 1000 + index * 1000), {
      source: 'ESPN',
      sportTags: ['football'],
      title: `NFL story ${index}`,
    }),
  );

  const result = limitSportsInAllTopicsFeed(nflBurst, now);
  assert.equal(result.length, ALL_TOPICS_SPORTS_PER_TAG_LIMIT);
});

test('limitSportsInAllTopicsFeed keeps separate caps for different sport tags', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const nfl = [
    article('nfl-1', ['sports'], recent(25 * 60 * 1000), {
      source: 'ESPN',
      sportTags: ['football'],
      title: 'NFL trade news',
    }),
    article('nfl-2', ['sports'], recent(26 * 60 * 1000), {
      source: 'ESPN',
      sportTags: ['football'],
      title: 'NFL playoff race',
    }),
  ];
  const soccer = [
    article('soccer-1', ['sports'], recent(27 * 60 * 1000), {
      source: 'BBC Sport',
      sportTags: ['premier-league'],
      title: 'Premier League title race',
    }),
    article('soccer-2', ['sports'], recent(28 * 60 * 1000), {
      source: 'BBC Sport',
      sportTags: ['premier-league'],
      title: 'Premier League transfer',
    }),
  ];

  const result = limitSportsInAllTopicsFeed([...nfl, ...soccer], now);
  assert.equal(result.length, 2);
  assert.ok(result.some((a) => a.id.startsWith('nfl-')));
  assert.ok(result.some((a) => a.id.startsWith('soccer-')));
});

test('limitSportsInAllTopicsFeed enforces overall sports cap', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const tags = ['football', 'soccer', 'basketball', 'hockey', 'baseball'] as const;

  const articles = tags.flatMap((tag, tagIndex) =>
    Array.from({ length: 2 }, (_, index) =>
      article(`${tag}-${index}`, ['sports'], recent((tagIndex * 2 + index + 1) * 60 * 1000), {
        source: `Outlet ${tag}`,
        sportTags: [tag],
        title: `${tag} headline ${index}`,
      }),
    ),
  );

  const result = limitSportsInAllTopicsFeed(articles, now);
  assert.equal(result.length, ALL_TOPICS_SPORTS_TOTAL_LIMIT);
});

test('limitSportsInAllTopicsFeed preserves input order for kept rows', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const articles = [
    article('world', ['world'], recent(90_000), { source: 'The Guardian' }),
    article('nfl', ['sports'], recent(20 * 60 * 1000), {
      source: 'ESPN',
      sportTags: ['football'],
      title: 'NFL breaking news',
    }),
    article('tech', ['technology'], recent(80_000), { source: 'Wired' }),
  ];

  const result = limitSportsInAllTopicsFeed(articles, now);
  assert.deepEqual(result.map((a) => a.id), ['world', 'nfl', 'tech']);
});

test('limitSportsInAllTopicsFeed respects sports already on screen when paginating', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const prior = Array.from({ length: ALL_TOPICS_SPORTS_TOTAL_LIMIT }, (_, index) =>
    article(`prior-${index}`, ['sports'], recent((index + 1) * 60 * 1000), {
      source: `Outlet ${index}`,
      sportTags: ['football'],
      title: `Prior sports ${index}`,
    }),
  );
  const incoming = article('incoming', ['sports'], recent(20 * 60 * 1000), {
    source: 'ESPN',
    sportTags: ['football'],
    title: 'Incoming sports story',
  });

  const result = limitSportsInAllTopicsFeed([incoming, article('world', ['world'], recent(90_000))], now, {
    priorSports: prior,
  });

  assert.deepEqual(result.map((a) => a.id), ['world']);
});
