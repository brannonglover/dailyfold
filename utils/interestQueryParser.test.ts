import assert from 'node:assert/strict';
import test from 'node:test';

import { Article, Topic } from '../types';
import {
  parseInterestQuery,
  scoreArticleForInterest,
  articleMatchesGenericInterest,
  scoreArticleForRawInterest,
  isRecencyWord,
} from './interestQueryParser';
import { articleMatchesForYouKeywords } from './forYouTopics';

const article = (
  id: string,
  topic: Topic,
  overrides: Partial<Article> = {},
): Article => ({
  id,
  title: `Title ${id}`,
  excerpt: 'Excerpt',
  body: 'Body',
  source: 'Source',
  imageUrl: `https://example.com/${id}.jpg`,
  publishedAt: '2026-09-01T00:00:00.000Z',
  topics: [topic],
  url: `https://example.com/${id}`,
  readTimeMinutes: 3,
  ...overrides,
});

// ============================================================================
// parseInterestQuery
// ============================================================================

test('parseInterestQuery: splits on & connector', () => {
  const parsed = parseInterestQuery('Fantasy & Science Fiction Books');
  assert.deepEqual(parsed.terms, ['fantasy', 'science fiction', 'books']);
  assert.equal(parsed.hasRecencyIntent, false);
});

test('parseInterestQuery: splits on "and" connector', () => {
  const parsed = parseInterestQuery('Cooking and Baking');
  assert.deepEqual(parsed.terms, ['cooking', 'baking']);
});

test('parseInterestQuery: splits on comma connector', () => {
  const parsed = parseInterestQuery('Running, Swimming, Cycling');
  assert.deepEqual(parsed.terms, ['running', 'swimming', 'cycling']);
});

test('parseInterestQuery: preserves "science fiction" as compound concept', () => {
  const parsed = parseInterestQuery('Science Fiction');
  assert.deepEqual(parsed.terms, ['science fiction']);
});

test('parseInterestQuery: preserves "mountain bike" as compound concept', () => {
  const parsed = parseInterestQuery('Mountain Bike Trails');
  assert.deepEqual(parsed.terms, ['mountain bike', 'trails']);
});

test('parseInterestQuery: extracts recency intent from "latest"', () => {
  const parsed = parseInterestQuery('Latest Bike Repair Tools');
  assert.ok(parsed.hasRecencyIntent);
  assert.ok(!parsed.terms.includes('latest'));
  assert.ok(parsed.terms.includes('bike'));
  assert.ok(parsed.terms.includes('repair'));
  assert.ok(parsed.terms.includes('tools'));
});

test('parseInterestQuery: extracts recency intent from "new"', () => {
  const parsed = parseInterestQuery('New Fantasy Books');
  assert.ok(parsed.hasRecencyIntent);
  assert.ok(!parsed.terms.includes('new'));
  assert.ok(parsed.terms.includes('fantasy'));
  assert.ok(parsed.terms.includes('books'));
});

test('parseInterestQuery: removes noise words', () => {
  const parsed = parseInterestQuery('The Art of Gardening');
  assert.ok(!parsed.terms.includes('the'));
  assert.ok(!parsed.terms.includes('of'));
  assert.ok(parsed.terms.includes('art'));
  assert.ok(parsed.terms.includes('gardening'));
});

test('parseInterestQuery: expands synonyms for "science fiction"', () => {
  const parsed = parseInterestQuery('Science Fiction');
  const expanded = parsed.expandedTerms.get('science fiction')!;
  assert.ok(expanded.includes('science fiction'));
  assert.ok(expanded.includes('sci-fi'));
  assert.ok(expanded.includes('scifi'));
});

test('parseInterestQuery: expands synonyms for "books"', () => {
  const parsed = parseInterestQuery('Fantasy Books');
  const expanded = parsed.expandedTerms.get('books')!;
  assert.ok(expanded.includes('books'));
  assert.ok(expanded.includes('novel'));
  assert.ok(expanded.includes('novels'));
  assert.ok(expanded.includes('literature'));
});

test('parseInterestQuery: expands synonyms for "racing"', () => {
  const parsed = parseInterestQuery('Downhill Racing');
  const expanded = parsed.expandedTerms.get('racing')!;
  assert.ok(expanded.includes('racing'));
  assert.ok(expanded.includes('race'));
  assert.ok(expanded.includes('competition'));
});

test('parseInterestQuery: expands synonyms for "downhill"', () => {
  const parsed = parseInterestQuery('Downhill Racing');
  const expanded = parsed.expandedTerms.get('downhill')!;
  assert.ok(expanded.includes('downhill'));
  assert.ok(expanded.includes('dh'));
});

