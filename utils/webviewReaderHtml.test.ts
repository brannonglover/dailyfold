import assert from 'node:assert/strict';

import { buildWebViewReaderHtml } from './webviewReaderHtml';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

run('buildWebViewReaderHtml includes title, content, and theme colors', () => {
  const html = buildWebViewReaderHtml(
    {
      title: 'Hello <World>',
      byline: 'Jane Doe',
      siteName: 'Example',
      content: '<p>Body copy</p>',
      baseUrl: 'https://example.com/story',
    },
    'light',
  );

  assert.match(html, /Hello &lt;World&gt;/);
  assert.match(html, /Jane Doe/);
  assert.match(html, /Example/);
  assert.match(html, /<p>Body copy<\/p>/);
  assert.match(html, /base href="https:\/\/example\.com\/story"/);
  assert.match(html, /#FAF9F7/);
  assert.match(html, /#1C1C1C/);
});

run('buildWebViewReaderHtml uses dark palette in dark mode', () => {
  const html = buildWebViewReaderHtml(
    {
      title: 'Night story',
      content: '<p>Dark</p>',
    },
    'dark',
  );

  assert.match(html, /#121212/);
  assert.match(html, /color-scheme: dark/);
});

run('buildWebViewReaderHtml strips Guardian registration modal copy', () => {
  const html = buildWebViewReaderHtml(
    {
      title: 'Council story',
      content: [
        '<p>...businesses deemed not to make a positive contribution to communities, such as vape shops.</p>',
        '<h2>The Guardian</h2>',
        '<h2>This is not a paywall</h2>',
        '<p>Enter your email to keep reading - for free. It takes just 30 seconds</p>',
        '<p>Not signed in...?</p>',
      ].join(''),
    },
    'dark',
  );

  assert.match(html, /vape shops/);
  assert.doesNotMatch(html, /This is not a paywall/i);
  assert.doesNotMatch(html, /Not signed in/i);
  assert.doesNotMatch(html, /Enter your email to keep reading/i);
});
