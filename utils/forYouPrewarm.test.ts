import assert from 'node:assert/strict';
import test from 'node:test';

import { Article, UserPreferences } from '@/types';
import {
  buildForYouCacheKeys,
  prewarmForYouDisplayCache,
} from '@/utils/forYouPrewarm';
import { readTabDisplayCache } from '@/utils/tabDisplayCache';

const article = (id: string): Article => ({
  id,
  title: `Title ${id}`,
  excerpt: 'Excerpt',
  body: 'Body',
  source: 'Source',
  imageUrl: 'https://example.com/image.jpg',
  publishedAt: '2026-01-01T00:00:00.000Z',
  topics: ['world'],
  url: `https://example.com/${id}`,
  readTimeMinutes: 3,
});

const prefs = (overrides: Partial<UserPreferences> = {}): UserPreferences => ({
  likedArticleIds: ['liked-1'],
  clickedArticleIds: [],
  likedArticles: {
    'liked-1': article('liked-1'),
  },
  clickedArticles: {},
  enabledTopics: ['world'],
  forYouTopics: ['technology'],
  forYouKeywords: [],
  forYouSportTags: [],
  enabledSportTags: [],
  enabledSourceIds: [],
  topicScores: { world: 2 } as UserPreferences['topicScores'],
  sourceScores: {},
  keywordScores: {},
  sportTagScores: {},
  blockedTopics: [],
  blockedSportTags: [],
  blockedKeywords: [],
  folders: [],
  trendingNotificationsEnabled: false,
  ...overrides,
});

test('buildForYouCacheKeys sorts selected topics for stable cache keys', () => {
  const keys = buildForYouCacheKeys(
    prefs({
      forYouTopics: ['technology', 'culture', 'science'],
    }),
  );

  assert.equal(
    keys.personalizationKey,
    '{"forYouTopics":["culture","science","technology"],"forYouKeywords":[],"forYouSportTags":[]}',
  );
});

test('prewarmForYouDisplayCache writes ranked for-you display cache', () => {
  const articles: Article[] = [
    { ...article('a1'), topics: ['technology'] },
    { ...article('a2'), topics: ['technology'] },
  ];
  const preferences = prefs();

  const wrote = prewarmForYouDisplayCache(
    articles,
    preferences,
    1,
    (items) => items,
  );

  assert.equal(wrote, true);
  const cached = readTabDisplayCache('for-you');
  assert.ok(cached);
  assert.equal(cached?.displayReady, true);
  assert.ok((cached?.displayArticles.length ?? 0) > 0);
});
