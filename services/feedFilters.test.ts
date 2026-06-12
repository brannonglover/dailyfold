import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { FALLBACK_SOURCES } from '@/data/sources';
import { applyFeedFilters, applyTrendingNotificationFilters } from '@/services/feedFilters';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { isSportsOnlySourceSelection } from '@/services/sourcePreferences';
import { Article, UserPreferences } from '@/types';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  };
}

const now = Date.now();
const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

function hotSportArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'sport',
    title: 'Premier League match report',
    excerpt: 'excerpt',
    body: 'body',
    source: 'BBC Sport',
    imageUrl: 'https://example.com/2.jpg',
    topics: ['sports'],
    sportTags: ['premier-league'],
    readTimeMinutes: 4,
    publishedAt: recent(20 * 60 * 1000),
    url: 'https://example.com/sport',
    ...overrides,
  };
}

const articles: Article[] = [
  {
    id: 'tech',
    title: 'Tech story',
    excerpt: 'excerpt',
    body: 'body',
    source: 'Wired',
    imageUrl: 'https://example.com/1.jpg',
    topics: ['technology'],
    readTimeMinutes: 5,
    publishedAt: recent(90 * 60 * 1000),
    url: 'https://example.com/tech',
  },
  hotSportArticle(),
  {
    id: 'world',
    title: 'World story',
    excerpt: 'excerpt',
    body: 'body',
    source: 'The Guardian',
    imageUrl: 'https://example.com/3.jpg',
    topics: ['world'],
    readTimeMinutes: 6,
    publishedAt: recent(120 * 60 * 1000),
    url: 'https://example.com/world',
  },
];

test('All topics (empty enabledTopics) returns every source/topic', () => {
  const prefs = basePrefs({ enabledTopics: [], enabledSportTags: ['premier-league'] });
  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((a) => a.id).sort(),
    ['sport', 'tech', 'world'],
  );
});

test('All topics still respects sports-only enabledSourceIds', () => {
  const sportsOnlyIds = FALLBACK_SOURCES.filter((s) => s.primaryTopic === 'sports').map((s) => s.id);
  assert.ok(sportsOnlyIds.length > 0, 'fixture needs sports sources');

  const prefs = basePrefs({
    enabledTopics: [],
    enabledSourceIds: sportsOnlyIds,
  });
  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id), ['sport']);
});

test('Sports-only enabledSourceIds still applies when a topic chip is selected', () => {
  const sportsOnlyIds = FALLBACK_SOURCES.filter((s) => s.primaryTopic === 'sports').map((s) => s.id);
  const prefs = basePrefs({
    enabledTopics: ['technology'],
    enabledSourceIds: sportsOnlyIds,
  });
  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.equal(result.length, 0);
});

test('Sports topic filter keeps only sports stories', () => {
  const prefs = basePrefs({ enabledTopics: ['sports'] });
  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id), ['sport']);
});

test('normalizeFeedPreferences clears sport tags when All topics selected', () => {
  const normalized = normalizeFeedPreferences(
    basePrefs({ enabledTopics: [], enabledSportTags: ['premier-league'] }),
  );
  assert.deepEqual(normalized.enabledTopics, []);
  assert.deepEqual(normalized.enabledSportTags, []);
});

test('normalizeFeedPreferences treats full topic list as All', () => {
  const normalized = normalizeFeedPreferences(
    basePrefs({ enabledTopics: [...CURIOSITY_ORDER], enabledSportTags: ['premier-league'] }),
  );
  assert.deepEqual(normalized.enabledTopics, []);
  assert.deepEqual(normalized.enabledSportTags, []);
});

test('World topic excludes sports-primary outlets', () => {
  const prefs = basePrefs({ enabledTopics: ['world'] });
  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id), ['world']);
});

test('All topics keeps enabled outlets regardless of article topic', () => {
  const sportsSources = FALLBACK_SOURCES.filter((s) => s.primaryTopic === 'sports');
  const enabledIds = sportsSources.slice(0, 2).map((s) => s.id);
  const prefs = basePrefs({ enabledTopics: [], enabledSourceIds: enabledIds });
  assert.ok(isSportsOnlySourceSelection(FALLBACK_SOURCES, enabledIds));

  const sportsOnlyArticles: Article[] = [
    {
      ...articles[1]!,
      id: 'sport-a',
      source: sportsSources[0]!.name,
    },
    {
      ...articles[0]!,
      id: 'tech-on-sports-outlet',
      source: sportsSources[0]!.name,
      topics: ['technology'],
    },
  ];

  const result = applyFeedFilters(sportsOnlyArticles, prefs, FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id).sort(), ['sport-a', 'tech-on-sports-outlet']);
});

test('All topics still respects disabled sources', () => {
  const wired = FALLBACK_SOURCES.find((s) => s.name === 'Wired');
  assert.ok(wired, 'fixture needs Wired source');

  const enabledIds = FALLBACK_SOURCES.map((s) => s.id).filter((id) => id !== wired!.id);
  const prefs = basePrefs({ enabledTopics: [], enabledSourceIds: enabledIds });

  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id).sort(), ['sport', 'world']);
  assert.ok(!result.some((a) => a.source === 'Wired'));
});

test('All topics with every source enabled returns mixed topics from fixture', () => {
  const result = applyFeedFilters(articles, basePrefs(), FALLBACK_SOURCES);
  const topics = new Set(result.flatMap((a) => a.topics));
  assert.ok(topics.has('technology'));
  assert.ok(topics.has('sports'));
  assert.ok(topics.has('world'));
});

