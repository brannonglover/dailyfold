import assert from 'node:assert/strict';
import test from 'node:test';

import { Article, Topic } from '@/types';
import {
  articleMatchesForYouInterests,
  articleMatchesForYouKeywords,
  buildTopicHeroImageByTopic,
  expandForYouKeywordMatchTerms,
  searchForYouInterests,
  searchTopics,
} from '@/utils/forYouTopics';

const article = (
  id: string,
  topic: Topic,
  publishedAt: string,
  overrides: Partial<Article> = {},
): Article => ({
  id,
  title: `Title ${id}`,
  excerpt: 'Excerpt',
  body: 'Body',
  source: 'Source',
  imageUrl: `https://example.com/${id}.jpg`,
  publishedAt,
  topics: [topic],
  url: `https://example.com/${id}`,
  readTimeMinutes: 3,
  ...overrides,
});

const bikePool: Article[] = [
  article('bike-review', 'technology', '2026-01-01T00:00:00.000Z', {
    title: 'Smart bike computers get smarter',
    excerpt: 'New GPS units for road cyclists',
  }),
  {
    ...article('trail-bikes', 'sports', '2026-01-02T00:00:00.000Z'),
    title: 'Best trail bikes for 2026',
    excerpt: 'Our favorite mountain bikes tested on singletrack',
    sportTags: ['mtb'],
  },
  {
    ...article('industry', 'business', '2026-01-03T00:00:00.000Z'),
    title: 'Bicycle parts supply chain shifts',
    excerpt: 'Component makers adapt as bike industry demand changes',
  },
];

test('searchTopics matches labels and ids case-insensitively', () => {
  assert.deepEqual(searchTopics('tech'), ['technology']);
  assert.deepEqual(searchTopics('video games'), ['gaming']);
  assert.deepEqual(searchTopics('books'), ['books']);
  assert.deepEqual(searchTopics(''), []);
});

test('searchTopics maps common keywords to topics but not bike terms to sports', () => {
  assert.deepEqual(searchTopics('NBA'), ['sports']);
  assert.deepEqual(searchTopics('climate'), ['world']);
  assert.deepEqual(searchTopics('AI'), ['technology']);
  assert.deepEqual(searchTopics('Bikes'), []);
  assert.deepEqual(searchTopics('bike'), []);
});

test('searchTopics includes topics from matching articles in the pool', () => {
  assert.deepEqual(searchTopics('trail bikes', { articles: bikePool }), ['sports']);
  assert.deepEqual(searchTopics('bicycle parts', { articles: bikePool }), ['business']);
  assert.deepEqual(searchTopics('electric scooter', { articles: bikePool }), []);
});

test('searchForYouInterests returns articles, keywords, and sport tags for Bikes', () => {
  const results = searchForYouInterests('Bikes', { articles: bikePool });
  const kinds = results.map((item) => item.kind);

  assert.ok(kinds.includes('article'));
  assert.ok(kinds.includes('keyword'));
  assert.ok(kinds.includes('sportTag'));
  assert.ok(!results.some((item) => item.kind === 'topic' && item.topic === 'sports'));

  const labels = results.map((item) => item.label.toLowerCase());
  assert.ok(labels.some((label) => label.includes('trail bikes')));
  assert.ok(labels.some((label) => label.includes('bikes') || label.includes('cycling')));
  assert.ok(labels.some((label) => label.includes('cycling') || label.includes('mtb')));
});

test('searchForYouInterests surfaces bicycle industry articles for bicycle parts query', () => {
  const results = searchForYouInterests('bicycle parts', { articles: bikePool });
  assert.ok(results.some((item) => item.kind === 'article' && item.label.includes('Bicycle parts')));
  assert.ok(results.some((item) => item.kind === 'keyword'));
});

