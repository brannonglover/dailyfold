import assert from 'node:assert/strict';

import { normalizeFeedItem } from './normalize';
import type { FeedConfig } from './types';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

const statFeed: FeedConfig = {
  id: 'stat-news',
  url: 'https://www.statnews.com/feed/',
  source: 'STAT News',
  description: 'Health, medicine, and life sciences reporting',
  topics: ['health', 'science'],
  primaryTopic: 'health',
  logoUrl: 'https://example.com/stat.png',
};

run('health-primary feed keeps health when headline only matches science', () => {
  const normalized = normalizeFeedItem(
    {
      title: 'New study reveals physics of protein folding',
      link: 'https://www.statnews.com/2026/08/15/protein-folding-study',
      isoDate: '2026-08-15T12:00:00Z',
      contentSnippet: 'Researchers published a study of the physics behind folding.',
    },
    statFeed,
  );
  assert.ok(normalized);
  assert.ok(normalized!.article.topics.includes('health'));
  assert.ok(normalized!.article.topics.includes('science'));
});
