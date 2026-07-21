import assert from 'node:assert/strict';
import test from 'node:test';

import { getSql } from './postgres';
import { searchArticles, upsertArticle } from './db';
import type { Article } from './types';

// These tests hit the real Postgres database in DATABASE_URL (Supabase), using
// unique per-run ids/urls so they never collide with real data, cleaned up below.
const hasDatabaseUrl = !!process.env.DATABASE_URL?.trim();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function bikeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: `bike-article-${runId}`,
    title: 'Trail bike review',
    excerpt: 'A capable mountain bike for enduro riders',
    body: 'We tested suspension kinematics on rocky singletrack with multiple mtb builds.',
    source: 'Bike Journal',
    imageUrl: 'https://example.com/bike.jpg',
    topics: ['sports'],
    sportTags: ['mtb'],
    searchTags: ['mtb', 'mountain bike', 'cycling', 'trail'],
    readTimeMinutes: 4,
    publishedAt: '2026-06-01T12:00:00.000Z',
    url: `https://example.com/bike-review-${runId}`,
    ...overrides,
  };
}

async function cleanup(ids: string[]) {
  const sql = getSql();
  await sql`DELETE FROM articles WHERE id = ANY(${ids}::text[])`;
}

test('searchArticles finds matches across title, body, and search tags via FTS', { skip: !hasDatabaseUrl }, async () => {
  const otherId = `other-${runId}`;
  const ids = [`bike-article-${runId}`, otherId];

  try {
    await upsertArticle(bikeArticle());
    await upsertArticle(
      bikeArticle({
        id: otherId,
        title: 'Market wrap',
        excerpt: 'Stocks moved higher',
        body: 'Equities rallied after earnings.',
        topics: ['business'],
        sportTags: undefined,
        searchTags: ['finance', 'stocks'],
        url: `https://example.com/market-${runId}`,
      }),
    );

    const mtbResults = await searchArticles('MTB');
    assert.ok(mtbResults.some((a) => a.id === `bike-article-${runId}`));
    assert.ok(!mtbResults.some((a) => a.id === otherId));

    const bodyResults = await searchArticles('singletrack');
    assert.ok(bodyResults.some((a) => a.id === `bike-article-${runId}`));
  } finally {
    await cleanup(ids);
  }
});

test('upsertArticle generates search tags when missing', { skip: !hasDatabaseUrl }, async () => {
  const id = `bike-article-tags-${runId}`;

  try {
    const { searchTags: _ignored, ...withoutTags } = bikeArticle({
      id,
      url: `https://example.com/bike-review-tags-${runId}`,
    });
    await upsertArticle(withoutTags);

    const results = await searchArticles('mountain bike');
    const match = results.find((a) => a.id === id);
    assert.ok(match);
    assert.ok((match?.searchTags?.length ?? 0) > 0);
  } finally {
    await cleanup([id]);
  }
});
