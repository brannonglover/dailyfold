import assert from 'node:assert/strict';
import test from 'node:test';

import { buildInterestTsQueryText } from './db';

test('two-term interest requires both terms, each satisfied by its synonyms', () => {
  const query = buildInterestTsQueryText('Fantasy Books');
  assert.equal(
    query,
    '((fantasy:*) & (books:* | book:* | novel:* | novels:* | literature:*))',
  );
});

test('three-term interest needs any two of three terms', () => {
  const query = buildInterestTsQueryText('dragon wizard magic');
  assert.ok(query);
  // ceil(3 × 0.6) = 2 → C(3,2) = 3 two-term groups, OR'd together
  assert.equal(query.match(/\) & \(/g)?.length, 3);
  assert.equal(query.match(/\)\) \| \(\(/g)?.length, 2);
});

test('single-term interest is a plain match', () => {
  assert.equal(buildInterestTsQueryText('gardening'), '((gardening:*))');
});

test('short words are not prefix-matched', () => {
  assert.equal(buildInterestTsQueryText('ai'), '((ai | artificial <-> intelligence:*))');
});

test('compound concepts stay one phrase and noise words are dropped', () => {
  const query = buildInterestTsQueryText('the best science fiction');
  assert.ok(query);
  assert.match(query, /science <-> fiction:\*/);
  assert.doesNotMatch(query, /\bthe\b|\bbest\b/);
});

test('tsquery operators in user text cannot inject syntax', () => {
  const query = buildInterestTsQueryText("fantasy & (books) | 'x' <-> !y");
  assert.ok(query);
  assert.doesNotMatch(query, /['!\\]/);
});

test('empty and noise-only interests produce no query', () => {
  assert.equal(buildInterestTsQueryText(''), null);
  assert.equal(buildInterestTsQueryText('the news'), null);
});

test('bike interest requires a bike term plus its modifier word', () => {
  const query = buildInterestTsQueryText('Bicycle Repair');
  assert.ok(query);
  // modifier ("repair", or a synonym) is ANDed onto an OR of bike vocabulary
  assert.match(query, /^\(.*\bbicycle\b.*\) & \(repair:\* \| repairs:\* \| repaired:\* \| repairing:\* \| fix \| fixing:\* \| maintenance:\* \| troubleshooting:\* \| tune <-> up\)$/);
  // exact matching on bike vocabulary: no prefix match on e.g. "velo"
  assert.doesNotMatch(query, /velo:\*/);
});

test('bike interest without a modifier is just the bike vocabulary', () => {
  const query = buildInterestTsQueryText('gravel bikes');
  assert.ok(query);
  assert.doesNotMatch(query, /\) & \(/);
});

test('recency words are not treated as bike modifiers', () => {
  const query = buildInterestTsQueryText('latest bike');
  assert.ok(query);
  assert.doesNotMatch(query, /\) & \(/);
});

test('bike repair interests are also matched by their dedicated feeds', async () => {
  const { interestFocusSourceNames } = await import('./db');
  const names = interestFocusSourceNames('Bicycle Repair');
  assert.ok(names.includes('Reddit r/bikewrench'));
  assert.ok(names.includes('Bicycle Stack Exchange'));
  // a different modifier is not covered by repair feeds, and non-bike interests never are
  assert.deepEqual(interestFocusSourceNames('bike saddles'), []);
  assert.deepEqual(interestFocusSourceNames('Fantasy Books'), []);
});
