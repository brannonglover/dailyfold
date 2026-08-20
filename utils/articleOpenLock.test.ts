import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ARTICLE_OPEN_LOCK_MS,
  claimArticleOpen,
  resetArticleOpenLock,
} from './articleOpenLock';

test('claimArticleOpen allows the first open', () => {
  resetArticleOpenLock();
  assert.equal(claimArticleOpen('/browser?url=https://example.com/a'), true);
});

test('claimArticleOpen ignores a duplicate href while the lock is held', () => {
  resetArticleOpenLock();
  const href = '/browser?url=https://example.com/a';
  assert.equal(claimArticleOpen(href), true);
  assert.equal(claimArticleOpen(href), false);
});

test('claimArticleOpen still allows a different article', () => {
  resetArticleOpenLock();
  assert.equal(claimArticleOpen('/browser?url=https://example.com/a'), true);
  assert.equal(claimArticleOpen('/browser?url=https://example.com/b'), true);
});

test('resetArticleOpenLock allows the same href again', () => {
  resetArticleOpenLock();
  const href = '/browser?url=https://example.com/a';
  assert.equal(claimArticleOpen(href), true);
  resetArticleOpenLock();
  assert.equal(claimArticleOpen(href), true);
});

test('claimArticleOpen allows the same href after the lock expires', () => {
  resetArticleOpenLock();
  const href = '/browser?url=https://example.com/a';
  const startedAt = 1_000;
  assert.equal(claimArticleOpen(href, startedAt), true);
  assert.equal(claimArticleOpen(href, startedAt + ARTICLE_OPEN_LOCK_MS - 1), false);
  assert.equal(claimArticleOpen(href, startedAt + ARTICLE_OPEN_LOCK_MS), true);
});