test('applyTrendingNotificationFilters always respects disabled sources with all topics', () => {
  const wired = FALLBACK_SOURCES.find((s) => s.name === 'Wired');
  assert.ok(wired, 'fixture needs Wired source');

  const enabledIds = FALLBACK_SOURCES.map((s) => s.id).filter((id) => id !== wired!.id);
  const prefs = basePrefs({ enabledTopics: [], enabledSourceIds: enabledIds });

  const result = applyTrendingNotificationFilters(articles, prefs, FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id).sort(), ['sport', 'world']);
  assert.ok(!result.some((a) => a.source === 'Wired'));
});

test('applyFeedFilters removes articles with blocked topics even when all topics are on', () => {
  const prefs = basePrefs({ enabledTopics: [], blockedTopics: ['technology'] });
  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.ok(!result.some((a) => a.id === 'tech'));
});

test('All topics drops stale sports but keeps hot trending sports', () => {
  const staleSport = hotSportArticle({
    id: 'stale-sport',
    publishedAt: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
  });
  const result = applyFeedFilters([...articles, staleSport], basePrefs(), FALLBACK_SOURCES);
  assert.ok(result.some((a) => a.id === 'sport'));
  assert.ok(!result.some((a) => a.id === 'stale-sport'));
});

test('All topics limits a flood of hot NFL and soccer stories', () => {
  const nflFlood = Array.from({ length: 6 }, (_, index) =>
    hotSportArticle({
      id: `nfl-${index}`,
      source: 'ESPN',
      sportTags: ['football'],
      title: `NFL headline ${index}`,
      publishedAt: recent((index + 1) * 60 * 1000),
    }),
  );
  const soccerFlood = Array.from({ length: 6 }, (_, index) =>
    hotSportArticle({
      id: `soccer-${index}`,
      source: 'BBC Sport',
      sportTags: ['premier-league'],
      title: `Premier League headline ${index}`,
      publishedAt: recent((index + 10) * 60 * 1000),
    }),
  );

  const result = applyFeedFilters(
    [...articles.filter((a) => a.id !== 'sport'), ...nflFlood, ...soccerFlood],
    basePrefs(),
    FALLBACK_SOURCES,
  );
  const sportsKept = result.filter((a) => a.topics.includes('sports'));
  assert.ok(sportsKept.length <= 4);
  assert.ok(result.some((a) => a.id === 'tech'));
  assert.ok(result.some((a) => a.id === 'world'));
});

test('Sports topic filter still returns every matching sports story', () => {
  const nflFlood = Array.from({ length: 6 }, (_, index) =>
    hotSportArticle({
      id: `nfl-${index}`,
      source: 'ESPN',
      sportTags: ['football'],
      title: `NFL headline ${index}`,
      publishedAt: recent((index + 1) * 60 * 1000),
    }),
  );

  const result = applyFeedFilters(nflFlood, basePrefs({ enabledTopics: ['sports'] }), FALLBACK_SOURCES);
  assert.equal(result.length, 6);
});

test('applyFeedFilters removes Guardian live blog without hero even after silent refresh shape', () => {
  const imagelessLive: Article = {
    id: 'guardian-live',
    title: 'Middle East crisis live: Trump teases another Iran attack',
    excerpt: 'excerpt',
    body: 'body',
    source: 'The Guardian',
    imageUrl: '',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: recent(10 * 60 * 1000),
    url: 'https://www.theguardian.com/world/live/2026/jun/10/example-live',
  };
  const withImage: Article = {
    ...articles[0]!,
    id: 'wired-hero',
  };

  const result = applyFeedFilters([imagelessLive, withImage], basePrefs(), FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id), ['wired-hero']);
});

test('applyFeedFilters swaps imageless Guardian for sibling story with hero image', () => {
  const imagelessLive: Article = {
    id: 'guardian-live',
    title: 'Floods Hit Region – live',
    excerpt: 'excerpt',
    body: 'body',
    source: 'The Guardian',
    imageUrl: '',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: recent(10 * 60 * 1000),
    url: 'https://www.theguardian.com/world/live/2026/jun/10/floods-live',
  };
  const bbc: Article = {
    id: 'bbc-floods',
    title: 'Floods Hit Region',
    excerpt: 'excerpt',
    body: 'body',
    source: 'BBC News',
    imageUrl: 'https://cdn.bbc.co.uk/floods.jpg',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: recent(20 * 60 * 1000),
    url: 'https://www.bbc.co.uk/news/floods',
  };

  const result = applyFeedFilters([imagelessLive, bbc], basePrefs(), FALLBACK_SOURCES);
  assert.deepEqual(result.map((a) => a.id), ['bbc-floods']);
});

test('applyFeedFilters removes articles without a real hero image', () => {
  const withImage = articles[0]!;
  const imageless: Article = { ...articles[1]!, id: 'no-hero', imageUrl: '' };
  const legacyPlaceholder: Article = {
    ...articles[2]!,
    id: 'legacy-placeholder',
    imageUrl: 'https://images.unsplash.com/photo-1504711434966-e33886168f5c?w=800&q=80',
  };

  const result = applyFeedFilters(
    [withImage, imageless, legacyPlaceholder],
    basePrefs(),
    FALLBACK_SOURCES,
  );
  assert.deepEqual(result.map((a) => a.id), ['tech']);
});
