import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import {
  countArticleEngagements,
  countSportsArticleEngagements,
  filterArticlesByReadingLearnings,
  learnedFilteredSportTags,
  learnedFilteredTopics,
  learnedSportTagInterests,
  learnedTopicInterests,
  MIN_SPORTS_ENGAGEMENTS,
  MIN_TOTAL_ENGAGEMENTS,
} from '@/services/readingLearnings';
import { Article, UserPreferences } from '@/types';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
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
  };
}

function makeArticle(overrides: Partial<Article>): Article {
  return {
    id: overrides.id ?? 'article-1',
    title: overrides.title ?? 'Test Article',
    excerpt: overrides.excerpt ?? 'Test excerpt',
    body: '',
    source: overrides.source ?? 'Test Source',
    imageUrl: 'https://example.com/image.jpg',
    topics: overrides.topics ?? ['technology'],
    sportTags: overrides.sportTags,
    readTimeMinutes: 3,
    publishedAt: '2026-08-01T12:00:00Z',
    url: 'https://example.com/article',
    ...overrides,
  };
}

function clickedArticlesMap(articles: Article[]): Record<string, Article> {
  const map: Record<string, Article> = {};
  for (const article of articles) map[article.id] = article;
  return map;
}

function generateClickedArticles(
  count: number,
  topicOverride?: string[],
): { ids: string[]; cache: Record<string, Article> } {
  const ids: string[] = [];
  const cache: Record<string, Article> = {};
  for (let i = 0; i < count; i++) {
    const id = `clicked-${i}`;
    ids.push(id);
    cache[id] = makeArticle({
      id,
      topics: (topicOverride as Article['topics']) ?? ['technology'],
    });
  }
  return { ids, cache };
}

// --- countArticleEngagements ---

test('countArticleEngagements counts distinct liked and clicked articles', () => {
  const prefs = basePrefs({
    likedArticles: clickedArticlesMap([
      makeArticle({ id: 'a' }),
      makeArticle({ id: 'b' }),
    ]),
    clickedArticles: clickedArticlesMap([
      makeArticle({ id: 'b' }),
      makeArticle({ id: 'c' }),
    ]),
  });
  assert.equal(countArticleEngagements(prefs), 3);
});

test('countArticleEngagements returns 0 for empty preferences', () => {
  assert.equal(countArticleEngagements(basePrefs()), 0);
});

// --- countSportsArticleEngagements ---

test('countSportsArticleEngagements only counts sports articles', () => {
  const prefs = basePrefs({
    clickedArticles: clickedArticlesMap([
      makeArticle({ id: 'tech-1', topics: ['technology'] }),
      makeArticle({ id: 'sports-1', topics: ['sports'] }),
      makeArticle({ id: 'sports-2', topics: ['sports'] }),
    ]),
  });
  assert.equal(countSportsArticleEngagements(prefs), 2);
});

// --- learnedTopicInterests ---

test('learnedTopicInterests returns null below threshold', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS - 1);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3 },
  });
  assert.equal(learnedTopicInterests(prefs), null);
});

test('learnedTopicInterests returns interested topics at threshold', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3, science: 1 },
  });
  const interests = learnedTopicInterests(prefs);
  assert.notEqual(interests, null);
  assert.ok(interests!.has('technology'));
  assert.ok(interests!.has('science'));
  assert.ok(!interests!.has('sports'));
});

test('learnedTopicInterests returns null when no positive scores despite threshold', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
  });
  assert.equal(learnedTopicInterests(prefs), null);
});

// --- learnedSportTagInterests ---

test('learnedSportTagInterests returns null below sports threshold', () => {
  const sportsArticles = Array.from({ length: MIN_SPORTS_ENGAGEMENTS - 1 }, (_, i) =>
    makeArticle({ id: `sport-${i}`, topics: ['sports'], sportTags: ['football'] }),
  );
  const prefs = basePrefs({
    clickedArticles: clickedArticlesMap(sportsArticles),
    sportTagScores: { football: 2 },
  });
  assert.equal(learnedSportTagInterests(prefs), null);
});

