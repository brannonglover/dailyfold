import assert from 'node:assert/strict';
import test from 'node:test';

import {
  articleNeedsHeroEnrichment,
  fetchPageOgImageUrl,
  isEspnFeedUrl,
  isTimeoutError,
  parseOgImageUrl,
  parsePageHeroImageUrl,
} from './ogImage';

const BROKEN_GUARDIAN =
  'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=960&quality=85&auto=format&fit=max&s=small';

const IWOBi_VIDEO_FIXTURE = `
<head>
  <meta property="og:image" content="https://a4.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0609%2Fr1670140_1296x729_16%2D9.jpg"/>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"VideoObject","name":"Morocco face injury crisis right before World Cup","thumbnailURL":"https://a.espncdn.com/media/motion/2026/0608/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup.jpg"}
  </script>
</head>`;

test('parseOgImageUrl reads og:image from ESPN article HTML', () => {
  const html = `
    <head>
      <meta property="og:image" content="https://a4.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0609%2Fr1670140_1296x729_16%2D9.jpg"/>
    </head>
  `;

  assert.equal(
    parseOgImageUrl(html),
    'https://a4.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0609%2Fr1670140_1296x729_16%2D9.jpg',
  );
});

test('parseOgImageUrl returns null when no social image tags exist', () => {
  assert.equal(parseOgImageUrl('<html><head><title>Story</title></head></html>'), null);
});

test('parsePageHeroImageUrl normalizes ESPN combiner og:image to direct photo URL', () => {
  assert.equal(
    parsePageHeroImageUrl(IWOBi_VIDEO_FIXTURE),
    'https://a.espncdn.com/photo/2026/0609/r1670140_1296x729_16-9.jpg',
  );
});

test('parsePageHeroImageUrl falls back to VideoObject thumbnail when og:image is missing', () => {
  const html = `
    <head>
      <script type="application/ld+json">
        {"@type":"VideoObject","thumbnailURL":"https://a.espncdn.com/media/motion/2026/0608/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup.jpg"}
      </script>
      <link rel="preload" as="image" href="https://a.espncdn.com/combiner/i?img=%2Fmedia%2Fmotion%2F2026%2F0608%2Fdm_260608_Morocco_face_injury_crisis_right_before_World_Cup%2Fdm_260608_Morocco_face_injury_crisis_right_before_World_Cup.jpg&w=943"/>
    </head>`;

  assert.equal(
    parsePageHeroImageUrl(html),
    'https://a.espncdn.com/media/motion/2026/0608/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup.jpg',
  );
});

test('articleNeedsHeroEnrichment is true for empty and placeholder URLs', () => {
  assert.equal(articleNeedsHeroEnrichment(''), true);
  assert.equal(articleNeedsHeroEnrichment('   '), true);
  assert.equal(articleNeedsHeroEnrichment(undefined), true);
  assert.equal(
    articleNeedsHeroEnrichment(
      'https://images.unsplash.com/photo-1504711434966-e33886168f5c?w=800&q=80',
    ),
    true,
  );
  assert.equal(articleNeedsHeroEnrichment('https://cdn.example.com/hero.jpg'), false);
});

test('articleNeedsHeroEnrichment is true for broken Guardian signed URLs', () => {
  assert.equal(articleNeedsHeroEnrichment(BROKEN_GUARDIAN), true);
  assert.equal(
    articleNeedsHeroEnrichment(
      'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=700&quality=85&auto=format&fit=max&s=large',
    ),
    false,
  );
});

test('isEspnFeedUrl matches ESPN feed hosts', () => {
  assert.equal(isEspnFeedUrl('https://www.espn.co.uk/espn/rss/football/news'), true);
  assert.equal(isEspnFeedUrl('https://www.espn.com/espn/rss/soccer/news'), true);
  assert.equal(isEspnFeedUrl('https://feeds.bbci.co.uk/sport/football/rss.xml'), false);
});

test('isTimeoutError recognizes abort and timeout failures', () => {
  assert.equal(isTimeoutError(Object.assign(new Error('Aborted'), { name: 'AbortError' })), true);
  assert.equal(isTimeoutError(new Error('Request timed out after 12000ms')), true);
  assert.equal(isTimeoutError(new Error('HTTP 404')), false);
});

test('fetchPageOgImageUrl returns null when the hard deadline aborts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
      });
    })) as typeof fetch;

  try {
    let timedOut = false;
    const result = await fetchPageOgImageUrl('https://example.com/slow', 50, {
      onTimeout: () => {
        timedOut = true;
      },
    });
    assert.equal(result, null);
    assert.equal(timedOut, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchPageOgImageUrl returns null after too many redirects', async () => {
  const originalFetch = globalThis.fetch;
  let hops = 0;
  globalThis.fetch = (async () => {
    hops += 1;
    return new Response(null, {
      status: 302,
      headers: { location: `https://example.com/loop-${hops}` },
    });
  }) as typeof fetch;

  try {
    const result = await fetchPageOgImageUrl('https://example.com/start', 5_000);
    assert.equal(result, null);
    assert.ok(hops > 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('parseOgImageUrl reads Guardian og:image from article HTML', () => {
  const html = `
    <head>
      <meta property="og:image" content="https://i.guim.co.uk/img/media/e568abb057651e11af43846809a978df3c5a45ff/0_0_1500_1200/master/1500.jpg?width=1200&amp;height=630&amp;quality=85&amp;auto=format&amp;fit=crop&amp;s=abc123"/>
    </head>
  `;

  assert.match(parseOgImageUrl(html) ?? '', /i\.guim\.co\.uk\/img\/media\//);
  assert.match(parseOgImageUrl(html) ?? '', /width=1200/);
});
