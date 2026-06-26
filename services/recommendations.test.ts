import assert from 'node:assert/strict';
import test from 'node:test';

import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { Article, UserPreferences } from '@/types';

import {
  articleAffinityScore,
  buildLatestPersonalizationKey,
  compareLatestFeedArticles,
  getArticleMatchReasons,
  getLatestFeed,
  getLikedInterestBadgeItems,
  getPersonalizedFeed,
  getSingleInterestForYouFeed,
  isMeaningfulInterestMatch,
  rankArticles,
} from './recommendations';
import { buildInterestProfile, buildLikedInterestProfile } from './interestSignals';

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

function article(
  id: string,
  title: string,
  options?: {
    source?: string;
    topics?: UserPreferences['topicScores'] extends Record<infer K, number> ? K[] : never;
    sportTags?: Article['sportTags'];
    publishedAt?: string;
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
    publishedAt: options?.publishedAt ?? new Date().toISOString(),
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

test('getPersonalizedFeed returns empty when no topics are selected', () => {
  const feed = getPersonalizedFeed(
    [article('culture-1', 'Gallery opens', { topics: ['culture'] })],
    basePrefs({ forYouTopics: [] }),
  );

  assert.deepEqual(feed, []);
});

test('getPersonalizedFeed returns articles matching selected topics', () => {
  const feed = getPersonalizedFeed(
    [
      article('culture-1', 'Gallery opens', { topics: ['culture'] }),
      article('tech-1', 'Chip launch', { topics: ['technology'] }),
      article('politics-1', 'Election update', { topics: ['politics'] }),
    ],
    basePrefs({ forYouTopics: ['culture', 'technology'] }),
  );

  assert.equal(feed.length, 2);
  assert.ok(feed.some((item) => item.id === 'culture-1'));
  assert.ok(feed.some((item) => item.id === 'tech-1'));
  assert.ok(!feed.some((item) => item.id === 'politics-1'));
});

test('getPersonalizedFeed keeps liked articles when they match selected topics', () => {
  const saved = article('saved-culture', 'Saved exhibition review', { topics: ['culture'] });

  const feed = getPersonalizedFeed(
    [saved, article('tech-1', 'Chip launch', { topics: ['technology'] })],
    basePrefs({ forYouTopics: ['culture'] }),
  );

  assert.deepEqual(feed.map((item) => item.id), ['saved-culture']);
});

test('getPersonalizedFeed returns articles matching custom keyword interests', () => {
  const feed = getPersonalizedFeed(
    [
      article('bike-1', 'Best trail bikes for 2026', {
        topics: ['sports'],
        sportTags: ['mtb'],
      }),
      article('tech-1', 'Chip launch', { topics: ['technology'] }),
    ],
    basePrefs({ forYouTopics: [], forYouKeywords: ['bikes'], forYouSportTags: [] }),
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'bike-1');
});

test('getPersonalizedFeed matches bikes keyword to cycling stories without bike in headline', () => {
  const feed = getPersonalizedFeed(
    [
      article('tdf-1', 'Tour de France stage recap', {
        topics: ['sports'],
        sportTags: ['cycling'],
        excerpt: 'Peloton battles through the Alps',
      }),
      article('ball-1', 'NBA playoffs preview', {
        topics: ['sports'],
        sportTags: ['basketball'],
      }),
    ],
    basePrefs({ forYouTopics: [], forYouKeywords: ['bikes'], forYouSportTags: [] }),
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'tdf-1');
});

test('getSingleInterestForYouFeed excludes gaming and non-cycling publisher articles for bikes', () => {
  const kotakuGame = article('kotaku-control', 'Control Resonant Hands-On preview', {
    topics: ['gaming', 'culture'],
    source: 'Kotaku',
  });
  kotakuGame.excerpt = 'Early impressions of the new action game';
  kotakuGame.body =
    'Developers are recycling assets while the team develops new combat mechanics.';

  const tentReview = article('road-tent', 'TentBox Lite', {
    topics: ['sports'],
    source: 'road.cc',
    sportTags: ['cycling'],
  });
  tentReview.excerpt = 'A lightweight rooftop tent for car camping adventures';

  const bikeReview = article('road-bike', 'Canyon Grail review', {
    topics: ['sports'],
    source: 'road.cc',
    sportTags: ['cycling'],
  });
  bikeReview.excerpt = 'We test the latest gravel bike on mixed terrain';

  const feed = getSingleInterestForYouFeed(
    [kotakuGame, tentReview, bikeReview],
    'keyword',
    'bikes',
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'road-bike');
});

test('getSingleInterestForYouFeed separates cycling and mtb sport tag feeds', () => {
  const roadStage = article('road-stage', 'Tour de France stage recap', {
    topics: ['sports'],
    sportTags: ['cycling'],
  });
  roadStage.excerpt = 'Peloton battles through the Alps';

  const trailReview = article('trail-review', 'Best trail bikes for 2026', {
    topics: ['sports'],
    sportTags: ['mtb'],
  });
  trailReview.excerpt = 'Our favorite mountain bikes tested on singletrack';

  const cyclingFeed = getSingleInterestForYouFeed(
    [roadStage, trailReview],
    'sportTag',
    'cycling',
  );
  const mtbFeed = getSingleInterestForYouFeed([roadStage, trailReview], 'sportTag', 'mtb');

  assert.deepEqual(cyclingFeed.map((item) => item.id), ['road-stage']);
  assert.deepEqual(mtbFeed.map((item) => item.id), ['trail-review']);
});

test('getSingleInterestForYouFeed separates cycling and mtb keyword feeds', () => {
  const roadStage = article('road-stage', 'Tour de France stage recap', {
    topics: ['sports'],
    sportTags: ['cycling'],
  });
  roadStage.excerpt = 'Peloton battles through the Alps';

  const trailReview = article('trail-review', 'Best trail bikes for 2026', {
    topics: ['sports'],
    sportTags: ['mtb'],
  });
  trailReview.excerpt = 'Our favorite mountain bikes tested on singletrack';

  const cyclingFeed = getSingleInterestForYouFeed([roadStage, trailReview], 'keyword', 'cycling');
  const mtbFeed = getSingleInterestForYouFeed([roadStage, trailReview], 'keyword', 'mtb');

  assert.deepEqual(cyclingFeed.map((item) => item.id), ['road-stage']);
  assert.deepEqual(mtbFeed.map((item) => item.id), ['trail-review']);
});

test('getPersonalizedFeed returns articles matching sport tag interests', () => {
  const feed = getPersonalizedFeed(
    [
      article('bike-1', 'Tour de France stage recap', {
        topics: ['sports'],
        sportTags: ['cycling'],
      }),
      article('ball-1', 'NBA playoffs preview', {
        topics: ['sports'],
        sportTags: ['basketball'],
      }),
    ],
    basePrefs({ forYouTopics: [], forYouKeywords: [], forYouSportTags: ['cycling'] }),
  );

  assert.equal(feed.length, 1);
  assert.equal(feed[0]?.id, 'bike-1');
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

test('getPersonalizedFeed includes every culture story when culture is selected', () => {
  const feed = getPersonalizedFeed(
    [
      article('match-horror', 'Horror anthology series returns', { topics: ['culture'] }),
      article('match-comedy', 'New comedy series lands on streaming', { topics: ['culture'] }),
      article('unrelated', 'Election results update', { topics: ['politics'] }),
    ],
    basePrefs({ forYouTopics: ['culture'] }),
  );

  assert.equal(feed.length, 2);
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

test('getPersonalizedFeed orders multiple selected topics with light spreading', () => {
  const feed = getPersonalizedFeed(
    [
      article('culture-1', 'Gallery opens', { topics: ['culture'] }),
      article('tech-1', 'Chip launch', { topics: ['technology'] }),
    ],
    basePrefs({ forYouTopics: ['culture', 'technology'] }),
  );

  assert.equal(feed.length, 2);
});

test('compareLatestFeedArticles demotes unrelated stories when affinity matches within trending window', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const liked = article('liked-1', 'Must-watch series season finale review', { topics: ['culture'] });
  const profile = buildInterestProfile(prefsWithLikedArticles([liked]))!;
  const affinityMatch = article('culture-match', 'Must-watch series season finale recap', {
    topics: ['culture'],
    source: 'BBC News',
    publishedAt: recent(2 * 60 * 60 * 1000),
  });
  const unrelated = article('world', 'Diplomatic summit opens in Geneva', {
    topics: ['world'],
    source: 'BBC News',
    publishedAt: recent(90 * 60 * 1000),
  });

  assert.ok(
    compareLatestFeedArticles(affinityMatch, unrelated, profile, now) < 0,
    'expected affinity match to rank above newer unrelated story within trending window',
  );
});

test('compareLatestFeedArticles keeps breaking news above affinity matches in same outlet', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const liked = article('liked-1', 'Must-watch series season finale review', { topics: ['culture'] });
  const profile = buildInterestProfile(prefsWithLikedArticles([liked]))!;
  const breaking = article('breaking', 'Major earthquake strikes capital', {
    topics: ['world'],
    source: 'BBC News',
    publishedAt: recent(20 * 60 * 1000),
  });
  const affinityMatch = article('culture-match', 'Must-watch series season finale recap', {
    topics: ['culture'],
    source: 'BBC News',
    publishedAt: recent(3 * 60 * 60 * 1000),
  });

  assert.ok(
    compareLatestFeedArticles(breaking, affinityMatch, profile, now) < 0,
    'expected breaking story to outrank older affinity match despite personalization',
  );
});

test('getLatestFeed surfaces breaking news ahead of personalized matches from the same outlet', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const liked = article('liked-1', 'Must-watch series season finale review', { topics: ['culture'] });
  const prefs = prefsWithLikedArticles([liked]);
  const breaking = article('breaking', 'Major earthquake strikes capital', {
    topics: ['world'],
    source: 'BBC News',
    publishedAt: recent(20 * 60 * 1000),
  });
  const affinityMatch = article('culture-match', 'Must-watch series season finale recap', {
    topics: ['culture'],
    source: 'BBC News',
    publishedAt: recent(3 * 60 * 60 * 1000),
  });

  const feed = getLatestFeed([affinityMatch, breaking], prefs, { nowMs: now });

  assert.equal(feed[0]?.id, 'breaking');
});

test('getLatestFeed still includes breaking news on unrelated topics', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const liked = article('liked-1', 'Must-watch series season finale review', { topics: ['culture'] });
  const prefs = prefsWithLikedArticles([liked]);
  const breaking = article('breaking', 'Central bank raises rates unexpectedly', {
    topics: ['business'],
    source: 'Reuters',
    publishedAt: recent(15 * 60 * 1000),
  });
  const cultureMatch = article('culture-match', 'Must-watch series season finale recap', {
    topics: ['culture'],
    source: 'Vanity Fair',
    publishedAt: recent(10 * 60 * 1000),
  });

  const feed = getLatestFeed([cultureMatch, breaking], prefs, { nowMs: now });

  assert.ok(feed.some((item) => item.id === 'breaking'));
  assert.ok(feed.some((item) => item.id === 'culture-match'));
});

test('buildLatestPersonalizationKey tracks liked and opened article ids', () => {
  const key = buildLatestPersonalizationKey(
    basePrefs({
      likedArticleIds: ['a'],
      clickedArticleIds: ['b', 'c'],
    }),
  );

  assert.equal(key, JSON.stringify({ liked: ['a'], clicked: ['b', 'c'] }));
});

test('getLatestFeed falls back to chronological order without interest signals', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const newest = article('newest', 'Breaking update', {
    topics: ['world'],
    source: 'BBC News',
    publishedAt: recent(60_000),
  });
  const olderBurst = article('espn-0', 'NFL score', {
    topics: ['sports'],
    source: 'ESPN NFL',
    sportTags: ['football'],
    publishedAt: recent(10 * 60_000),
  });

  const ordered = getLatestFeed([olderBurst, newest], basePrefs({ likedArticleIds: [] }));

  assert.equal(ordered[0]?.id, 'newest');
});

test('getLatestFeed boosts matching stories within a recency window', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const liked = article('liked-1', 'Must-watch horror series finale', { topics: ['culture'] });
  const prefs = basePrefs({
    likedArticleIds: [liked.id],
    likedArticles: { [liked.id]: liked },
  });
  const profile = buildInterestProfile(prefs, [liked])!;

  const generic = article('generic', 'Gallery opens new exhibition', {
    topics: ['culture'],
    source: 'Vanity Fair',
    publishedAt: recent(2 * 60 * 60_000),
  });
  const matching = article('match', 'Must-watch horror series returns', {
    topics: ['culture'],
    source: 'Vanity Fair',
    publishedAt: recent(3 * 60 * 60_000),
  });

  assert.ok(
    compareLatestFeedArticles(matching, generic, profile) < 0,
    'expected affinity match to outrank a newer generic story in the same window',
  );

  const ordered = getLatestFeed([generic, matching], prefs);
  const vanityFair = ordered.filter((item) => item.source === 'Vanity Fair');

  assert.equal(vanityFair[0]?.id, 'match');
});

