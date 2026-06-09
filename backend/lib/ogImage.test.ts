import assert from 'node:assert/strict';
import test from 'node:test';

import {
  articleNeedsHeroEnrichment,
  isEspnFeedUrl,
  parseOgImageUrl,
  parsePageHeroImageUrl,
} from './ogImage';

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

test('isEspnFeedUrl matches ESPN feed hosts', () => {
  assert.equal(isEspnFeedUrl('https://www.espn.co.uk/espn/rss/football/news'), true);
  assert.equal(isEspnFeedUrl('https://www.espn.com/espn/rss/soccer/news'), true);
  assert.equal(isEspnFeedUrl('https://feeds.bbci.co.uk/sport/football/rss.xml'), false);
});
