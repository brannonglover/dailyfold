import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

import {
  CHIP_PREWARM_TTL_MS,
  chipPrewarmKey,
  clearChipPrewarmForTests,
  loadChipArticles,
  readChipPrewarm,
} from '@/services/chipPrewarm';
import { Article } from '@/types';

const story = (id: string) => ({ id }) as Article;

beforeEach(() => clearChipPrewarmForTests());

test('chipPrewarmKey ignores selection order', () => {
  assert.equal(
    chipPrewarmKey(['sports', 'world'], []),
    chipPrewarmKey(['world', 'sports'], []),
  );
});

test('a second load is served from the cache with no extra request', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [story('a')];
  };
  const key = chipPrewarmKey(['science'], []);
  await loadChipArticles(key, fetcher);
  const again = await loadChipArticles(key, fetcher);
  assert.equal(calls, 1);
  assert.deepEqual(again?.map((a) => a.id), ['a']);
});

test('a tap during an in-flight prewarm joins the running request', async () => {
  let calls = 0;
  let release!: (articles: Article[]) => void;
  const fetcher = () => {
    calls += 1;
    return new Promise<Article[]>((resolve) => {
      release = resolve;
    });
  };
  const key = chipPrewarmKey(['books'], []);
  const prewarm = loadChipArticles(key, fetcher);
  const tap = loadChipArticles(key, fetcher);
  release([story('b')]);
  assert.deepEqual((await prewarm)?.map((a) => a.id), ['b']);
  assert.deepEqual((await tap)?.map((a) => a.id), ['b']);
  assert.equal(calls, 1);
});

test('empty and failed fetches are not cached', async () => {
  const key = chipPrewarmKey(['art'], []);
  assert.equal(await loadChipArticles(key, async () => []), null);
  assert.equal(await loadChipArticles(key, async () => Promise.reject(new Error('x'))), null);
  assert.equal(readChipPrewarm(key), null);
  const retried = await loadChipArticles(key, async () => [story('c')]);
  assert.equal(retried?.length, 1);
});

test('entries expire after the TTL', async () => {
  const key = chipPrewarmKey(['design'], []);
  await loadChipArticles(key, async () => [story('d')], { nowMs: 1_000 });
  assert.ok(readChipPrewarm(key, 1_000 + CHIP_PREWARM_TTL_MS));
  assert.equal(readChipPrewarm(key, 1_001 + CHIP_PREWARM_TTL_MS), null);
});

test('bypassCache always hits the network', async () => {
  const key = chipPrewarmKey(['gaming'], []);
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    return [story(String(calls))];
  };
  await loadChipArticles(key, fetcher);
  const fresh = await loadChipArticles(key, fetcher, { bypassCache: true });
  assert.equal(calls, 2);
  assert.deepEqual(fresh?.map((a) => a.id), ['2']);
});