test('parseInterestQuery: deduplicates terms', () => {
  const parsed = parseInterestQuery('bikes and bikes');
  assert.equal(parsed.terms.filter((t) => t === 'bikes').length, 1);
});

// ============================================================================
// Fantasy & Science Fiction Books
// ============================================================================

test('Fantasy & Science Fiction Books: matches "10 Science Fiction Novels Worth Reading This Fall"', () => {
  const a = article('sf-novels', 'culture', {
    title: '10 Science Fiction Novels Worth Reading This Fall',
    excerpt: 'From space operas to near-future thrillers, these sci-fi books deserve your attention.',
  });
  assert.ok(articleMatchesGenericInterest(a, 'Fantasy & Science Fiction Books'));
});

test('Fantasy & Science Fiction Books: matches "The Best New Fantasy Books of 2026"', () => {
  const a = article('fantasy-books', 'culture', {
    title: 'The Best New Fantasy Books of 2026',
    excerpt: 'Epic fantasy novels that deserve a spot on your reading list this year.',
  });
  assert.ok(articleMatchesGenericInterest(a, 'Fantasy & Science Fiction Books'));
});

test('Fantasy & Science Fiction Books: does NOT match "Scientists Discover New Exoplanet"', () => {
  const a = article('exoplanet', 'science', {
    title: 'Scientists Discover New Exoplanet',
    excerpt: 'A team of astronomers has confirmed the existence of a rocky planet in the habitable zone.',
  });
  assert.equal(articleMatchesGenericInterest(a, 'Fantasy & Science Fiction Books'), false);
});

test('Fantasy & Science Fiction Books: does NOT match "Fantasy Football Week 4 Rankings"', () => {
  const a = article('fantasy-football', 'sports', {
    title: 'Fantasy Football Week 4 Rankings',
    excerpt: 'Start and sit recommendations for your fantasy league this week.',
  });
  assert.equal(articleMatchesGenericInterest(a, 'Fantasy & Science Fiction Books'), false);
});

// ============================================================================
// Downhill Racing
// ============================================================================

test('Downhill Racing: matches "World Cup Downhill Round Heads to Austria"', () => {
  const a = article('dh-wc', 'sports', {
    title: 'World Cup Downhill Round Heads to Austria',
    excerpt: 'The UCI Downhill race series continues with a demanding track in Leogang.',
    sportTags: ['mtb'],
  });
  assert.ok(articleMatchesGenericInterest(a, 'Downhill Racing'));
});

test('Downhill Racing: matches "DH Race Results From Leogang"', () => {
  const a = article('dh-results', 'sports', {
    title: 'DH Race Results From Leogang',
    excerpt: 'Full results from the elite DH competition at Leogang.',
  });
  assert.ok(articleMatchesGenericInterest(a, 'Downhill Racing'));
});

test('Downhill Racing: does NOT match trail review without racing context', () => {
  const a = article('dh-trails', 'sports', {
    title: 'Best Downhill Mountain Bike Trails in Colorado',
    excerpt: 'Gravity-fed riding at its finest with these flowy descents.',
  });
  assert.equal(articleMatchesGenericInterest(a, 'Downhill Racing'), false);
});

// ============================================================================
// Latest Bike Repair Tools — via the full keyword matcher (bike path)
// ============================================================================

test('Latest Bike Repair Tools: matches "Park Tool Introduces New Workshop Tools"', () => {
  const a = article('park-tool', 'technology', {
    title: 'Park Tool Introduces New Workshop Tools',
    excerpt: 'The bicycle tool maker expands its professional mechanic range.',
    searchTags: ['bike', 'tool', 'workshop', 'repair'],
  });
  assert.ok(articleMatchesForYouKeywords(a, ['latest bike repair tools']));
});

test('Latest Bike Repair Tools: matches "Five New Tools Every Bike Mechanic Should Know"', () => {
  const a = article('5-tools', 'technology', {
    title: 'Five New Tools Every Bike Mechanic Should Know',
    excerpt: 'These repair tools will make servicing your bicycle faster and easier.',
  });
  assert.ok(articleMatchesForYouKeywords(a, ['latest bike repair tools']));
});

test('Latest Bike Repair Tools: does NOT require literal "latest" in the article', () => {
  const a = article('tools-no-latest', 'technology', {
    title: 'Essential Bike Repair Tools for Your Workshop',
    excerpt: 'A guide to the tools every home mechanic needs for bicycle maintenance.',
  });
  assert.ok(articleMatchesForYouKeywords(a, ['latest bike repair tools']));
});

// ============================================================================
// Bike Repair — existing behavior preserved
// ============================================================================