test('searchForYouInterests matches body text when title and excerpt omit the query', () => {
  const pool: Article[] = [
    article('body-only', 'business', '2026-01-04T00:00:00.000Z', {
      title: 'Quarterly manufacturing report',
      excerpt: 'Factories adjust to new demand',
      body: 'Several bicycle parts suppliers expanded mtb component lines this year.',
      searchTags: ['bicycle parts', 'mtb', 'manufacturing'],
    }),
  ];

  const results = searchForYouInterests('bicycle parts', { articles: pool });
  assert.ok(results.some((item) => item.kind === 'article'));
});

test('articleMatchesForYouInterests matches topics, keywords, and sport tags', () => {
  const trailBike = bikePool[1]!;
  const industry = bikePool[2]!;

  assert.equal(
    articleMatchesForYouInterests(trailBike, {
      forYouTopics: ['sports'],
      forYouKeywords: [],
      forYouSportTags: [],
    }),
    true,
  );
  assert.equal(
    articleMatchesForYouInterests(industry, {
      forYouTopics: [],
      forYouKeywords: ['bicycle parts'],
      forYouSportTags: [],
    }),
    true,
  );
  assert.equal(
    articleMatchesForYouInterests(trailBike, {
      forYouTopics: [],
      forYouKeywords: [],
      forYouSportTags: ['mtb'],
    }),
    true,
  );
  assert.equal(
    articleMatchesForYouInterests(trailBike, {
      forYouTopics: ['technology'],
      forYouKeywords: [],
      forYouSportTags: [],
    }),
    false,
  );
});