test('learnedSportTagInterests returns interested tags at threshold', () => {
  const sportsArticles = Array.from({ length: MIN_SPORTS_ENGAGEMENTS }, (_, i) =>
    makeArticle({ id: `sport-${i}`, topics: ['sports'], sportTags: ['football'] }),
  );
  const prefs = basePrefs({
    clickedArticles: clickedArticlesMap(sportsArticles),
    sportTagScores: { football: 2, basketball: 1 },
  });
  const interests = learnedSportTagInterests(prefs);
  assert.notEqual(interests, null);
  assert.ok(interests!.has('football'));
  assert.ok(interests!.has('basketball'));
  assert.ok(!interests!.has('baseball'));
});

// --- filterArticlesByReadingLearnings ---

const techArticle = makeArticle({ id: 'tech', topics: ['technology'] });
const scienceArticle = makeArticle({ id: 'sci', topics: ['science'] });
const politicsArticle = makeArticle({ id: 'pol', topics: ['politics'] });
const sportsGeneral = makeArticle({ id: 'sports-gen', topics: ['sports'] });
const nflArticle = makeArticle({
  id: 'nfl',
  title: 'NFL draft picks reshape the AFC',
  topics: ['sports'],
  sportTags: ['football'],
});
const nbaArticle = makeArticle({
  id: 'nba',
  title: 'NBA playoff race heats up',
  topics: ['sports'],
  sportTags: ['basketball'],
});
const mlbArticle = makeArticle({
  id: 'mlb',
  title: 'MLB standings shake up',
  topics: ['sports'],
  sportTags: ['baseball'],
});

test('no filtering when below total engagement threshold', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS - 1);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3 },
  });
  const articles = [techArticle, politicsArticle, sportsGeneral];
  const result = filterArticlesByReadingLearnings(articles, prefs);
  assert.equal(result.length, 3);
});

test('filters out topics with zero engagement after threshold', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3 },
  });
  const articles = [techArticle, politicsArticle, scienceArticle];
  const result = filterArticlesByReadingLearnings(articles, prefs);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.id, 'tech');
});

test('keeps articles when at least one topic has positive score', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const multiTopicArticle = makeArticle({ id: 'multi', topics: ['technology', 'politics'] });
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3 },
  });
  const result = filterArticlesByReadingLearnings([multiTopicArticle], prefs);
  assert.equal(result.length, 1);
});

test('filters out unengaged sport tags after sports threshold', () => {
  const sportsClicked = Array.from({ length: MIN_SPORTS_ENGAGEMENTS }, (_, i) =>
    makeArticle({ id: `sc-${i}`, topics: ['sports'], sportTags: ['football'] }),
  );
  const { ids: generalIds, cache: generalCache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: [...generalIds, ...sportsClicked.map((a) => a.id)],
    clickedArticles: { ...generalCache, ...clickedArticlesMap(sportsClicked) },
    topicScores: { ...basePrefs().topicScores, technology: 3, sports: 2 },
    sportTagScores: { football: 2 },
  });
  const articles = [techArticle, nflArticle, nbaArticle, mlbArticle];
  const result = filterArticlesByReadingLearnings(articles, prefs);
  assert.equal(result.length, 2);
  assert.ok(result.some((a) => a.id === 'tech'));
  assert.ok(result.some((a) => a.id === 'nfl'));
});

test('sports articles without specific tags pass sport-tag filter', () => {
  const sportsClicked = Array.from({ length: MIN_SPORTS_ENGAGEMENTS }, (_, i) =>
    makeArticle({ id: `sc-${i}`, topics: ['sports'], sportTags: ['football'] }),
  );
  const { ids: generalIds, cache: generalCache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: [...generalIds, ...sportsClicked.map((a) => a.id)],
    clickedArticles: { ...generalCache, ...clickedArticlesMap(sportsClicked) },
    topicScores: { ...basePrefs().topicScores, technology: 3, sports: 2 },
    sportTagScores: { football: 2 },
  });
  const result = filterArticlesByReadingLearnings([sportsGeneral], prefs);
  assert.equal(result.length, 1);
});

test('exemptTopics option overrides topic filter', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3 },
  });
  const articles = [techArticle, politicsArticle];
  const result = filterArticlesByReadingLearnings(articles, prefs, {
    exemptTopics: ['politics'],
  });
  assert.equal(result.length, 2);
});

