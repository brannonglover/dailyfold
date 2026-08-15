import assert from 'node:assert/strict';
import test from 'node:test';

import { filterArticlesByTopics, nextEnabledTopics } from '@/services/topicPreferences';
import type { Article, Topic } from '@/types';

test('nextEnabledTopics selects one chip from All', () => {
  assert.deepEqual(nextEnabledTopics([], 'world'), ['world']);
  assert.deepEqual(nextEnabledTopics([], 'design'), ['design']);
});

test('nextEnabledTopics replaces the previous chip instead of appending', () => {
  assert.deepEqual(nextEnabledTopics(['world'], 'sports'), ['sports']);
  assert.deepEqual(nextEnabledTopics(['sports'], 'world'), ['world']);
  assert.deepEqual(nextEnabledTopics([], 'health'), ['health']);
  assert.deepEqual(nextEnabledTopics(['sports'], 'health'), ['health']);
  assert.deepEqual(nextEnabledTopics(['health'], 'design'), ['design']);
});

test('nextEnabledTopics tapping the selected chip returns to All', () => {
  assert.deepEqual(nextEnabledTopics(['sports'], 'sports'), []);
  assert.deepEqual(nextEnabledTopics(['design'], 'design'), []);
});

test('filterArticlesByTopics keeps health-primary rows tagged only as science', () => {
  const articles: Article[] = [
    {
      id: 'mx-science',
      title: 'New study maps protein folding',
      excerpt: 'excerpt',
      body: 'body',
      source: 'Medical Xpress',
      imageUrl: 'https://example.com/mx.jpg',
      topics: ['science'],
      readTimeMinutes: 4,
      publishedAt: '2026-08-15T12:00:00.000Z',
      url: 'https://example.com/mx',
    },
    {
      id: 'wired',
      title: 'A new chip',
      excerpt: 'excerpt',
      body: 'body',
      source: 'Wired',
      imageUrl: 'https://example.com/w.jpg',
      topics: ['technology'],
      readTimeMinutes: 4,
      publishedAt: '2026-08-15T12:00:00.000Z',
      url: 'https://example.com/w',
    },
  ];
  const sourcePrimary = new Map<string, Topic>([
    ['Medical Xpress', 'health'],
    ['Wired', 'technology'],
  ]);
  const result = filterArticlesByTopics(articles, ['health'], sourcePrimary);
  assert.deepEqual(result.map((a) => a.id), ['mx-science']);
});
