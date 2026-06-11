import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectVideoProvider,
  normalizeEspnCdnImageUrl,
  normalizeVideoPlaybackUrl,
  parseBundesligaEmbeddedImages,
  parseJsonLdVideoEntries,
  parsePageEmbeddedVideos,
  parsePageVideoThumbnailUrls,
  supplementBlocksWithEmbeddedImages,
} from './embeddedMedia';
import type { ReaderBlock } from './extract';

const FIXTURE = `
<script>
{"b":{"slug":"why-olise-wins-golden-ball-world-cup-26-france-bayern-37746",
"media":[
  {"type":"image","desktop":{"src":"https://assets.bundesliga.com/contender/2026/5/imago1078350693.jpg?crop=0","caption":"Hero caption"}},
  {"type":"video","poster":"https://assets.bundesliga.com/video/jw/4nOjzTIm.jpg"},
  {"type":"image","desktop":{"src":"https://assets.bundesliga.com/contender/2026/5/imago1078349371.jpg?crop=0","caption":"Olise scored his first career hat-trick against Northern Ireland.","alt":"Olise celebrates"}}
]}}
</script>`;

const ESPN_VIDEO_FIXTURE = `
<head>
  <script type="application/ld+json">
    {"@type":"VideoObject","thumbnailURL":"https://a.espncdn.com/media/motion/2026/0608/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup/dm_260608_Morocco_face_injury_crisis_right_before_World_Cup.jpg"}
  </script>
  <link rel="preload" as="image" href="https://a.espncdn.com/combiner/i?img=%2Fmedia%2Fmotion%2F2026%2F0608%2Fdm_260608_Morocco_face_injury_crisis_right_before_World_Cup%2Fdm_260608_Morocco_face_injury_crisis_right_before_World_Cup.jpg&w=943"/>
</head>
<body><video poster="https://cdn.example.com/poster.jpg"></video></body>`;

const ESPN_PLAYABLE_VIDEO_FIXTURE = `
<head>
  <script type="application/ld+json">
    {"@type":"VideoObject","name":"Morocco injury update","thumbnailURL":"https://cdn.example.com/poster.jpg","contentUrl":"https://cdn.example.com/highlights.mp4"}
  </script>
</head>`;

const YOUTUBE_IFRAME_FIXTURE = `
<body>
  <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Clip"></iframe>
</body>`;

test('parsePageVideoThumbnailUrls reads JSON-LD, preload, and poster sources', () => {
  const urls = parsePageVideoThumbnailUrls(ESPN_VIDEO_FIXTURE);
  assert.equal(urls.length, 2);
  assert.match(urls[0]!, /Morocco_face_injury_crisis/);
  assert.equal(urls[1], 'https://cdn.example.com/poster.jpg');
});

test('detectVideoProvider recognizes common hosts and file extensions', () => {
  assert.equal(detectVideoProvider('https://www.youtube.com/watch?v=abc123'), 'youtube');
  assert.equal(detectVideoProvider('https://youtu.be/abc123'), 'youtube');
  assert.equal(detectVideoProvider('https://vimeo.com/123456789'), 'vimeo');
  assert.equal(detectVideoProvider('https://cdn.example.com/clip.mp4'), 'file');
  assert.equal(detectVideoProvider('https://cdn.example.com/image.jpg'), undefined);
});

test('normalizeVideoPlaybackUrl converts watch URLs to embed URLs', () => {
  assert.equal(
    normalizeVideoPlaybackUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'https://www.youtube.com/embed/dQw4w9WgXcQ',
  );
  assert.equal(
    normalizeVideoPlaybackUrl('https://vimeo.com/123456789'),
    'https://player.vimeo.com/video/123456789',
  );
  assert.equal(
    normalizeVideoPlaybackUrl('https://cdn.example.com/clip.mp4'),
    'https://cdn.example.com/clip.mp4',
  );
});

test('parseJsonLdVideoEntries extracts playable contentUrl values', () => {
  const videos = parseJsonLdVideoEntries(ESPN_PLAYABLE_VIDEO_FIXTURE);
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.url, 'https://cdn.example.com/highlights.mp4');
  assert.equal(videos[0]?.provider, 'file');
  assert.equal(videos[0]?.poster, 'https://cdn.example.com/poster.jpg');
});

