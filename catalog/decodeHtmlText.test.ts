import assert from 'node:assert/strict';

import { decodeFeedText, decodeHtmlEntities, stripAndDecodeHtml } from './decodeHtmlText';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

run('decodes numeric apostrophe entity', () => {
  assert.equal(
    decodeHtmlEntities('Pebblebee&#8217;s Halo and it&#8217;s on sale'),
    "Pebblebee's Halo and it's on sale",
  );
});

run('decodes hex entity', () => {
  assert.equal(decodeHtmlEntities('it&#x2019;s fine'), "it's fine");
});

run('decodes named entities', () => {
  assert.equal(decodeHtmlEntities('Tom &amp; Jerry &mdash; classic'), 'Tom & Jerry — classic');
});

run('decodeFeedText collapses whitespace', () => {
  assert.equal(decodeFeedText('  Hello&#8217;s   world  '), "Hello's world");
});

run('stripAndDecodeHtml removes tags and entities', () => {
  assert.equal(stripAndDecodeHtml('<p>Hello&#8217;s <strong>world</strong></p>'), "Hello's world");
});
