import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { Article, UserPreferences } from '@/types';

import {
  applyArticleClickSignals,
  applyArticleLikeSignals,
  buildInterestProfile,
  buildLikedInterestProfile,
  CLICK_BOOST,
  reconcileInterestScores,
} from './interestSignals';

function basePrefs(): UserPreferences {
  return {
    likedArticleIds: [],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
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
  };
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'New series season preview',
    excerpt: 'A culture story about television',
    body: 'body',
    source: 'Mens Health',
    imageUrl: 'https://example.com/1.jpg',
    topics: ['culture'],
    readTimeMinutes: 3,
    publishedAt: new Date().toISOString(),
    url: 'https://example.com/a1',
    ...overrides,
  };
}

test('applyArticleLikeSignals boosts topics and keywords, not source', () => {
  const prefs = basePrefs();
  const signals = applyArticleLikeSignals(prefs, article(), false);

  assert.equal(signals.topicScores.culture, 1);
  assert.ok(Object.keys(signals.keywordScores).length > 0);
  assert.equal(Object.keys(signals.sportTagScores).length, 0);
  assert.equal('sourceScores' in signals, false);
});

test('applyArticleLikeSignals excludes publication-name topics from Mens Health', () => {
  const prefs = basePrefs();
  const signals = applyArticleLikeSignals(
    prefs,
    article({
      title: "Patricia's Widow Bay horror comedy TV series review",
      topics: ['culture', 'health'],
      source: "Men's Health",
    }),
    false,
  );

  assert.equal(signals.topicScores.culture, 1);
  assert.equal(signals.topicScores.health ?? 0, 0);
  assert.ok(signals.keywordScores.tv > 0);
  assert.equal(signals.keywordScores.health, undefined);
});

test('applyArticleLikeSignals records sport tags for sports articles', () => {
  const prefs = basePrefs();
  const signals = applyArticleLikeSignals(
    prefs,
    article({
      title: 'NFL playoff preview',
      excerpt: 'Football championship race heats up',
      topics: ['sports'],
      sportTags: ['football'],
    }),
    false,
  );

  assert.equal(signals.topicScores.sports, 1);
  assert.ok(signals.sportTagScores.football > 0);
});

test('buildLikedInterestProfile aggregates topics, keywords, and sport tags from saved likes', () => {
  const liked = article({
    id: 'liked-nba',
    title: 'NBA playoffs preview',
    excerpt: 'Championship race heats up',
    topics: ['sports'],
    sportTags: ['basketball'],
  });
  const prefs = {
    ...basePrefs(),
    likedArticleIds: ['liked-nba'],
    likedArticles: { 'liked-nba': liked },
  };

  const profile = buildLikedInterestProfile(prefs);

  assert.ok(profile);
  assert.equal(profile!.topicScores.sports, 1);
  assert.ok(profile!.keywordScores.nba > 0);
  assert.equal(profile!.sportTagScores.basketball, 1);
});

test('buildLikedInterestProfile falls back to persisted scores when snapshots are missing', () => {
  const prefs = {
    ...basePrefs(),
    likedArticleIds: ['missing-like'],
    likedArticles: {},
    topicScores: { ...basePrefs().topicScores, culture: 2 },
    keywordScores: { series: 1 },
  };

  const profile = buildLikedInterestProfile(prefs);

  assert.ok(profile);
  assert.equal(profile!.topicScores.culture, 2);
  assert.equal(profile!.keywordScores.series, 1);
});

test('buildLikedInterestProfile ignores stale persisted scores when snapshots exist', () => {
  const liked = article({
    id: 'liked-culture',
    title: 'Must-watch series season finale',
    topics: ['culture'],
  });
  const prefs = {
    ...basePrefs(),
    likedArticleIds: ['liked-culture', 'missing-like'],
    likedArticles: { 'liked-culture': liked },
    topicScores: { ...basePrefs().topicScores, politics: 1 },
    keywordScores: { senate: 1 },
  };

  const profile = buildLikedInterestProfile(prefs);

  assert.ok(profile);
  assert.equal(profile!.topicScores.culture, 1);
  assert.equal(profile!.topicScores.politics ?? 0, 0);
  assert.ok(profile!.keywordScores.series > 0);
  assert.equal(profile!.keywordScores.senate, undefined);
});

test('reconcileInterestScores rebuilds persisted scores from liked snapshots', () => {
  const liked = article({
    id: 'liked-science',
    title: 'Mars rover discovers water ice',
    topics: ['science'],
  });
  const prefs = {
    ...basePrefs(),
    likedArticleIds: ['liked-science'],
    likedArticles: { 'liked-science': liked },
  };

  const reconciled = reconcileInterestScores(prefs);

  assert.equal(reconciled.topicScores.science, 1);
  assert.ok(Object.keys(reconciled.keywordScores).length > 0);
});

test('applyArticleClickSignals uses a weaker boost than likes', () => {
  const prefs = basePrefs();
  const likeSignals = applyArticleLikeSignals(prefs, article(), false);
  const clickSignals = applyArticleClickSignals(prefs, article());

  assert.equal(clickSignals.topicScores.culture, CLICK_BOOST);
  assert.equal(likeSignals.topicScores.culture, 1);
});

test('buildInterestProfile combines likes and non-liked clicks', () => {
  const liked = article({
    id: 'liked-nba',
    title: 'NBA playoffs preview',
    topics: ['sports'],
    sportTags: ['basketball'],
  });
  const clicked = article({
    id: 'clicked-tv',
    title: 'Must-watch series season finale',
    topics: ['culture'],
  });
  const prefs = {
    ...basePrefs(),
    likedArticleIds: ['liked-nba'],
    likedArticles: { 'liked-nba': liked },
    clickedArticleIds: ['clicked-tv'],
    clickedArticles: { 'clicked-tv': clicked },
  };

  const profile = buildInterestProfile(prefs);

  assert.ok(profile);
  assert.equal(profile!.topicScores.sports, 1);
  assert.equal(profile!.topicScores.culture, CLICK_BOOST);
  assert.ok(profile!.keywordScores.series > 0);
});

test('buildInterestProfile ignores clicked articles that are also liked', () => {
  const liked = article({
    id: 'shared',
    title: 'Must-watch series season finale',
    topics: ['culture'],
  });
  const prefs = {
    ...basePrefs(),
    likedArticleIds: ['shared'],
    likedArticles: { shared: liked },
    clickedArticleIds: ['shared'],
    clickedArticles: { shared: liked },
  };

  const profile = buildInterestProfile(prefs);

  assert.ok(profile);
  assert.equal(profile!.topicScores.culture, 1);
});
