import assert from 'node:assert/strict';
import test from 'node:test';

import { ARTICLE_NO_IMAGE, resolveArticleImageUrl } from './images';

const BROKEN_GUARDIAN =
  'https://i.guim.co.uk/img/media/e0b90e442639d06b13d065aea5ae44a671c0f5fc/0_0_2503_2003/master/2503.jpg?width=960&quality=85&auto=format&fit=max&s=2615715cc8dfdf29579e4d2be9959154';
const VALID_GUARDIAN =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=700&quality=85&auto=format&fit=max&s=large';

test('resolveArticleImageUrl repairs broken Guardian signed URLs for feed display', () => {
  const resolved = resolveArticleImageUrl(BROKEN_GUARDIAN);
  assert.match(resolved, /width=140/);
  assert.doesNotMatch(resolved, /width=960/);
  assert.notEqual(resolved, ARTICLE_NO_IMAGE);
});

test('resolveArticleImageUrl leaves valid Guardian heroes unchanged', () => {
  assert.equal(resolveArticleImageUrl(VALID_GUARDIAN), VALID_GUARDIAN);
});

test('resolveArticleImageUrl maps placeholders to ARTICLE_NO_IMAGE', () => {
  assert.equal(
    resolveArticleImageUrl(
      'https://assets.guim.co.uk/images/guardian-logo-rss.c45beb1bafa34b347ac333af2e6fe23f.png',
    ),
    ARTICLE_NO_IMAGE,
  );
});
