import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getArticleById, resetDbConnectionForTests, upsertArticle } from './db';
import { parseFeedPublishedAt } from './normalize';
import type { Article } from './types';
import type { Topic } from './types';

function worldArticle(
  overrides: Partial<Article> & Pick<Article, 'id' | 'url'>,
): Article {
  return {
    title: 'Story',
    excerpt: 'excerpt',
    body: 'body',
    source: 'Test Source',
    imageUrl: 'https://example.com/img.jpg',
    topics: ['world'] as Topic[],
    readTimeMinutes: 3,
    publishedAt: '2026-06-01T12:00:00.000Z',
    ...overrides,
  };
}

test('parseFeedPublishedAt returns undefined for missing or invalid dates', () => {
  assert.equal(parseFeedPublishedAt(undefined), undefined);
  assert.equal(parseFeedPublishedAt(''), undefined);
  assert.equal(parseFeedPublishedAt('not-a-date'), undefined);
});

test('parseFeedPublishedAt parses valid RSS dates', () => {
  assert.equal(
    parseFeedPublishedAt('Sun, 01 Jun 2026 12:00:00 GMT'),
    new Date('Sun, 01 Jun 2026 12:00:00 GMT').toISOString(),
  );
});

test('upsertArticle preserves published_at when feed has no publish date', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'beacon-db-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  resetDbConnectionForTests();

  try {
    const article = worldArticle({
      id: 'preserve-date',
      url: 'https://example.com/preserve-date',
    });

    upsertArticle(article, { feedPublishedAt: '2026-06-01T12:00:00.000Z' });

    upsertArticle(
      {
        ...article,
        title: 'Story (updated)',
        publishedAt: '2026-06-04T18:00:00.000Z',
      },
      {},
    );

    const stored = getArticleById('preserve-date');
    assert.equal(stored?.title, 'Story (updated)');
    assert.equal(stored?.publishedAt, '2026-06-01T12:00:00.000Z');
  } finally {
    resetDbConnectionForTests();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('upsertArticle updates published_at when feed provides a new date', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'beacon-db-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  resetDbConnectionForTests();

  try {
    const article = worldArticle({
      id: 'update-date',
      url: 'https://example.com/update-date',
    });

    upsertArticle(article, { feedPublishedAt: '2026-06-01T12:00:00.000Z' });
    upsertArticle(article, { feedPublishedAt: '2026-06-02T09:00:00.000Z' });

    const stored = getArticleById('update-date');
    assert.equal(stored?.publishedAt, '2026-06-02T09:00:00.000Z');
  } finally {
    resetDbConnectionForTests();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
