import assert from 'node:assert/strict';

import { normalizeFeedItem } from './normalize';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

const guardianFeed = {
  id: 'guardian',
  url: 'https://www.theguardian.com/world/rss',
  source: 'The Guardian',
  topics: ['world', 'politics'] as const,
  primaryTopic: 'world' as const,
  logoUrl: 'https://example.com/guardian.png',
};

run('Guardian excerpt uses first RSS paragraph only', () => {
  const item = {
    title: 'Man shot during protest against proposed US Ebola quarantine facility in Kenya',
    link: 'https://www.theguardian.com/world/2026/jun/09/man-shot-during-protest-against-proposed-us-ebola-quarantine-facility-in-kenya',
    isoDate: '2026-06-09T14:28:09Z',
    content:
      '<p>Police use teargas to disperse demonstrators in Nanyuki, 120 miles from Nairobi, amid rising anger at US plans</p>' +
      '<p>A man has been shot in the head during a protest in a town in central Kenya against a proposed Ebola quarantine facility for US citizens.</p>' +
      '<p>Photographs from the scene appeared to show a person lying motionless on the ground.</p>',
    contentSnippet:
      'Police use teargas to disperse demonstrators in Nanyuki, 120 miles from Nairobi, amid rising anger at US plans\n' +
      'A man has been shot in the head during a protest in a town in central Kenya against a proposed Ebola quarantine facility for US citizens.',
  };

  const normalized = normalizeFeedItem(item, guardianFeed);
  assert.ok(normalized);

  assert.equal(
    normalized!.article.excerpt,
    'Police use teargas to disperse demonstrators in Nanyuki, 120 miles from Nairobi, amid rising anger at US plans',
  );
  assert.ok(!normalized!.article.excerpt.includes('A man has been shot'));
});

run('Guardian body preserves RSS paragraph breaks', () => {
  const item = {
    title: 'Test story',
    link: 'https://www.theguardian.com/world/2026/jun/09/test-story',
    isoDate: '2026-06-09T14:28:09Z',
    content:
      '<p>Standfirst line.</p><p>Opening paragraph.</p><p>Third teaser paragraph.</p>',
  };

  const normalized = normalizeFeedItem(item, guardianFeed);
  assert.ok(normalized);
  assert.equal(normalized!.article.body, 'Standfirst line.\n\nOpening paragraph.\n\nThird teaser paragraph.');
});

run('Single-paragraph RSS keeps prior excerpt behavior', () => {
  const item = {
    title: 'Simple story',
    link: 'https://example.com/story',
    isoDate: '2026-06-09T14:28:09Z',
    content: '<p>One paragraph only for the whole summary.</p>',
  };

  const normalized = normalizeFeedItem(item, guardianFeed);
  assert.ok(normalized);
  assert.equal(normalized!.article.excerpt, 'One paragraph only for the whole summary.');
});
