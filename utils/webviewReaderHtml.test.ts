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
