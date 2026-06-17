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

run('stripAndDecodeHtml strips inline emphasis from RSS titles', () => {
  assert.equal(
    stripAndDecodeHtml('Is <i><em>Obsession</em></i> Streaming Yet?'),
    'Is Obsession Streaming Yet?',
  );
  assert.equal(stripAndDecodeHtml('Tom &amp; Jerry'), 'Tom & Jerry');
  assert.equal(stripAndDecodeHtml('Line one<br>Line two'), 'Line one Line two');
});

run('stripAndDecodeHtml strips entity-encoded markup from RSS descriptions', () => {
  assert.equal(
    stripAndDecodeHtml(
      '&lt;p&gt;Kick-off time&lt;br&gt;&lt;a href="https://example.com"&gt;Player guide&lt;/a&gt;&lt;/p&gt;',
    ),
    'Kick-off time Player guide',
  );
});
