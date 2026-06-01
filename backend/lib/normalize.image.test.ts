import assert from 'node:assert/strict';

import { upgradeFeedImageUrl } from './normalize';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

run('Guardian width=140 → 960', () => {
  const input =
    'https://i.guim.co.uk/img/media/3fa5549e324cf27a4b2597905a7f1e3c3b9b825f/0_0_3524_2818/master/3524.jpg?width=140&quality=85&auto=format&fit=max&s=abc';
  const out = upgradeFeedImageUrl(input);
  assert.match(out, /width=960/);
  assert.doesNotMatch(out, /width=140/);
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
