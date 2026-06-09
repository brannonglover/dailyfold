import assert from 'node:assert/strict';

import { normalizeFeedItem, upgradeFeedImageUrl } from './normalize';
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

run('Guardian signed URL keeps original width', () => {
  const input =
    'https://i.guim.co.uk/img/media/3fa5549e324cf27a4b2597905a7f1e3c3b9b825f/0_0_3524_2818/master/3524.jpg?width=140&quality=85&auto=format&fit=max&s=abc';
  const out = upgradeFeedImageUrl(input);
  assert.equal(out, input);
});

run('Guardian unsigned URL still upgrades small width', () => {
  const input =
    'https://i.guim.co.uk/img/media/3fa5549e324cf27a4b2597905a7f1e3c3b9b825f/0_0_3524_2818/master/3524.jpg?width=140&quality=85&auto=format&fit=max';
  const out = upgradeFeedImageUrl(input);
  assert.match(out, /width=960/);
  assert.doesNotMatch(out, /width=140/);
});

run('Guardian RSS picks largest signed media:content', () => {
  const feed: FeedConfig = {
    id: 'guardian',
    url: 'https://www.theguardian.com/world/rss',
    source: 'The Guardian',
    topics: ['world', 'politics'],
    primaryTopic: 'world',
  };

  const normalized = normalizeFeedItem(
    {
      title: 'Test story',
      link: 'https://www.theguardian.com/world/2026/jun/09/test-story',
      mediaContent: [
        {
          $: {
            width: '140',
            url: 'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=140&quality=85&auto=format&fit=max&s=small',
          },
        },
        {
          $: {
            width: '700',
            url: 'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=700&quality=85&auto=format&fit=max&s=large',
          },
        },
      ],
    },
    feed,
  );

  assert.equal(
    normalized?.article.imageUrl,
    'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=700&quality=85&auto=format&fit=max&s=large',
  );
});

run('BBC ichef 240 → 976', () => {
  const input =
    'https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/ace7/live/5a2a25e0.jpg';
  const out = upgradeFeedImageUrl(input);
  assert.match(out, /\/standard\/976\//);
});

run('WordPress w=150 → 960', () => {
  const input = 'https://www.ms.now/wp-content/uploads/2026/05/photo.webp?w=150&h=150&crop=1';
  const out = upgradeFeedImageUrl(input);
  assert.match(out, /w=960/);
  assert.doesNotMatch(out, /h=150/);
  assert.doesNotMatch(out, /crop=1/);
});

run('WordPress -320x320 suffix removed', () => {
  const input = 'https://restofworld.org/wp-content/uploads/2026/03/Youtube-7-320x320.png';
  const out = upgradeFeedImageUrl(input);
  assert.match(out, /Youtube-7\.png$/);
  assert.doesNotMatch(out, /320x320/);
});
