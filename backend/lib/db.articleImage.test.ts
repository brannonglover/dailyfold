import assert from 'node:assert/strict';
import test from 'node:test';

import { getSql } from './postgres';
import { getArticleById, upsertArticle } from './db';
import type { Article } from './types';

const hasDatabaseUrl = !!process.env.DATABASE_URL?.trim();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const BROKEN_GUARDIAN =
  'https://i.guim.co.uk/img/media/e0b90e442639d06b13d065aea5ae44a671c0f5fc/0_0_2503_2003/master/2503.jpg?width=960&quality=85&auto=format&fit=max&s=2615715cc8dfdf29579e4d2be9959154';

function guardianArticle(imageUrl: string): Article {
  return {
    id: `guardian-test-${runId}`,
    title: 'Test Guardian story',
    excerpt: 'Standfirst',
    body: 'Body',
    source: 'The Guardian',
    imageUrl,
    topics: ['world'],
    readTimeMinutes: 2,
    publishedAt: '2026-06-15T12:00:00.000Z',
    url: `https://www.theguardian.com/world/2026/jun/15/test-story-${runId}`,
  };
}

test('getArticleById repairs broken Guardian heroes on read', { skip: !hasDatabaseUrl }, async () => {
  const id = `guardian-test-${runId}`;

  try {
    await upsertArticle(guardianArticle(BROKEN_GUARDIAN));

    const article = await getArticleById(id);
    assert.match(article?.imageUrl ?? '', /width=140/);
    assert.doesNotMatch(article?.imageUrl ?? '', /width=960/);
  } finally {
    const sql = getSql();
    await sql`DELETE FROM articles WHERE id = ${id}`;
  }
});
