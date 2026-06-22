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
    title: 'Enduro World Series preview',
    excerpt: 'Riders prepare for the season opener',
    sportTags: ['mtb'],
  };
  const industry = bikePool[2]!;

  assert.equal(articleMatchesForYouKeywords(cyclingRace, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(mtbPreview, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(industry, ['bikes']), true);
  assert.equal(articleMatchesForYouKeywords(cyclingRace, ['Bikes']), true);
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
