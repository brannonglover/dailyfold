import assert from 'node:assert/strict';
import test from 'node:test';

import { FALLBACK_SOURCES } from '@/data/sources';
import { buildNotForMeOptions } from '@/services/notForMeOptions';
import {
  scheduleLoadNotForMeOptions,
  scheduleWarmNotForMeOptions,
} from '@/services/notForMeOptionsSchedule';
import { Article } from '@/types';

const nflArticle: Article = {
  id: 'schedule-nfl-1',
  title: 'NFL draft picks reshape the AFC',
  excerpt: 'Quarterbacks and wide receivers headline the latest moves',
  body: 'body',
  source: 'Yahoo Sports',
  imageUrl: 'https://example.com/nfl.jpg',
  topics: ['sports'],
  sportTags: ['football'],
  readTimeMinutes: 4,
  publishedAt: '2026-06-01T12:00:00Z',
  url: 'https://example.com/nfl',
};

function waitForOptions(
  article: Article,
  sources: typeof FALLBACK_SOURCES,
  timeoutMs = 100,
): Promise<ReturnType<typeof buildNotForMeOptions>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out waiting for options')), timeoutMs);
    scheduleLoadNotForMeOptions(article, sources, (options) => {
      clearTimeout(timer);
      resolve(options);
    });
  });
}

test('scheduleLoadNotForMeOptions delivers cached options quickly', async () => {
  buildNotForMeOptions(nflArticle, FALLBACK_SOURCES);
  const options = await waitForOptions(nflArticle, FALLBACK_SOURCES);
  assert.ok(options.some((option) => option.label === 'Show less Yahoo Sports'));
});

test('scheduleLoadNotForMeOptions delivers uncached options without InteractionManager', async () => {
  const article = { ...nflArticle, id: 'schedule-uncached-test' };
  const options = await waitForOptions(article, FALLBACK_SOURCES);
  assert.ok(options.some((option) => option.label === 'Show less NFL'));
});

test('scheduleWarmNotForMeOptions primes cache for later load', async () => {
  const article = { ...nflArticle, id: 'schedule-warm-test' };
  const cancel = scheduleWarmNotForMeOptions(article, FALLBACK_SOURCES);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  cancel();
  const options = await waitForOptions(article, FALLBACK_SOURCES);
  assert.ok(options.some((option) => option.label === 'Show less Sports'));
});
