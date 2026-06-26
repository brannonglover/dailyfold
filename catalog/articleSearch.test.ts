import assert from 'node:assert/strict';
import test from 'node:test';

import {
  articleMatchesSearchQuery,
  buildFtsMatchQuery,
  expandSearchQueryTerms,
  generateArticleSearchTags,
  rankArticlesForSearchQuery,
  scoreArticleForSearchQuery,
} from './articleSearch';

test('generateArticleSearchTags includes RSS categories, sport tags, and content keywords', () => {
  const tags = generateArticleSearchTags({
    title: 'Best trail bikes for 2026',
    excerpt: 'Our favorite mountain bikes tested on singletrack',
    body: 'We rode dozens of full suspension rigs through muddy climbs and rocky descents.',
    topics: ['sports'],
    sportTags: ['mtb'],
    categories: ['Cycling', 'Gear'],
  });

  assert.ok(tags.includes('cycling'));
  assert.ok(tags.includes('mtb'));
  assert.ok(tags.some((tag) => tag.includes('mountain') || tag.includes('trail')));
});

test('scoreArticleForSearchQuery weights title matches above body-only matches', () => {
  const titleMatch = scoreArticleForSearchQuery(
    {
      title: 'MTB suspension setup guide',
      excerpt: 'Dial in your fork',
      body: 'Long guide about damping circuits.',
      searchTags: ['mtb', 'suspension'],
    },
    'MTB',
  );
  const bodyOnly = scoreArticleForSearchQuery(
    {
      title: 'Weekend roundup',
      excerpt: 'News from the trails',
      body: 'Riders discussed mtb tire pressure at the festival.',
      searchTags: ['mtb'],
    },
    'MTB',
  );

  assert.ok(titleMatch.total > bodyOnly.total);
});

test('rankArticlesForSearchQuery sorts by score then recency', () => {
  const articles = [
    {
      id: 'older-strong',
      title: 'MTB buyers guide',
      excerpt: 'Best mountain bikes',
      body: '',
      publishedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'newer-weak',
      title: 'Industry notes',
      excerpt: 'Weekly digest',
      body: 'Brief mention of mtb brands.',
      publishedAt: '2026-06-01T00:00:00.000Z',
    },
  ];

  const ranked = rankArticlesForSearchQuery(articles, 'mtb');
  assert.equal(ranked[0]?.id, 'older-strong');
});

test('articleMatchesSearchQuery matches body and tags, not only title', () => {
  assert.equal(
    articleMatchesSearchQuery(
      {
        title: 'Supply chain update',
        excerpt: 'Manufacturing shifts',
        body: 'Bicycle parts makers are adapting to bike industry demand.',
        searchTags: ['bicycle parts', 'bike industry'],
      },
      'bicycle parts',
    ),
    true,
  );
});

test('buildFtsMatchQuery expands bike queries for SQLite FTS by discipline', () => {
  const mtbQuery = buildFtsMatchQuery('MTB');
  assert.ok(mtbQuery);
  assert.match(mtbQuery!, /mtb/i);
  assert.doesNotMatch(mtbQuery!, /peloton/i);

  const cyclingQuery = buildFtsMatchQuery('cycling');
  assert.ok(cyclingQuery);
  assert.match(cyclingQuery!, /cycling/i);
  assert.doesNotMatch(cyclingQuery!, /\bmtb\b/i);

  const genericQuery = buildFtsMatchQuery('bikes');
  assert.ok(genericQuery);
  assert.match(genericQuery!, /cycling/i);
  assert.match(genericQuery!, /mtb/i);
});

test('expandSearchQueryTerms keeps cycling and mtb disciplines separate', () => {
  const cyclingTerms = expandSearchQueryTerms('cycling');
  assert.ok(cyclingTerms.includes('cycling'));
  assert.ok(cyclingTerms.includes('peloton'));
  assert.ok(!cyclingTerms.includes('mtb'));
  assert.ok(!cyclingTerms.some((term) => term.includes('mountain bike')));

  const mtbTerms = expandSearchQueryTerms('MTB');
  assert.ok(mtbTerms.includes('mtb'));
  assert.ok(mtbTerms.some((term) => term.includes('mountain bike')));
  assert.ok(!mtbTerms.includes('peloton'));
  assert.ok(!mtbTerms.includes('tour de france'));
});
