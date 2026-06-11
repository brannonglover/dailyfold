import assert from 'node:assert/strict';
import test from 'node:test';

import {
  articleIdFromNotificationPayload,
  isValidArticleRouteId,
  parseArticleIdFromUrl,
} from '@/utils/notificationArticleLink';

test('isValidArticleRouteId rejects unresolved route templates', () => {
  assert.equal(isValidArticleRouteId('[id]'), false);
  assert.equal(isValidArticleRouteId('undefined'), false);
  assert.equal(isValidArticleRouteId('abc123'), true);
});

test('parseArticleIdFromUrl reads article paths from deep links', () => {
  assert.equal(parseArticleIdFromUrl('dailyfold:///article/feed-hash-1'), 'feed-hash-1');
  assert.equal(parseArticleIdFromUrl('dailyfold://article/feed-hash-1'), 'feed-hash-1');
  assert.equal(parseArticleIdFromUrl('/article/feed-hash-1'), 'feed-hash-1');
  assert.equal(parseArticleIdFromUrl('dailyfold://article/[id]'), undefined);
});

test('articleIdFromNotificationPayload prefers articleId then url', () => {
  const fromId = articleIdFromNotificationPayload({
    request: { content: { data: { articleId: 'story-1' } } },
  });
  assert.equal(fromId, 'story-1');

  const fromUrl = articleIdFromNotificationPayload({
    request: {
      content: { data: { url: 'dailyfold://article/story-2' } },
    },
  });
  assert.equal(fromUrl, 'story-2');

  const invalid = articleIdFromNotificationPayload({
    request: { content: { data: { articleId: '[id]' } } },
  });
  assert.equal(invalid, undefined);
});