test('exemptSportTags option overrides sport-tag filter', () => {
  const sportsClicked = Array.from({ length: MIN_SPORTS_ENGAGEMENTS }, (_, i) =>
    makeArticle({ id: `sc-${i}`, topics: ['sports'], sportTags: ['football'] }),
  );
  const { ids: generalIds, cache: generalCache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: [...generalIds, ...sportsClicked.map((a) => a.id)],
    clickedArticles: { ...generalCache, ...clickedArticlesMap(sportsClicked) },
    topicScores: { ...basePrefs().topicScores, technology: 3, sports: 2 },
    sportTagScores: { football: 2 },
  });
  const result = filterArticlesByReadingLearnings([nbaArticle], prefs, {
    exemptSportTags: ['basketball'],
  });
  assert.equal(result.length, 1);
});

test('readingLearningsExemptTopics in prefs exempts topics', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3 },
    readingLearningsExemptTopics: ['politics'],
  });
  const articles = [techArticle, politicsArticle, scienceArticle];
  const result = filterArticlesByReadingLearnings(articles, prefs);
  assert.equal(result.length, 2);
  assert.ok(result.some((a) => a.id === 'tech'));
  assert.ok(result.some((a) => a.id === 'pol'));
});

test('readingLearningsExemptSportTags in prefs exempts sport tags', () => {
  const sportsClicked = Array.from({ length: MIN_SPORTS_ENGAGEMENTS }, (_, i) =>
    makeArticle({ id: `sc-${i}`, topics: ['sports'], sportTags: ['football'] }),
  );
  const { ids: generalIds, cache: generalCache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: [...generalIds, ...sportsClicked.map((a) => a.id)],
    clickedArticles: { ...generalCache, ...clickedArticlesMap(sportsClicked) },
    topicScores: { ...basePrefs().topicScores, technology: 3, sports: 2 },
    sportTagScores: { football: 2 },
    readingLearningsExemptSportTags: ['basketball'],
  });
  const result = filterArticlesByReadingLearnings([nbaArticle], prefs);
  assert.equal(result.length, 1);
});

// --- learnedFilteredTopics ---

test('learnedFilteredTopics returns empty when below threshold', () => {
  assert.deepEqual(learnedFilteredTopics(basePrefs()), []);
});

test('learnedFilteredTopics lists unengaged topics', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3, science: 1 },
  });
  const filtered = learnedFilteredTopics(prefs);
  assert.ok(!filtered.includes('technology'));
  assert.ok(!filtered.includes('science'));
  assert.ok(filtered.includes('sports'));
  assert.ok(filtered.includes('politics'));
});

test('learnedFilteredTopics excludes exempt topics', () => {
  const { ids, cache } = generateClickedArticles(MIN_TOTAL_ENGAGEMENTS);
  const prefs = basePrefs({
    clickedArticleIds: ids,
    clickedArticles: cache,
    topicScores: { ...basePrefs().topicScores, technology: 3 },
    readingLearningsExemptTopics: ['politics'],
  });
  const filtered = learnedFilteredTopics(prefs);
  assert.ok(!filtered.includes('politics'));
  assert.ok(filtered.includes('sports'));
});

// --- learnedFilteredSportTags ---

test('learnedFilteredSportTags returns empty when below sports threshold', () => {
  assert.deepEqual(learnedFilteredSportTags(basePrefs()), []);
});

test('learnedFilteredSportTags lists unengaged sport tags', () => {
  const sportsClicked = Array.from({ length: MIN_SPORTS_ENGAGEMENTS }, (_, i) =>
    makeArticle({ id: `sc-${i}`, topics: ['sports'], sportTags: ['football'] }),
  );
  const prefs = basePrefs({
    clickedArticles: clickedArticlesMap(sportsClicked),
    sportTagScores: { football: 2 },
  });
  const filtered = learnedFilteredSportTags(prefs);
  assert.ok(!filtered.includes('football'));
  assert.ok(filtered.length > 0);
  assert.ok(filtered.includes('basketball'));
});