test('parsePageEmbeddedVideos reads iframe embeds', () => {
  const videos = parsePageEmbeddedVideos(
    YOUTUBE_IFRAME_FIXTURE,
    'https://example.com/article',
  );
  assert.equal(videos.length, 1);
  assert.equal(videos[0]?.provider, 'youtube');
  assert.equal(videos[0]?.url, 'https://www.youtube.com/embed/dQw4w9WgXcQ');
});

test('normalizeEspnCdnImageUrl unwraps combiner photo paths', () => {
  assert.equal(
    normalizeEspnCdnImageUrl(
      'https://a4.espncdn.com/combiner/i?img=%2Fphoto%2F2026%2F0609%2Fr1670140_1296x729_16%2D9.jpg',
    ),
    'https://a.espncdn.com/photo/2026/0609/r1670140_1296x729_16-9.jpg',
  );
});

test('supplementBlocksWithEmbeddedImages prepends video thumbnail when no images exist', () => {
  const blocks: ReaderBlock[] = [
    { type: 'paragraph', text: 'Morocco are dealing with several injury concerns before the World Cup.' },
  ];

  const next = supplementBlocksWithEmbeddedImages(
    blocks,
    ESPN_VIDEO_FIXTURE,
    'https://www.espn.co.uk/espn/story/_/id/49006984/alex-iwobi-100-caps-no-regrets-choosing-nigeria-england',
  );

  assert.equal(next[0]?.type, 'image');
  assert.match(next[0]?.type === 'image' ? next[0].url : '', /Morocco_face_injury_crisis/);
});

test('supplementBlocksWithEmbeddedImages inserts playable video blocks', () => {
  const blocks: ReaderBlock[] = [
    { type: 'paragraph', text: 'Watch the latest highlights from the match below.' },
  ];

  const next = supplementBlocksWithEmbeddedImages(
    blocks,
    ESPN_PLAYABLE_VIDEO_FIXTURE,
    'https://www.espn.com/soccer/story',
  );

  const videoBlock = next.find((block) => block.type === 'video');
  assert.equal(videoBlock?.type, 'video');
  assert.equal(videoBlock.url, 'https://cdn.example.com/highlights.mp4');
  const watchIdx = next.findIndex(
    (block) => block.type === 'paragraph' && block.text.includes('Watch the latest highlights'),
  );
  const videoIdx = next.findIndex((block) => block.type === 'video');
  assert.ok(watchIdx >= 0);
  assert.ok(videoIdx > watchIdx);
});

test('parseBundesligaEmbeddedImages returns image blocks only', () => {
  const images = parseBundesligaEmbeddedImages(
    FIXTURE,
    'https://www.bundesliga.com/en/bundesliga/news/why-olise-wins-golden-ball-world-cup-26-france-bayern-37746',
  );
  assert.equal(images.length, 2);
  assert.match(images[1]!.url, /imago1078349371/);
  assert.match(images[1]!.caption ?? '', /Northern Ireland/);
});

test('supplementBlocksWithEmbeddedImages inserts missing images near related text', () => {
  const blocks: ReaderBlock[] = [
    { type: 'paragraph', text: 'Intro paragraph about Olise and Bayern Munich this season.' },
    {
      type: 'paragraph',
      text: 'Those qualities were on full display against Northern Ireland in a hat-trick performance.',
    },
    { type: 'image', url: 'https://assets.bundesliga.com/contender/2026/5/imago1078350693.jpg?crop=436' },
    { type: 'paragraph', text: 'The Golden Ball is not won by statistics alone.' },
  ];

  const next = supplementBlocksWithEmbeddedImages(
    blocks,
    FIXTURE,
    'https://www.bundesliga.com/en/bundesliga/news/why-olise-wins-golden-ball-world-cup-26-france-bayern-37746',
  );

  const imageBlocks = next.filter((block) => block.type === 'image');
  assert.equal(imageBlocks.length, 2);
  const hatTrickIdx = next.findIndex(
    (block) => block.type === 'image' && block.url.includes('imago1078349371'),
  );
  const goldenBallIdx = next.findIndex(
    (block) => block.type === 'paragraph' && block.text.includes('Golden Ball'),
  );
  assert.ok(hatTrickIdx > 0);
  assert.ok(hatTrickIdx < goldenBallIdx);
});
