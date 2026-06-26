import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resetDbConnectionForTests, searchArticles, upsertArticle } from './db';
import type { Article } from './types';

function bikeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'bike-article',
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
    url: 'https://example.com/bike-review',
    ...overrides,
  };
}

test('searchArticles finds matches across title, body, and search tags via FTS', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dailyfold-db-search-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(dir, 'test.db');

  try {
    resetDbConnectionForTests();
    upsertArticle(bikeArticle());
    upsertArticle(
      bikeArticle({
        id: 'other',
        title: 'Market wrap',
        excerpt: 'Stocks moved higher',
        body: 'Equities rallied after earnings.',
        topics: ['business'],
        sportTags: undefined,
        searchTags: ['finance', 'stocks'],
        url: 'https://example.com/market',
      }),
    );

    const mtbResults = searchArticles('MTB');
    assert.equal(mtbResults.length, 1);
    assert.equal(mtbResults[0]?.id, 'bike-article');

    const bodyResults = searchArticles('singletrack');
    assert.equal(bodyResults.length, 1);
    assert.equal(bodyResults[0]?.id, 'bike-article');
  } finally {
    resetDbConnectionForTests();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('upsertArticle generates search tags when missing', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'dailyfold-db-tags-'));
  const previousPath = process.env.DATABASE_PATH;
  process.env.DATABASE_PATH = path.join(dir, 'test.db');

  try {
    resetDbConnectionForTests();
    const { searchTags: _ignored, ...withoutTags } = bikeArticle();
    upsertArticle(withoutTags);

    const results = searchArticles('mountain bike');
    assert.equal(results.length, 1);
    assert.ok((results[0]?.searchTags?.length ?? 0) > 0);
  } finally {
    resetDbConnectionForTests();
    if (previousPath === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = previousPath;
    rmSync(dir, { recursive: true, force: true });
  }
});
