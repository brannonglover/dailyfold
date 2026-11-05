import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';
import { applyArticleStoryFallbacks } from '@/utils/articleStoryFallback';
import {
  articleStoryKey,
  articlesAreSameStory,
  hasRealHeroImage,
  normalizeStoryTitle,
  pickBestHeroImageAlternate,
  storyTitlesMatch,
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

test('storyTitlesMatch links related headlines about the same event', () => {
  assert.equal(
    storyTitlesMatch(
      'World Cup ref from Somalia denied entry to U.S.',
      "Wright on ref denied entry: 'World Cup of chaos'",
    ),
    true,
  );
});

test('storyTitlesMatch rejects unrelated headlines on the same day', () => {
  assert.equal(
    storyTitlesMatch('Lakers win in overtime thriller', 'Lakers trade deadline rumors swirl'),
    false,
  );
});

test('articlesAreSameStory matches related headlines within 48 hours', () => {
  const early = article({
    id: 'a',
    title: 'World Cup ref from Somalia denied entry to U.S.',
    source: 'ESPN',
    publishedAt: '2026-06-09T10:00:00.000Z',
  });
  const sameDay = article({
    id: 'b',
    title: "Wright on ref denied entry: 'World Cup of chaos'",
    source: 'ESPN',
    publishedAt: '2026-06-09T18:00:00.000Z',
  });
  const nextDay = article({
    id: 'c',
    title: "Wright on ref denied entry: 'World Cup of chaos'",
    source: 'ESPN',
    publishedAt: '2026-06-10T18:00:00.000Z',
  });

  assert.equal(articlesAreSameStory(early, sameDay), true);
  assert.equal(articlesAreSameStory(early, nextDay), true);
});

test('articlesAreSameStory ignores identical headlines after 48 hours', () => {
  const older = article({
    id: 'a',
    title: 'Markets Rally',
    source: 'CNN',
    publishedAt: '2026-06-01T12:00:00.000Z',
  });
  const recent = article({
    id: 'b',
    title: 'Markets Rally',
    source: 'BBC News',
    publishedAt: '2026-06-04T12:00:00.000Z',
  });

  assert.equal(articlesAreSameStory(older, recent), false);
});

test('applyArticleStoryFallbacks collapses identical cross-outlet headlines on adjacent days', () => {
  const espnSoccer = article({
    id: 'espn-soccer',
    title: 'Mbappé bags hat trick as Madrid stars shine in win',
    source: 'ESPN Soccer',
    topics: ['sports'],
    imageUrl: 'https://a.espncdn.com/photo/mbappe.jpg',
    publishedAt: '2026-08-26T22:00:00.000Z',
  });
  const espnUk = article({
    id: 'espn-uk',
    title: 'Mbappé bags hat trick as Madrid stars shine in win',
    source: 'ESPN UK Football',
    topics: ['sports'],
    imageUrl: 'https://a.espncdn.com/photo/mbappe-uk.jpg',
    publishedAt: '2026-08-27T06:00:00.000Z',
  });

  const result = applyArticleStoryFallbacks([espnSoccer, espnUk]);
  assert.equal(result.length, 1);
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

test('applyArticleStoryFallbacks keeps one copy when each has a hero image', () => {
  const cnn = article({
    id: 'cnn',
    title: 'Policy Shift Announced',
    source: 'CNN',
    imageUrl: 'https://cdn.example.com/cnn.jpg',
  });
  const bbc = article({
    id: 'bbc',
    title: 'Policy Shift Announced',
    source: 'BBC News',
    imageUrl: 'https://cdn.bbc.co.uk/policy.jpg',
  });

  const result = applyArticleStoryFallbacks([cnn, bbc]);
  assert.deepEqual(
    result.map((item) => item.id),
    ['bbc'],
  );
});

test('applyArticleStoryFallbacks dedupes fuzzy same-story headlines and prefers hero image', () => {
  const imageless = article({
    id: 'espn-headline',
    title: 'World Cup ref from Somalia denied entry to U.S.',
    source: 'ESPN UK Football',
    imageUrl: '',
    publishedAt: '2026-06-09T12:00:00.000Z',
  });
  const withPhoto = article({
    id: 'espn-commentary',
    title: "Wright on ref denied entry: 'World Cup of chaos'",
    source: 'ESPN UK Football',
    imageUrl: 'https://a.espncdn.com/photo/2026/0609/referee.jpg',
    publishedAt: '2026-06-09T13:00:00.000Z',
  });

  const result = applyArticleStoryFallbacks([imageless, withPhoto]);

  assert.deepEqual(
    result.map((item) => item.id),
    ['espn-commentary'],
  );
  assert.equal(result[0]!.imageUrl, withPhoto.imageUrl);
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

test('normalizeStoryTitle strips live blog suffixes and live colons', () => {
  assert.equal(
    normalizeStoryTitle('Middle East crisis live: Trump teases attack'),
    normalizeStoryTitle('Middle East crisis: Trump teases attack'),
  );
  assert.equal(
    normalizeStoryTitle('Water cannon deployed in Belfast – live'),
    normalizeStoryTitle('Water cannon deployed in Belfast'),
  );
});

test('applyArticleStoryFallbacks drops lone imageless copy when no sibling has a hero', () => {
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
    ['bbc-other'],
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
    ['bbc'],
  );
});

test('applyArticleStoryFallbacks reuses the result for the same pool array', () => {
  const pool = [
    article({ id: 'a', title: 'Markets Rally On Rate Cut Hopes', source: 'BBC News', imageUrl: 'https://cdn.example.com/a.jpg' }),
    article({ id: 'b', title: 'Wildfire Spreads Near Town', source: 'CNN', imageUrl: 'https://cdn.example.com/b.jpg' }),
  ];
  assert.equal(applyArticleStoryFallbacks(pool), applyArticleStoryFallbacks(pool));
});

test('applyArticleStoryFallbacks recomputes when the pool array grows in place', () => {
  const pool = [
    article({ id: 'a', title: 'Markets Rally On Rate Cut Hopes', source: 'BBC News', imageUrl: 'https://cdn.example.com/a.jpg' }),
    article({ id: 'b', title: 'Wildfire Spreads Near Town', source: 'CNN', imageUrl: 'https://cdn.example.com/b.jpg' }),
  ];
  const first = applyArticleStoryFallbacks(pool);
  pool.push(article({ id: 'c', title: 'Local Team Wins Championship Final', source: 'ESPN', imageUrl: 'https://cdn.example.com/c.jpg' }));
  const second = applyArticleStoryFallbacks(pool);
  assert.notEqual(first, second);
  assert.equal(second.length, first.length + 1);
});

// ---- Incremental clustering must match a from-scratch pass exactly ------------------

import { clusterStoryArticleIndices, clusterStoryArticleIndicesFull } from '@/utils/articleStoryMatch';

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const VOCAB = [
  'senate', 'budget', 'deal', 'storm', 'coast', 'market', 'rally', 'election', 'result',
  'champions', 'final', 'launch', 'rocket', 'strike', 'union', 'climate', 'summit',
  'vaccine', 'trial', 'merger', 'earnings', 'outage', 'cyber', 'attack', 'verdict',
];

function randomPool(random: () => number, count: number, dayRange: number[]): Article[] {
  return Array.from({ length: count }, (_, index) => {
    const words = Array.from({ length: 3 + Math.floor(random() * 5) }, () =>
      VOCAB[Math.floor(random() * VOCAB.length)]!,
    );
    // Occasionally repeat a word so token-overlap orientation matters.
    if (random() < 0.2) words.push(words[0]!);
    const day = dayRange[Math.floor(random() * dayRange.length)]!;
    const hour = Math.floor(random() * 24);
    return article({
      id: `r${index}`,
      title: words.join(' '),
      source: 'Wire',
      imageUrl: 'https://cdn.example.com/x.jpg',
      publishedAt: new Date(Date.UTC(2026, 5, day, hour)).toISOString(),
    });
  });
}

test('incremental clustering equals a full pass across growing pools', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const random = seededRandom(seed);
    // Appended rows mostly land on existing/edge days; some seeds also add in-between days.
    const base = randomPool(random, 80, [10, 11, 13, 14]);
    const growth = randomPool(random, 60, seed % 2 === 0 ? [9, 10, 14, 15, 16] : [9, 10, 11, 12, 13, 14, 15]);
    growth.forEach((item, i) => { (item as { id: string }).id = `g${i}`; });

    let pool = base;
    assert.deepEqual(clusterStoryArticleIndices(pool), clusterStoryArticleIndicesFull(pool), `seed ${seed} base`);
    for (let step = 0; step < growth.length; step += 15) {
      pool = [...pool, ...growth.slice(step, step + 15)];
      assert.deepEqual(
        clusterStoryArticleIndices(pool),
        clusterStoryArticleIndicesFull(pool),
        `seed ${seed} step ${step}`,
      );
    }
  }
});