test('articleMatchesForYouKeywords matches title vocabulary', () => {
  const trailBike = bikePool[1]!;
  assert.equal(articleMatchesForYouKeywords(trailBike, ['mountain bike']), true);
  assert.equal(articleMatchesForYouKeywords(trailBike, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(trailBike, ['basketball']), false);
});

test('articleMatchesForYouKeywords expands bike synonyms for cycling and bicycle vocabulary', () => {
  const cyclingRace: Article = {
    ...article('tdf', 'sports', '2026-01-04T00:00:00.000Z'),
    title: 'Tour de France stage recap',
    excerpt: 'Peloton battles through the Alps',
    sportTags: ['cycling'],
  };
  const mtbPreview: Article = {
    ...article('ews', 'sports', '2026-01-05T00:00:00.000Z'),
    title: 'Enduro World Series mountain bike preview',
    excerpt: 'Riders prepare for the season opener',
    sportTags: ['mtb'],
  };
  const industry = bikePool[2]!;

  assert.equal(articleMatchesForYouKeywords(cyclingRace, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(mtbPreview, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(industry, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(cyclingRace, ['Bikes']), true);
});

test('articleMatchesForYouKeywords rejects mtb sport tag without bike context in headline', () => {
  const genericMtbFeed: Article = {
    ...article('ews-generic', 'sports', '2026-01-05T00:00:00.000Z'),
    title: 'Enduro World Series preview',
    excerpt: 'Riders prepare for the season opener',
    sportTags: ['mtb'],
  };

  assert.equal(articleMatchesForYouKeywords(genericMtbFeed, ['bikes']), false);
});

test('articleMatchesForYouKeywords matches bike hashtags in article text', () => {
  const tagged: Article = {
    ...article('tagged', 'sports', '2026-01-06T00:00:00.000Z'),
    title: 'Weekend ride roundup',
    excerpt: 'Highlights from #cycling and #gravel events this week',
  };

  assert.equal(articleMatchesForYouKeywords(tagged, ['bikes']), true);
});

test('expandForYouKeywordMatchTerms includes bike synonym set for bikes interest', () => {
  const terms = expandForYouKeywordMatchTerms('bikes');
  assert.ok(terms.includes('bikes'));
  assert.ok(terms.includes('cycling'));
  assert.ok(terms.includes('bicycle'));
  assert.ok(terms.includes('mountain bike'));
  assert.deepEqual(expandForYouKeywordMatchTerms('nba'), ['nba']);
});

test('expandForYouKeywordMatchTerms keeps cycling and mtb disciplines separate', () => {
  const cyclingTerms = expandForYouKeywordMatchTerms('cycling');
  assert.ok(cyclingTerms.includes('cycling'));
  assert.ok(cyclingTerms.includes('peloton'));
  assert.ok(!cyclingTerms.includes('mtb'));
  assert.ok(!cyclingTerms.some((term) => term.includes('mountain bike')));

  const mtbTerms = expandForYouKeywordMatchTerms('mtb');
  assert.ok(mtbTerms.includes('mtb'));
  assert.ok(mtbTerms.some((term) => term.includes('mountain bike')));
  assert.ok(!mtbTerms.includes('peloton'));
});

test('articleMatchesForYouKeywords separates road cycling from mtb interests', () => {
  const cyclingRace: Article = {
    ...article('tdf', 'sports', '2026-01-04T00:00:00.000Z'),
    title: 'Tour de France stage recap',
    excerpt: 'Peloton battles through the Alps',
    sportTags: ['cycling'],
  };
  const mtbPreview: Article = {
    ...article('ews', 'sports', '2026-01-05T00:00:00.000Z'),
    title: 'Enduro World Series mountain bike preview',
    excerpt: 'Riders prepare for rocky singletrack',
    sportTags: ['mtb'],
  };

  assert.equal(articleMatchesForYouKeywords(cyclingRace, ['cycling']), true);
  assert.equal(articleMatchesForYouKeywords(mtbPreview, ['cycling']), false);
  assert.equal(articleMatchesForYouKeywords(mtbPreview, ['mtb']), true);
  assert.equal(articleMatchesForYouKeywords(cyclingRace, ['mtb']), false);
  assert.equal(articleMatchesForYouKeywords(cyclingRace, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(mtbPreview, ['bikes']), true);
});

test('searchForYouInterests returns different results for Cycling vs MTB', () => {
  const pool: Article[] = [
    {
      ...article('road-stage', 'sports', '2026-01-10T00:00:00.000Z'),
      title: 'Tour de France stage recap',
      excerpt: 'Peloton battles through the Alps on road bikes',
      sportTags: ['cycling'],
    },
    {
      ...article('trail-review', 'sports', '2026-01-11T00:00:00.000Z'),
      title: 'Best trail bikes for 2026',
      excerpt: 'Our favorite mountain bikes tested on singletrack',
      sportTags: ['mtb'],
    },
  ];

  const cyclingResults = searchForYouInterests('Cycling', { articles: pool });
  const mtbResults = searchForYouInterests('MTB', { articles: pool });

  const cyclingArticleIds = cyclingResults
    .filter((item) => item.kind === 'article')
    .map((item) => item.article?.id);
  const mtbArticleIds = mtbResults
    .filter((item) => item.kind === 'article')
    .map((item) => item.article?.id);

  assert.deepEqual(cyclingArticleIds, ['road-stage']);
  assert.deepEqual(mtbArticleIds, ['trail-review']);
  assert.notDeepEqual(cyclingArticleIds, mtbArticleIds);

  assert.ok(cyclingResults.some((item) => item.kind === 'sportTag' && item.sportTag === 'cycling'));
  assert.ok(!cyclingResults.some((item) => item.kind === 'sportTag' && item.sportTag === 'mtb'));
  assert.ok(mtbResults.some((item) => item.kind === 'sportTag' && item.sportTag === 'mtb'));
  assert.ok(!mtbResults.some((item) => item.kind === 'sportTag' && item.sportTag === 'cycling'));
});

test('buildTopicHeroImageByTopic picks the newest article image per topic', () => {
  const images = buildTopicHeroImageByTopic(
    [
      article('old', 'culture', '2026-01-01T00:00:00.000Z'),
      article('new', 'culture', '2026-01-03T00:00:00.000Z'),
    ],
    ['culture'],
  );

  assert.equal(images.get('culture'), 'https://example.com/new.jpg');
});

test('articleMatchesForYouKeywords rejects gaming articles with bike-like substrings in body', () => {
  const kotakuGame: Article = {
    ...article('kotaku-control', 'gaming', '2026-01-07T00:00:00.000Z'),
    title: 'Control Resonant Hands-On: Giving One Of The Most Co...',
    excerpt: 'Our early impressions of the new action game',
    body:
      'Developers shared how they are recycling assets from the prior release while the team develops new mechanics.',
    source: 'Kotaku',
    topics: ['gaming', 'culture'],
  };

  assert.equal(articleMatchesForYouKeywords(kotakuGame, ['bikes']), false);
});

test('articleMatchesForYouKeywords rejects non-cycling road.cc articles from source defaults', () => {
  const tentReview: Article = {
    ...article('road-tent', 'sports', '2026-01-08T00:00:00.000Z'),
    title: 'TentBox Lite',
    excerpt: 'A lightweight rooftop tent for car camping adventures',
    source: 'road.cc',
    sportTags: ['cycling'],
  };

  assert.equal(articleMatchesForYouKeywords(tentReview, ['bikes']), false);
});

test('articleMatchesForYouKeywords still matches road.cc cycling reviews', () => {
  const bikeReview: Article = {
    ...article('road-bike', 'sports', '2026-01-09T00:00:00.000Z'),
    title: 'Canyon Grail review',
    excerpt: 'We test the latest gravel bike on mixed terrain',
    source: 'road.cc',
    sportTags: ['cycling'],
  };

  assert.equal(articleMatchesForYouKeywords(bikeReview, ['bikes']), true);
});

test('bike interest modifier is satisfied by its synonyms, not just the literal word', () => {
  const bikeStory = (id: string, title: string) =>
    article(id, 'sports', '2026-11-01T00:00:00.000Z', {
      title,
      excerpt: 'Notes from the workshop bench',
      sportTags: ['cycling'],
    });

  // "Bicycle Repair" should cover fix / service / maintenance wording
  assert.equal(
    articleMatchesForYouKeywords(bikeStory('fix', 'How to fix a slipping bike chain'), ['bicycle repair']),
    true,
  );
  assert.equal(
    articleMatchesForYouKeywords(bikeStory('svc', 'Bike maintenance checklist for winter'), ['bicycle repair']),
    true,
  );
  // still requires some repair-flavored word — plain race news does not qualify
  assert.equal(
    articleMatchesForYouKeywords(bikeStory('race', 'Ineos reveals its 2027 bike team lineup'), ['bicycle repair']),
    false,
  );
  // "service" is NOT a repair word for bike content ("National Park Service")
  assert.equal(
    articleMatchesForYouKeywords(bikeStory('nps', 'National Park Service opens more trails to bikes'), ['bicycle repair']),
    false,
  );
  // short synonyms match whole words only ("fix" must not match "prefix")
  assert.equal(
    articleMatchesForYouKeywords(bikeStory('prefix', 'The prefix on this bike model number'), ['bicycle repair']),
    false,
  );
});

test('a feed dedicated to bike repair vouches for its posts, except recurring meta threads', () => {
  const post = (id: string, title: string, source: string) =>
    article(id, 'sports', '2026-11-01T00:00:00.000Z', { title, excerpt: '', source });

  // r/bikewrench posts rarely say "bike" or "repair"
  assert.equal(
    articleMatchesForYouKeywords(post('a', 'Derailur messed up after flying', 'Reddit r/bikewrench'), ['bicycle repair']),
    true,
  );
  // same title from a general feed does not qualify
  assert.equal(
    articleMatchesForYouKeywords(post('b', 'Derailur messed up after flying', 'Reddit r/books'), ['bicycle repair']),
    false,
  );
  // stickied/recurring threads are not stories
  assert.equal(
    articleMatchesForYouKeywords(post('c', 'Small Questions and Thank Yous Weekly Thread', 'Reddit r/bikewrench'), ['bicycle repair']),
    false,
  );
  assert.equal(
    articleMatchesForYouKeywords(post('d', 'Subreddit Rules', 'Reddit r/bikewrench'), ['bicycle repair']),
    false,
  );
  // the feed only vouches for what it is about: it says nothing about "bike saddles"
  assert.equal(
    articleMatchesForYouKeywords(post('e', 'Derailur messed up after flying', 'Reddit r/bikewrench'), ['bike saddles']),
    false,
  );
});
