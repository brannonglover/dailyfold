import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractInterestKeywords,
  getKeywordTier,
  isNotForMeKeywordOption,
  isSpecificInterestKeyword,
} from './interestKeywords';

test('extractInterestKeywords prefers media and genre vocabulary over headline bigrams', () => {
  const keywords = extractInterestKeywords({
    text: "Patricia's Widow Bay horror comedy TV series review",
    source: "Men's Health",
    topics: ['culture'],
  });

  assert.deepEqual(keywords.slice(0, 4), ['tv', 'horror', 'comedy', 'series']);
  assert.ok(!keywords.includes('health'));
  assert.ok(!keywords.includes('patricia widow'));
  assert.ok(!keywords.includes('bay horror'));
  assert.ok(!keywords.includes('character unlike'));
  assert.ok(!keywords.includes('unlike any'));
  assert.ok(!keywords.includes('any other'));
  assert.ok(!keywords.some((keyword) => keyword === 'other comic'));
});

test('extractInterestKeywords ignores excerpt fragments when vocabulary signals are present', () => {
  const keywords = extractInterestKeywords({
    text: "Patricia's Widow Bay horror comedy TV series review A character unlike any other comic adaptation hits streaming this fall",
    title: "Patricia's Widow Bay horror comedy TV series review",
    source: "Men's Health",
    topics: ['culture'],
  });

  assert.deepEqual(keywords.slice(0, 5), ['tv', 'streaming', 'horror', 'comedy', 'series']);
  assert.ok(!keywords.includes('patricia'));
  assert.ok(!keywords.includes('unlike'));
  assert.ok(!keywords.includes('other'));
});

test('extractInterestKeywords excludes publication name tokens from source bleed', () => {
  const keywords = extractInterestKeywords({
    text: 'Health tips for marathon training season preview',
    source: "Men's Health",
    topics: ['health'],
  });

  assert.ok(!keywords.includes('health'));
});

test('extractInterestKeywords keeps sports-specific unigrams without arbitrary bigrams', () => {
  const keywords = extractInterestKeywords({
    text: 'NFL playoff preview: Chiefs advance to championship game',
    topics: ['sports'],
  });

  assert.ok(keywords.includes('chiefs'));
  assert.ok(!keywords.some((keyword) => keyword.includes(' ')));
  assert.ok(!keywords.includes('preview'));
});

test('isSpecificInterestKeyword treats curated short media terms as specific', () => {
  assert.ok(isSpecificInterestKeyword('tv'));
  assert.ok(isSpecificInterestKeyword('horror'));
  assert.equal(isSpecificInterestKeyword('preview'), false);
});

test('isNotForMeKeywordOption only allows curated vocabulary, not headline unigrams', () => {
  assert.ok(isNotForMeKeywordOption('horror'));
  assert.ok(isNotForMeKeywordOption('soccer'));
  assert.equal(isNotForMeKeywordOption('allegri'), false);
  assert.equal(isNotForMeKeywordOption('set'), false);
  assert.equal(isNotForMeKeywordOption('chiefs'), false);
});

test('extractInterestKeywords skips common headline fragments like set', () => {
  const keywords = extractInterestKeywords({
    text: 'Allegri set to leave club amid transfer rumors',
    title: 'Allegri set to leave club amid transfer rumors',
    source: 'Yahoo Sports',
    topics: ['sports'],
  });

  assert.ok(!keywords.includes('set'));
});

test('getKeywordTier classifies media and genre terms', () => {
  assert.equal(getKeywordTier('tv'), 'primary');
  assert.equal(getKeywordTier('horror'), 'secondary');
  assert.equal(getKeywordTier('series'), 'secondary');
  assert.equal(getKeywordTier('chiefs'), 'other');
});
