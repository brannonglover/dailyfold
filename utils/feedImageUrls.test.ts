import assert from 'node:assert/strict';
import test from 'node:test';

import { collectFeedImageUrls } from '@/utils/feedImageUrls';

test('collectFeedImageUrls keeps feed order, dedupes, and skips missing images', () => {
  const urls = collectFeedImageUrls(
    [
      { imageUrl: 'https://cdn.example.com/a.jpg' },
      { imageUrl: '' },
      { imageUrl: 'https://cdn.example.com/a.jpg' },
      { imageUrl: '//cdn.example.com/b.jpg' },
      { imageUrl: 'http://cdn.example.com/c.jpg' },
    ],
    10,
  );
  assert.deepEqual(urls, [
    'https://cdn.example.com/a.jpg',
    'https://cdn.example.com/b.jpg',
    'https://cdn.example.com/c.jpg',
  ]);
});

test('collectFeedImageUrls respects the limit', () => {
  const articles = Array.from({ length: 8 }, (_, i) => ({
    imageUrl: `https://cdn.example.com/${i}.jpg`,
  }));
  assert.equal(collectFeedImageUrls(articles, 3).length, 3);
});
