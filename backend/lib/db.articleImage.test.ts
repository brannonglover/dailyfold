import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { getArticleById, resetDbConnectionForTests, upsertArticle } from './db';
import type { Article } from './types';

const BROKEN_GUARDIAN =
  'https://i.guim.co.uk/img/media/e0b90e442639d06b13d065aea5ae44a671c0f5fc/0_0_2503_2003/master/2503.jpg?width=960&quality=85&auto=format&fit=max&s=2615715cc8dfdf29579e4d2be9959154';

function guardianArticle(imageUrl: string): Article {
  return {
    id: 'guardian-test',
    title: 'Test Guardian story',
    excerpt: 'Standfirst',
    body: 'Body',
    source: 'The Guardian',
    imageUrl,
    topics: ['world'],
    readTimeMinutes: 2,
    publishedAt: '2026-06-15T12:00:00.000Z',
    url: 'https://www.theguardian.com/world/2026/jun/15/test-story',
  };
}

test('getArticleById repairs broken Guardian heroes on read', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dailyfold-db-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(dir, 'test.db');

  try {
    resetDbConnectionForTests();
    upsertArticle(guardianArticle(BROKEN_GUARDIAN));

    const article = getArticleById('guardian-test');
    assert.match(article?.imageUrl ?? '', /width=140/);
    assert.doesNotMatch(article?.imageUrl ?? '', /width=960/);
  } finally {
    resetDbConnectionForTests();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