test('getLatestFeed weights likes above opens via interest profile', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();
  const liked = article('liked-1', 'Chiefs playoff preview', {
    topics: ['sports'],
    sportTags: ['football'],
  });
  const opened = article('opened-1', 'Modern art gallery retrospective', {
    topics: ['culture'],
  });
  const prefs = basePrefs({
    likedArticleIds: [liked.id],
    likedArticles: { [liked.id]: liked },
    clickedArticleIds: [opened.id],
    clickedArticles: { [opened.id]: opened },
  });
  const profile = buildInterestProfile(prefs, [liked, opened])!;

  const nflCandidate = article('nfl', 'Chiefs advance in playoffs', {
    topics: ['sports'],
    sportTags: ['football'],
    publishedAt: recent(3 * 60 * 60_000),
  });
  const cultureCandidate = article('culture', 'Gallery exhibition opens downtown', {
    topics: ['culture'],
    publishedAt: recent(2 * 60 * 60_000),
  });

  assert.ok(
    articleAffinityScore(nflCandidate, profile) > articleAffinityScore(cultureCandidate, profile),
  );
  assert.ok(
    compareLatestFeedArticles(nflCandidate, cultureCandidate, profile, now) < 0,
    'like-derived affinity should beat click-only affinity inside the recency window',
  );
});
