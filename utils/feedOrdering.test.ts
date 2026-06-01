import assert from 'node:assert/strict';
import test from 'node:test';

import { Article } from '@/types';

import { interleaveByPrimaryTopic, orderLatestFeed } from '@/utils/feedOrdering';

function article(id: string, topic: Article['topics'][number], publishedAt: string): Article {
  return {
    id,
    title: id,
    excerpt: 'excerpt',
    body: 'body',
    source: `Source ${topic}`,
    imageUrl: 'https://example.com/1.jpg',
    topics: [topic],
    readTimeMinutes: 3,
    publishedAt,
    url: `https://example.com/${id}`,
  };
}

test('interleaveByPrimaryTopic mixes topics when sports dominates by count', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const sports = Array.from({ length: 12 }, (_, i) =>
    article(`sport-${i}`, 'sports', recent(i * 1000)),
  );
  const world = Array.from({ length: 3 }, (_, i) =>
    article(`world-${i}`, 'world', recent(20_000 + i * 1000)),
  );
  const tech = Array.from({ length: 2 }, (_, i) =>
    article(`tech-${i}`, 'technology', recent(30_000 + i * 1000)),
  );

  const ordered = interleaveByPrimaryTopic([...sports, ...world, ...tech]);
  const firstSixTopics = ordered.slice(0, 6).map((a) => a.topics[0]);
  const uniqueInHead = new Set(firstSixTopics);

  assert.ok(uniqueInHead.size >= 2, `expected mixed topics, got ${[...uniqueInHead].join(', ')}`);
});

test('orderLatestFeed diversifyTopics surfaces non-sports in the first cards', () => {
  const now = Date.now();
  const recent = (offsetMs: number) => new Date(now - offsetMs).toISOString();

  const sports = Array.from({ length: 20 }, (_, i) =>
    article(`sport-${i}`, 'sports', recent(i * 1000)),
  );
  const world = [article('world-0', 'world', recent(25_000))];

  const ordered = orderLatestFeed([...sports, ...world], { diversifyTopics: true });
  const firstFiveTopics = ordered.slice(0, 5).map((a) => a.topics[0]);

  assert.ok(
    firstFiveTopics.some((topic) => topic !== 'sports'),
    `expected a non-sports card near the top, got ${firstFiveTopics.join(', ')}`,
  );
});