test('Bike Repair: matches repair/maintenance articles', () => {
  const a = article('brake-fix', 'technology', {
    title: 'How to Properly Adjust a Shimano Rear Derailleur',
    excerpt: 'Step-by-step guide to getting your shifting dialed on your bicycle.',
    searchTags: ['bike', 'repair', 'shimano', 'derailleur'],
  });
  assert.ok(articleMatchesForYouKeywords(a, ['bike repair']));
});

test('Bike Repair: does NOT match general cycling race news', () => {
  const a = article('tdf-stage', 'sports', {
    title: 'Tour de France Stage 12 Recap',
    excerpt: 'A sprint finish decided the stage as the peloton rolled into Toulouse.',
    sportTags: ['cycling'],
  });
  assert.equal(articleMatchesForYouKeywords(a, ['bike repair']), false);
});

// ============================================================================
// Vintage Mountain Bikes — existing behavior preserved
// ============================================================================

test('Vintage Mountain Bikes: matches retro MTB articles', () => {
  const a = article('vintage-mtb', 'culture', {
    title: 'Restoring a 1992 Specialized Stumpjumper',
    excerpt: 'A vintage mountain bike gets a second life with a careful restoration.',
    searchTags: ['mountain bike', 'vintage', 'restoration'],
  });
  assert.ok(articleMatchesForYouKeywords(a, ['vintage mountain bikes']));
});

test('Vintage Mountain Bikes: does NOT match modern MTB reviews', () => {
  const a = article('new-mtb', 'technology', {
    title: 'The 2026 Trek Fuel EXe Review',
    excerpt: 'Trek delivers an outstanding trail bike with subtle e-assist.',
    sportTags: ['mtb'],
  });
  assert.equal(articleMatchesForYouKeywords(a, ['vintage mountain bikes']), false);
});

// ============================================================================
// Recency word detection
// ============================================================================

test('isRecencyWord identifies recency words', () => {
  assert.ok(isRecencyWord('latest'));
  assert.ok(isRecencyWord('Latest'));
  assert.ok(isRecencyWord('new'));
  assert.ok(isRecencyWord('recent'));
  assert.ok(!isRecencyWord('bike'));
  assert.ok(!isRecencyWord('repair'));
});

// ============================================================================
// Kicker scoring — more specific interest wins
// ============================================================================

test('scoreArticleForRawInterest: "bike repair tools" scores higher than "bike repair" for tool article', () => {
  const a = article('park-tool-new', 'technology', {
    title: 'Park Tool releases new professional wheel-building tools',
    excerpt: 'The latest bike tools from Park Tool include a precision spoke tension meter.',
    searchTags: ['bike', 'tool', 'workshop', 'repair'],
  });
  const toolsScore = scoreArticleForRawInterest(a, 'bike repair tools');
  const repairScore = scoreArticleForRawInterest(a, 'bike repair');
  assert.ok(
    toolsScore > repairScore,
    `Expected "bike repair tools" (${toolsScore}) > "bike repair" (${repairScore})`,
  );
});

test('scoreArticleForRawInterest: "bike repair" scores higher than "bike repair tools" for derailleur article', () => {
  const a = article('derailleur-adj', 'technology', {
    title: 'How to properly adjust a Shimano rear derailleur',
    excerpt: 'A step-by-step guide to dialing in your shifting on any bicycle.',
    searchTags: ['bike', 'repair', 'shimano', 'derailleur'],
  });
  const repairScore = scoreArticleForRawInterest(a, 'bike repair');
  const toolsScore = scoreArticleForRawInterest(a, 'bike repair tools');
  assert.ok(
    repairScore >= toolsScore,
    `Expected "bike repair" (${repairScore}) >= "bike repair tools" (${toolsScore})`,
  );
});

// ============================================================================
// Edge cases
// ============================================================================

test('parseInterestQuery: empty string returns empty terms', () => {
  const parsed = parseInterestQuery('');
  assert.equal(parsed.terms.length, 0);
  assert.equal(parsed.hasRecencyIntent, false);
});

test('parseInterestQuery: single word interest works', () => {
  const parsed = parseInterestQuery('Gardening');
  assert.deepEqual(parsed.terms, ['gardening']);
});

test('articleMatchesGenericInterest: single-term interest matches when present', () => {
  const a = article('garden', 'lifestyle', {
    title: 'Spring Gardening Tips for Beginners',
    excerpt: 'Start your garden right with these essential techniques.',
  });
  assert.ok(articleMatchesGenericInterest(a, 'Gardening'));
});

test('articleMatchesGenericInterest: single-term interest does NOT match unrelated', () => {
  const a = article('no-garden', 'technology', {
    title: 'New JavaScript Framework Released',
    excerpt: 'A modern approach to building web applications.',
  });
  assert.equal(articleMatchesGenericInterest(a, 'Gardening'), false);
});
