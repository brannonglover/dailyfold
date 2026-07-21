import assert from 'node:assert/strict';
import test from 'node:test';

import { getArticleById, upsertArticle } from './db';
import { getSql } from './postgres';
import { parseFeedPublishedAt } from './normalize';
import type { Article } from './types';
import type { Topic } from './types';

const hasDatabaseUrl = !!process.env.DATABASE_URL?.trim();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

test('upsertArticle preserves published_at when feed has no publish date', { skip: !hasDatabaseUrl }, async () => {
  const id = `preserve-date-${runId}`;

  try {
    const article = worldArticle({
      id,
      url: `https://example.com/preserve-date-${runId}`,
    });

    await upsertArticle(article, { feedPublishedAt: '2026-06-01T12:00:00.000Z' });

    await upsertArticle(
      {
        ...article,
        title: 'Story (updated)',
        publishedAt: '2026-06-04T18:00:00.000Z',
      },
      {},
    );

    const stored = await getArticleById(id);
    assert.equal(stored?.title, 'Story (updated)');
    assert.equal(stored?.publishedAt, '2026-06-01T12:00:00.000Z');
  } finally {
    const sql = getSql();
    await sql`DELETE FROM articles WHERE id = ${id}`;
  }
});

test('upsertArticle updates published_at when feed provides a new date', { skip: !hasDatabaseUrl }, async () => {
  const id = `update-date-${runId}`;

  try {
    const article = worldArticle({
      id,
      url: `https://example.com/update-date-${runId}`,
    });

    await upsertArticle(article, { feedPublishedAt: '2026-06-01T12:00:00.000Z' });
    await upsertArticle(article, { feedPublishedAt: '2026-06-02T09:00:00.000Z' });

    const stored = await getArticleById(id);
    assert.equal(stored?.publishedAt, '2026-06-02T09:00:00.000Z');
  } finally {
    const sql = getSql();
    await sql`DELETE FROM articles WHERE id = ${id}`;
  }
});
