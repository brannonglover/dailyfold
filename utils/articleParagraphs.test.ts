import assert from 'node:assert/strict';

import {
  excerptMatchesArticleLede,
  resolveReaderBlockLayout,
} from './articleParagraphs';
import { Article } from '@/types';

function run(label: string, fn: () => void) {
  try {
    fn();
    console.log(`ok ${label}`);
  } catch (error) {
    console.error(`fail ${label}`);
    throw error;
  }
}

run('Guardian multi-paragraph RSS excerpt is not treated as extracted lede', () => {
  const excerpt =
    'Police use teargas to disperse demonstrators in Nanyuki, 120 miles from Nairobi, amid rising anger at US plans A man has been shot in the head during a protest in a town in central Kenya against a proposed Ebola quarantine facility for US citizens.';
  const extractedLede =
    'A man has been shot in the head during a protest in a town in central Kenya against a proposed Ebola quarantine facility for US citizens.';

  assert.equal(excerptMatchesArticleLede(extractedLede, excerpt), false);
});

run('resolveReaderBlockLayout skips feed preview for Guardian teaser excerpt', () => {
  const article = {
    id: '1',
    title: 'Man shot during protest',
    excerpt:
      'Police use teargas to disperse demonstrators in Nanyuki, 120 miles from Nairobi, amid rising anger at US plans A man has been shot in the head during a protest in a town in central Kenya against a proposed Ebola quarantine facility for US citizens.',
    body: '',
    source: 'The Guardian',
    imageUrl: 'https://example.com/image.jpg',
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: '2026-06-09T14:28:09.000Z',
    url: 'https://www.theguardian.com/world/2026/jun/09/example',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [
      {
        type: 'paragraph',
        text: 'A man has been shot in the head during a protest in a town in central Kenya against a proposed Ebola quarantine facility for US citizens.',
      },
      { type: 'paragraph', text: 'Photographs from the scene appeared to show a person lying motionless on the ground.' },
    ],
  });

  assert.equal(layout.feedLede, null);
  assert.equal(layout.bodyBlocks.length, 2);
});

run('resolveReaderBlockLayout removes leading body image that matches feed hero', () => {
  const heroUrl =
    'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=700&quality=85&auto=format&fit=max&s=large';
  const article = {
    id: '1',
    title: 'Story with hero',
    excerpt: 'Short RSS teaser that does not repeat the full opening paragraph.',
    body: '',
    source: 'The Guardian',
    imageUrl: heroUrl,
    topics: ['world'],
    readTimeMinutes: 3,
    publishedAt: '2026-06-09T14:28:09.000Z',
    url: 'https://www.theguardian.com/world/2026/jun/09/example',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [
      {
        type: 'image',
        url: 'https://i.guim.co.uk/img/media/abc/0_0_1200_800/master/1200.jpg?width=140&quality=85&auto=format&fit=max&s=small',
      },
      { type: 'paragraph', text: 'Opening paragraph from the article.' },
      { type: 'paragraph', text: 'More detail from the story body.' },
    ],
  });

  assert.equal(layout.feedLede, null);
  assert.equal(layout.bodyBlocks.length, 2);
  assert.equal(layout.bodyBlocks[0]?.type, 'paragraph');
});

run('resolveReaderBlockLayout keeps first body image when it differs from hero', () => {
  const article = {
    id: '2',
    title: 'Story with inline chart',
    excerpt: '',
    body: '',
    source: 'Reuters',
    imageUrl: 'https://cdn.example.com/hero.jpg',
    topics: ['business'],
    readTimeMinutes: 2,
    publishedAt: '2026-06-09T14:28:09.000Z',
    url: 'https://www.reuters.com/example',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [
      { type: 'image', url: 'https://cdn.example.com/chart.png' },
      { type: 'paragraph', text: 'The chart shows quarterly growth.' },
    ],
  });

  assert.equal(layout.bodyBlocks.length, 2);
  assert.equal(layout.bodyBlocks[0]?.type, 'image');
});

run('resolveReaderBlockLayout removes NPR Brightspot body image matching feed hero', () => {
  const heroUrl =
    'https://npr.brightspotcdn.com/dims3/default/strip/false/crop/4588x3839+0+0/resize/4588x3839!/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2F89%2F1e%2Fe036a5c646aabc6101b04978086b%2Fgettyimages-1293654957.jpg';
  const bodyUrl =
    'https://npr.brightspotcdn.com/dims3/default/strip/false/crop/4588x2581+0+557/resize/1400/quality/85/format/jpeg/?url=http%3A%2F%2Fnpr-brightspot.s3.amazonaws.com%2F89%2F1e%2Fe036a5c646aabc6101b04978086b%2Fgettyimages-1293654957.jpg';
  const article = {
    id: 'npr-1',
    title: 'Why ultra-processed foods could become the new war on tobacco',
    excerpt: 'Short RSS teaser that does not repeat the full opening paragraph.',
    body: '',
    source: 'NPR',
    imageUrl: heroUrl,
    topics: ['health'],
    readTimeMinutes: 3,
    publishedAt: '2026-06-09T17:02:24.000Z',
    url: 'https://www.npr.org/2026/06/09/nx-s1-5850364/why-ultra-processed-foods-could-become-the-new-war-on-tobacco',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [
      {
        type: 'image',
        url: bodyUrl,
        caption:
          'Ultra-processed foods often have added sugar and artificial flavorings, similar to how cigarettes were developed. Shana Novak/DigitalVision/Getty Images hide caption',
      },
      {
        type: 'paragraph',
        text: 'Research published in the American Journal of Public Health details the connection between ultra-processed foods and the tobacco industry when it comes to production, strategy and marketing.',
      },
    ],
  });

  assert.equal(layout.bodyBlocks.length, 1);
  assert.equal(layout.bodyBlocks[0]?.type, 'paragraph');
  assert.equal(
    layout.bodyBlocks.some((block) => block.type === 'image'),
    false,
  );
});

run('resolveReaderBlockLayout keeps leading body image when article has no hero', () => {
  const article = {
    id: '3',
    title: 'Imageless feed row',
    excerpt: '',
    body: '',
    source: 'Wire',
    imageUrl: '',
    topics: ['world'],
    readTimeMinutes: 2,
    publishedAt: '2026-06-09T14:28:09.000Z',
    url: 'https://example.com/story',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [
      { type: 'image', url: 'https://cdn.example.com/inline.jpg' },
      { type: 'paragraph', text: 'Body copy without a feed hero.' },
    ],
  });

  assert.equal(layout.bodyBlocks.length, 2);
  assert.equal(layout.bodyBlocks[0]?.type, 'image');
});
