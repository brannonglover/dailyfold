import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { Article, UserPreferences } from '@/types';

import {
  articleAffinityScore,
  getArticleMatchReasons,
  getLikedInterestBadgeItems,
  getPersonalizedFeed,
  isMeaningfulInterestMatch,
  rankArticles,
} from './recommendations';
import { buildLikedInterestProfile } from './interestSignals';

function basePrefs(overrides: Partial<UserPreferences> = {}): UserPreferences {
  return {
    likedArticleIds: ['liked-1'],
    likedArticles: {},
    clickedArticleIds: [],
    clickedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    sourceScores: { 'Mens Health': 5 },
    keywordScores: { series: 3, season: 2 },
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

function article(
  id: string,
  title: string,
  options?: {
    source?: string;
    topics?: UserPreferences['topicScores'] extends Record<infer K, number> ? K[] : never;
    sportTags?: Article['sportTags'];
  },
): Article {
  return {
    id,
    title,
    excerpt: title,
    body: title,
    source: options?.source ?? 'Wire',
    imageUrl: 'https://example.com/1.jpg',
    topics: options?.topics ?? ['culture'],
    sportTags: options?.sportTags,
    readTimeMinutes: 3,
    publishedAt: new Date().toISOString(),
    url: `https://example.com/${id}`,
  };
}

function prefsWithLikedArticles(
  liked: Article[],
  overrides: Partial<UserPreferences> = {},
): UserPreferences {
  return basePrefs({
    likedArticleIds: liked.map((item) => item.id),
    likedArticles: Object.fromEntries(liked.map((item) => [item.id, item])),
    ...overrides,
  });
}

test('articleAffinityScore ignores legacy source scores', () => {
  const liked = article('liked-1', 'Best new series season preview');
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;
  const sameSource = article('a', 'Random headline', { source: 'Mens Health', topics: ['politics'] });
  const matchingKeywords = article('b', 'Best new series season preview');

  assert.equal(articleAffinityScore(sameSource, profile), 0);
  assert.ok(articleAffinityScore(matchingKeywords, profile) > 0);
});

test('articleAffinityScore matches interest keywords as substrings in headline text', () => {
  const liked = article('liked-1', 'NBA championships race preview', { topics: ['sports'] });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;
  const stemmedHeadline = article('a', 'NBA championships race heats up', { topics: ['sports'] });

  assert.ok(articleAffinityScore(stemmedHeadline, profile) > 0);
});

test('isMeaningfulInterestMatch rejects broad topic-only overlap from a single sports like', () => {
  const liked = article('liked-1', 'NBA playoffs preview', {
    topics: ['sports'],
    sportTags: ['basketball'],
  });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  assert.ok(isMeaningfulInterestMatch(article('match', 'NBA playoffs bracket update', {
    topics: ['sports'],
    sportTags: ['basketball'],
  }), profile));
  assert.equal(
    isMeaningfulInterestMatch(article('soccer', 'Premier League title race', {
      topics: ['sports'],
      sportTags: ['soccer'],
    }), profile),
    false,
  );
});

test('isMeaningfulInterestMatch rejects broad topic-only overlap from a single culture like', () => {
  const liked = article('liked-1', 'The Last of Us season 2 premiere review', { topics: ['culture'] });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  assert.ok(
    isMeaningfulInterestMatch(
      article('match', 'Fall premiere week highlights best new series', { topics: ['culture'] }),
      profile,
    ),
  );
  assert.equal(
    isMeaningfulInterestMatch(article('fashion', 'Spring fashion week trends', { topics: ['culture'] }), profile),
    false,
  );
  assert.equal(
    isMeaningfulInterestMatch(article('gaming', 'New video game release date', { topics: ['gaming'] }), profile),
    false,
  );
  assert.equal(
    isMeaningfulInterestMatch(article('politics', 'Election polling update', { topics: ['politics'] }), profile),
    false,
  );
});

test('isMeaningfulInterestMatch rejects generic keyword overlap from sports headlines', () => {
  const liked = article('liked-1', 'The Last of Us season 2 premiere review', { topics: ['culture'] });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  assert.equal(
    isMeaningfulInterestMatch(article('mlb', 'MLB season opener highlights', { topics: ['sports'] }), profile),
    false,
  );
  assert.equal(
    isMeaningfulInterestMatch(
      article('cfb', 'College football playoff bracket update', { topics: ['sports'], sportTags: ['football'] }),
      profile,
    ),
    false,
  );
});

test('isMeaningfulInterestMatch allows single-like topic expansion for narrow topics', () => {
  const liked = article('liked-1', 'Senate passes climate bill', { topics: ['politics'] });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  assert.ok(
    isMeaningfulInterestMatch(article('politics', 'House votes on budget deal', { topics: ['politics'] }), profile),
  );
  assert.equal(
    isMeaningfulInterestMatch(article('culture', 'HBO announces new fantasy series', { topics: ['culture'] }), profile),
    false,
  );
});

test('getPersonalizedFeed surfaces keyword matches from a single TV like', () => {
  const liked = article('liked-1', 'The Last of Us season 2 premiere review', { topics: ['culture'] });
  const prefs = prefsWithLikedArticles([liked]);

  const feed = getPersonalizedFeed(
    [
      liked,
      article('match-1', 'Fall premiere week highlights best new series', { topics: ['culture'] }),
      article('match-2', 'Another season premiere draws record ratings', { topics: ['culture'] }),
      article('unrelated-fashion', 'Spring fashion week trends', { topics: ['culture'] }),
      article('unrelated-sports', 'College football playoff bracket', {
        topics: ['sports'],
        sportTags: ['football'],
      }),
      article('unrelated-politics', 'Election polling update', { topics: ['politics'] }),
    ],
    prefs,
  );

  assert.equal(feed.length, 2);
  assert.ok(feed.every((item) => item.title.includes('premiere')));
  assert.ok(!feed.some((item) => item.id === 'liked-1'));
});

test('getPersonalizedFeed returns only interest-matching articles', () => {
  const liked = article('liked-1', 'Must-watch series season finale', { topics: ['culture'] });
  const prefs = prefsWithLikedArticles([liked]);

  const cultureMatches = Array.from({ length: 10 }, (_, index) =>
    article(`culture-${index}`, `Must-watch series season ${index}`, { topics: ['culture'] }),
  );

  const feed = getPersonalizedFeed(
    [
      ...cultureMatches,
      article('unrelated', 'Election results update', { topics: ['politics'] }),
      article('fashion', 'Spring fashion week trends', { topics: ['culture'] }),
    ],
    prefs,
  );

  assert.equal(feed.length, 10);
  assert.ok(feed.every((item) => item.title.includes('series')));
});

test('getPersonalizedFeed does not backfill unrelated articles when matches are sparse', () => {
  const liked = article('liked-1', 'Must-watch series season finale', { topics: ['culture'] });
  const prefs = prefsWithLikedArticles([liked]);

  const feed = getPersonalizedFeed(
    [
      article('match', 'Must-watch series season preview', { topics: ['culture'] }),
      article('filler-1', 'Election results update', { topics: ['politics'] }),
      article('filler-2', 'Markets close higher', { topics: ['business'] }),
    ],
    prefs,
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'match');
});

test('getPersonalizedFeed excludes already-liked articles', () => {
  const saved = article('saved-culture', 'Saved series season recap', { topics: ['culture'] });
  const prefs = prefsWithLikedArticles([
    article('liked-1', 'Placeholder like', { topics: ['culture'] }),
    saved,
  ], {
    likedArticleIds: ['liked-1', 'saved-culture'],
  });

  const feed = getPersonalizedFeed(
    [
      saved,
      article('new-match', 'New series season preview', { topics: ['culture'] }),
      article('unrelated', 'Election results update', { topics: ['politics'] }),
    ],
    prefs,
  );

  assert.ok(!feed.some((item) => item.id === 'saved-culture'));
  assert.equal(feed[0]?.id, 'new-match');
});

test('getPersonalizedFeed returns empty when liked snapshots are unavailable', () => {
  const prefs = basePrefs({
    likedArticleIds: ['missing-like'],
    likedArticles: {},
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    keywordScores: {},
    sportTagScores: {},
  });

  const feed = getPersonalizedFeed(
    [article('culture-1', 'Must-watch series season preview', { topics: ['culture'] })],
    prefs,
  );

  assert.deepEqual(feed, []);
});

test('getPersonalizedFeed surfaces matches from saved likes with empty persisted scores', () => {
  const liked = article('liked-1', 'Must-watch series season finale', { topics: ['culture'] });
  const prefs = prefsWithLikedArticles([liked], {
    topicScores: Object.fromEntries(CURIOSITY_ORDER.map((t) => [t, 0])) as UserPreferences['topicScores'],
    keywordScores: {},
    sportTagScores: {},
  });

  const feed = getPersonalizedFeed(
    [
      liked,
      article('match', 'Must-watch series season preview', { topics: ['culture'] }),
      article('unrelated', 'Election results update', { topics: ['politics'] }),
    ],
    prefs,
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'match');
});

test('getPersonalizedFeed handles mixed non-sports likes generically', () => {
  const likedScience = article('liked-science', 'Mars rover discovers water ice', { topics: ['science'] });
  const likedPolitics = article('liked-politics', 'Senate passes climate bill', { topics: ['politics'] });
  const prefs = prefsWithLikedArticles([likedScience, likedPolitics]);

  const feed = getPersonalizedFeed(
    [
      likedScience,
      likedPolitics,
      article('science-match', 'Mars sample analysis complete', { topics: ['science'] }),
      article('politics-match', 'House votes on budget deal', { topics: ['politics'] }),
      article('unrelated', 'New smartphone chip unveiled', { topics: ['technology'] }),
    ],
    prefs,
  );

  assert.equal(feed.length, 2);
  assert.ok(feed.some((item) => item.id === 'science-match'));
  assert.ok(feed.some((item) => item.id === 'politics-match'));
});

test('getPersonalizedFeed falls back to persisted scores when snapshots are missing', () => {
  const prefs = basePrefs({
    likedArticleIds: ['missing-like'],
    likedArticles: {},
    topicScores: { ...basePrefs().topicScores, culture: 1 },
    keywordScores: { series: 1, season: 1 },
  });

  const feed = getPersonalizedFeed(
    [
      article('match', 'Must-watch series season preview', { topics: ['culture'] }),
      article('unrelated', 'Election results update', { topics: ['politics'] }),
    ],
    prefs,
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'match');
});

test('rankArticles prefers keyword matches over shared source', () => {
  const liked = article('liked-1', 'Must-watch series season finale', { topics: ['culture'] });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  const ranked = rankArticles(
    [
      article('source-match', 'Unrelated politics roundup', { source: 'Mens Health', topics: ['politics'] }),
      article('keyword-match', 'Must-watch series season finale', { source: 'Other Outlet', topics: ['culture'] }),
    ],
    profile,
    new Set(['liked-1']),
  );

  assert.equal(ranked[0]?.id, 'keyword-match');
});

test('getLikedInterestBadgeItems surfaces tv and genre keywords for a culture TV like', () => {
  const liked = article('liked-tv', "Patricia's Widow Bay horror comedy TV series review", {
    topics: ['culture'],
  });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  const badges = getLikedInterestBadgeItems(profile);
  const keywordBadges = badges.filter((item) => item.kind === 'keyword');

  assert.deepEqual(
    keywordBadges.slice(0, 4).map((item) => item.key),
    ['tv', 'horror', 'comedy', 'series'],
  );
  assert.ok(!badges.some((item) => item.key === 'health'));
  assert.ok(!keywordBadges.some((item) => item.key.includes(' ')));
});

test('getPersonalizedFeed surfaces matches for a culture TV like with genre keywords', () => {
  const liked = article('liked-tv', "Patricia's Widow Bay horror comedy TV series review", {
    topics: ['culture'],
  });
  const prefs = prefsWithLikedArticles([liked]);

  const feed = getPersonalizedFeed(
    [
      liked,
      article('match-horror', 'Horror anthology series returns for season 2', { topics: ['culture'] }),
      article('match-comedy', 'New comedy series lands on streaming', { topics: ['culture'] }),
      article('match-tv', 'Television critics pick top shows this fall', { topics: ['culture'] }),
      article('unrelated', 'Spring fashion week trends', { topics: ['culture'] }),
    ],
    prefs,
  );

  assert.equal(feed.length, 3);
  assert.ok(feed.some((item) => item.id === 'match-horror'));
  assert.ok(feed.some((item) => item.id === 'match-comedy'));
  assert.ok(feed.some((item) => item.id === 'match-tv'));
});

test('getArticleMatchReasons returns up to two personal keyword reasons per article', () => {
  const liked = article('liked-tv', "Patricia's Widow Bay horror comedy TV series review", {
    topics: ['culture'],
  });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;
  const candidate = article('match', 'Horror comedy series lands on television', { topics: ['culture'] });

  const reasons = getArticleMatchReasons(candidate, profile);

  assert.deepEqual(reasons, ['Because you read about Tv', 'Because you read about Horror']);
});

test('getArticleMatchReasons omits generic topic-only overlap', () => {
  const liked = article('liked-culture', 'Essay on modern art movements', { topics: ['culture'] });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;
  const candidate = article('match', 'Gallery opens new exhibition', { topics: ['culture'] });

  const reasons = getArticleMatchReasons(candidate, profile);

  assert.deepEqual(reasons, []);
});

test('getArticleMatchReasons prefers source affinity from liked articles', () => {
  const liked = article('liked-nyt', 'Senate passes climate bill', {
    topics: ['politics'],
    source: 'The New York Times',
  });
  const prefs = prefsWithLikedArticles([liked]);
  const profile = buildLikedInterestProfile(prefs)!;
  const candidate = article('match', 'SpaceX expands Bastrop facility', {
    topics: ['politics', 'technology'],
    source: 'The New York Times',
  });

  const reasons = getArticleMatchReasons(candidate, {
    profile,
    sourceScores: { 'The New York Times': 1 },
  });

  assert.deepEqual(reasons, ['Because you like The New York Times']);
});

test('getArticleMatchReasons surfaces sport tag affinity with personal copy', () => {
  const liked = article('liked-1', 'NFL playoff preview: Chiefs advance', {
    topics: ['sports'],
    sportTags: ['football'],
  });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;
  const candidate = article('match', 'Chiefs clinch playoff spot', {
    topics: ['sports'],
    sportTags: ['football'],
  });

  const reasons = getArticleMatchReasons(candidate, profile);

  assert.deepEqual(reasons, ['Because you follow NFL stories']);
});

test('getArticleMatchReasons uses narrow-topic fallback after multiple likes', () => {
  const likedPolitics = [
    article('liked-1', 'Senate passes climate bill', { topics: ['politics'] }),
    article('liked-2', 'House votes on budget deal', { topics: ['politics'] }),
  ];
  const profile = buildLikedInterestProfile(prefsWithLikedArticles(likedPolitics))!;
  const candidate = article('match', 'Committee schedules hearing', { topics: ['politics'] });

  const reasons = getArticleMatchReasons(candidate, profile);

  assert.deepEqual(reasons, ['Similar to articles you liked']);
});

test('isMeaningfulInterestMatch matches television headlines for a tv keyword profile', () => {
  const liked = article('liked-tv', "Patricia's Widow Bay horror comedy TV series review", {
    topics: ['culture'],
  });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  assert.ok(
    isMeaningfulInterestMatch(
      article('tv-word', 'Television critics pick top shows this fall', { topics: ['culture'] }),
      profile,
    ),
  );
});

test('getLikedInterestBadgeItems lists topics, specific keywords, and sport tags from liked profile', () => {
  const liked = article('liked-1', 'NFL playoff preview: Chiefs advance', {
    topics: ['sports', 'culture'],
  });
  const profile = buildLikedInterestProfile(prefsWithLikedArticles([liked]))!;

  const badges = getLikedInterestBadgeItems(profile);

  assert.ok(badges.some((item) => item.kind === 'topic' && item.key === 'culture'));
  assert.ok(badges.some((item) => item.kind === 'topic' && item.key === 'sports'));
  assert.ok(badges.some((item) => item.kind === 'keyword' && item.key === 'chiefs'));
  assert.ok(badges.some((item) => item.kind === 'sport' && item.key === 'football'));
  assert.ok(!badges.some((item) => item.kind === 'keyword' && item.key === 'preview'));
});

test('getPersonalizedFeed works from feed clicks without likes', () => {
  const clicked = article('clicked-1', 'Must-watch series season finale', { topics: ['culture'] });
  const prefs = basePrefs({
    likedArticleIds: [],
    clickedArticleIds: ['clicked-1'],
    clickedArticles: { 'clicked-1': clicked },
  });
  const feed = [
    clicked,
    article('match', 'Best new series season preview', { topics: ['culture'] }),
    article('miss', 'Senate passes budget bill', { topics: ['politics'] }),
  ];

  const personalized = getPersonalizedFeed(feed, prefs);

  assert.ok(personalized.some((item) => item.id === 'match'));
  assert.ok(!personalized.some((item) => item.id === 'miss'));
  assert.ok(!personalized.some((item) => item.id === 'clicked-1'));
});
