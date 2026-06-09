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
    publishedAt: '2026-06-01T12:00:00Z',
    url: 'https://example.com/tech',
  },
  {
    id: 'sport',
    title: 'Match report',
    excerpt: 'excerpt',
    body: 'body',
    source: 'BBC Sport',
    imageUrl: 'https://example.com/2.jpg',
    topics: ['sports'],
    sportTags: ['premier-league'],
    readTimeMinutes: 4,
    publishedAt: '2026-06-01T11:00:00Z',
    url: 'https://example.com/sport',
  },
  {
    id: 'world',
    title: 'World story',
    excerpt: 'excerpt',
    body: 'body',
    source: 'The Guardian',
    imageUrl: 'https://example.com/3.jpg',
    topics: ['world'],
    readTimeMinutes: 6,
    publishedAt: '2026-06-01T10:00:00Z',
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

test('All topics bypasses sports-only enabledSourceIds', () => {
  const sportsOnlyIds = FALLBACK_SOURCES.filter((s) => s.primaryTopic === 'sports').map((s) => s.id);
  assert.ok(sportsOnlyIds.length > 0, 'fixture needs sports sources');

  const prefs = basePrefs({
    enabledTopics: [],
    enabledSourceIds: sportsOnlyIds,
  });
  const result = applyFeedFilters(articles, prefs, FALLBACK_SOURCES);
  assert.equal(result.length, 3);
  assert.deepEqual(
    result.map((a) => a.id).sort(),
    ['sport', 'tech', 'world'],
  );
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

test('All topics returns pre-fetched articles unchanged (no source filter pass)', () => {
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
