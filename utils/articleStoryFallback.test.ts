import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { applyArticleStoryFallbacks } from '@/utils/articleStoryFallback';
import {
  articleStoryKey,
  hasRealHeroImage,
  normalizeStoryTitle,
  pickBestHeroImageAlternate,
} from '@/utils/articleStoryMatch';

function article(overrides: Partial<Article> & Pick<Article, 'id' | 'title' | 'source'>): Article {
  return {
    excerpt: 'excerpt',
    body: 'body',
    imageUrl: '',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: '2026-06-08T12:00:00.000Z',
    url: `https://example.com/${overrides.id}`,
    ...overrides,
  };
}

test('normalizeStoryTitle strips outlet suffixes and punctuation', () => {
  assert.equal(
    normalizeStoryTitle('Ceasefire Talks Stall — BBC News'),
    normalizeStoryTitle('Ceasefire Talks Stall'),
  );
});

test('articleStoryKey groups same headline on the same day', () => {
  const a = article({ id: 'a', title: 'Markets Rally', source: 'BBC News' });
  const b = article({
    id: 'b',
    title: 'Markets Rally | CNN',
    source: 'CNN',
    publishedAt: '2026-06-08T18:00:00.000Z',
  });
  assert.equal(articleStoryKey(a), articleStoryKey(b));
});

test('hasRealHeroImage treats empty and legacy placeholders as missing', () => {
  const empty = article({ id: 'e', title: 'T', source: 'NPR' });
  const legacy = article({
    id: 'l',
    title: 'T',
    source: 'NPR',
    imageUrl: 'https://images.unsplash.com/photo-1504711434966-e33886168f5c?w=800&q=80',
  });
  const real = article({
    id: 'r',
    title: 'T',
    source: 'NPR',
    imageUrl: 'https://cdn.example.com/photo.jpg',
  });

  assert.equal(hasRealHeroImage(empty), false);
  assert.equal(hasRealHeroImage(legacy), false);
  assert.equal(hasRealHeroImage(real), true);
});

test('applyArticleStoryFallbacks swaps imageless story for sibling with hero image', () => {
  const imageless = article({
    id: 'guardian',
    title: 'Floods Hit Region',
    source: 'The Guardian',
    imageUrl: '',
  });
  const withImage = article({
    id: 'bbc',
    title: 'Floods Hit Region - BBC News',
    source: 'BBC News',
    imageUrl: 'https://cdn.bbc.co.uk/hero.jpg',
  });

  const result = applyArticleStoryFallbacks([imageless, withImage]);

  assert.deepEqual(
    result.map((item) => item.id),
    ['bbc'],
  );
  assert.equal(result[0]!.source, 'BBC News');
  assert.equal(result[0]!.url, withImage.url);
});

test('applyArticleStoryFallbacks keeps both when each has a hero image', () => {
  const a = article({
    id: 'a',
    title: 'Policy Shift Announced',
    source: 'NPR',
    imageUrl: 'https://cdn.example.com/a.jpg',
  });
  const b = article({
    id: 'b',
    title: 'Policy Shift Announced',
    source: 'CNN',
    imageUrl: 'https://cdn.example.com/b.jpg',
  });

  const result = applyArticleStoryFallbacks([a, b]);
  assert.deepEqual(
    result.map((item) => item.id),
    ['a', 'b'],
  );
});

test('pickBestHeroImageAlternate prefers catalog-ranked source', () => {
  const cnn = article({
    id: 'cnn',
    title: 'Rescue Under Way',
    source: 'CNN',
    imageUrl: 'https://cdn.example.com/cnn.jpg',
  });
  const bbc = article({
    id: 'bbc',
    title: 'Rescue Under Way',
    source: 'BBC News',
    imageUrl: 'https://cdn.bbc.co.uk/rescue.jpg',
  });

  assert.equal(pickBestHeroImageAlternate([cnn, bbc]).id, 'bbc');
});

test('applyArticleStoryFallbacks keeps lone imageless copy when no sibling has a hero', () => {
  const espn = article({
    id: 'espn-iwobi',
    title: "Iwobi: 'No regrets' about choosing Nigeria",
    source: 'ESPN UK Football',
    imageUrl: '',
    publishedAt: '2026-06-09T18:59:53.000Z',
  });
  const other = article({
    id: 'bbc-other',
    title: 'Different story headline',
    source: 'BBC Sport',
    imageUrl: 'https://cdn.bbc.co.uk/hero.jpg',
    publishedAt: '2026-06-09T12:00:00.000Z',
  });

  const result = applyArticleStoryFallbacks([espn, other]);

  assert.deepEqual(
    result.map((item) => item.id),
    ['espn-iwobi', 'bbc-other'],
  );
});

test('applyArticleStoryFallbacks uses best alternate when only one imageless copy exists', () => {
  const imageless = article({
    id: 'fox',
    title: 'Rescue Under Way',
    source: 'Fox News',
    imageUrl: '',
  });
  const cnn = article({
    id: 'cnn',
    title: 'Rescue Under Way',
    source: 'CNN',
    imageUrl: 'https://cdn.example.com/cnn.jpg',
  });
  const bbc = article({
    id: 'bbc',
    title: 'Rescue Under Way',
    source: 'BBC News',
    imageUrl: 'https://cdn.bbc.co.uk/rescue.jpg',
  });

  const result = applyArticleStoryFallbacks([imageless, cnn, bbc]);

  assert.deepEqual(
    result.map((item) => item.id),
    ['bbc', 'cnn'],
  );
});
