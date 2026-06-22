import assert from 'node:assert/strict';
import test from 'node:test';

import { FALLBACK_SOURCES } from '@/data/sources';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { Article, UserPreferences } from '@/types';

import { MIN_FEED_STORIES_BEFORE_SCROLL_PAGINATION } from './feedLoadMoreGate';
import { countFilteredFeedArticles, isFilteredFeedStocked } from './feedVisibleStock';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return normalizeFeedPreferences({
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: {},
    sourceScores: {},
    keywordScores: {},
    sportTagScores: {},
    enabledSourceIds: [],
    enabledTopics: [],
    forYouTopics: [],
    forYouKeywords: [],
    forYouSportTags: [],
    enabledSportTags: [],
    trendingNotificationsEnabled: false,
    blockedTopics: [],
    blockedSportTags: [],
    blockedKeywords: [],
    folders: [],
    ...overrides,
  });
}

function article(id: string, imageUrl = 'https://example.com/hero.jpg'): Article {
  return {
    id,
    title: `Story ${id}`,
    excerpt: '',
    body: '',
    source: 'BBC Sport',
    publishedAt: `2026-01-${String((Number(id.replace(/\D/g, '')) % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
    url: `https://example.com/${id}`,
    imageUrl,
    readTimeMinutes: 1,
    topics: ['sports'],
    sportTags: [],
  };
}

test('countFilteredFeedArticles drops rows without a real hero image', () => {
  const articles = [
    ...Array.from({ length: 16 }, (_, index) => article(`with-${index}`)),
    ...Array.from({ length: 4 }, (_, index) => article(`without-${index}`, '')),
  ];

  assert.equal(countFilteredFeedArticles(articles, basePrefs(), FALLBACK_SOURCES), 16);
});

test('isFilteredFeedStocked stays false until enough visible rows exist', () => {
  const articles = [
    ...Array.from({ length: 16 }, (_, index) => article(`with-${index}`)),
    ...Array.from({ length: 8 }, (_, index) => article(`without-${index}`, '')),
  ];

  assert.equal(isFilteredFeedStocked(articles, basePrefs(), FALLBACK_SOURCES), false);

  const stocked = [
    ...articles,
    ...Array.from({ length: 4 }, (_, index) => article(`extra-${index}`)),
  ];
  assert.equal(isFilteredFeedStocked(stocked, basePrefs(), FALLBACK_SOURCES), true);
});
