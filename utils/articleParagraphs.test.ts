import assert from 'node:assert/strict';

import {
  excerptMatchesArticleLede,
  feedBlocksFromArticle,
  isUsableReaderParagraphText,
  resolveReaderBlockLayout,
  resolveReaderContentForArticle,
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

run('isUsableReaderParagraphText rejects nullish and placeholder strings', () => {
  assert.equal(isUsableReaderParagraphText(null), false);
  assert.equal(isUsableReaderParagraphText(undefined), false);
  assert.equal(isUsableReaderParagraphText(''), false);
  assert.equal(isUsableReaderParagraphText('   '), false);
  assert.equal(isUsableReaderParagraphText('null'), false);
  assert.equal(isUsableReaderParagraphText('NULL'), false);
  assert.equal(isUsableReaderParagraphText('undefined'), false);
  assert.equal(isUsableReaderParagraphText('Real article copy.'), true);
});

run('feedBlocksFromArticle ignores nullish body and placeholder excerpt', () => {
  const article = {
    id: 'espn-1',
    title: 'Soccer headline',
    excerpt: 'null',
    body: 'null',
    source: 'ESPN Soccer',
    imageUrl: 'https://example.com/hero.jpg',
    topics: ['sports'],
    readTimeMinutes: 2,
    publishedAt: '2026-06-10T12:00:00.000Z',
    url: 'https://www.espn.com/soccer/story/_/id/example',
  } satisfies Article;

  assert.deepEqual(feedBlocksFromArticle(article), []);
});

run('resolveReaderBlockLayout drops extracted paragraph blocks with null text', () => {
  const article = {
    id: 'espn-2',
    title: 'Soccer headline',
    excerpt: '',
    body: '',
    source: 'ESPN Soccer',
    imageUrl: 'https://example.com/hero.jpg',
    topics: ['sports'],
    readTimeMinutes: 2,
    publishedAt: '2026-06-10T12:00:00.000Z',
    url: 'https://www.espn.com/soccer/story/_/id/example',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [{ type: 'paragraph', text: null as unknown as string }],
  });

  assert.equal(layout.bodyBlocks.length, 0);
  assert.equal(layout.feedLede, null);
});

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

run('resolveReaderBlockLayout shows feed excerpt as body when extraction is missing', () => {
  const excerpt =
    "'Luca' director Enrico Casarosa returns with another Italy-set tale, hitting theaters March 5, 2027.";
  const article = {
    id: 'gatto',
    title: "Pixar's Kitty Adventure 'Gatto' Looks Purrfectly Delightful",
    excerpt,
    body: '',
    source: 'Gizmodo',
    imageUrl: 'https://example.com/hero.jpg',
    topics: ['movies'],
    readTimeMinutes: 3,
    publishedAt: '2026-06-10T12:00:00.000Z',
    url: 'https://gizmodo.com/gatto-trailer-pixar-movie-film-animated-2000770681',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({ article, extractedBlocks: null });

  assert.equal(layout.feedLede, null);
  assert.equal(layout.bodyBlocks.length, 1);
  assert.equal(layout.bodyBlocks[0]?.type, 'paragraph');
  assert.equal(
    layout.bodyBlocks[0]?.type === 'paragraph' ? layout.bodyBlocks[0].text : '',
    excerpt,
  );
});

run('resolveReaderBlockLayout avoids empty body when cached feed fallback matches excerpt', () => {
  const excerpt =
    "'Luca' director Enrico Casarosa returns with another Italy-set tale, hitting theaters March 5, 2027.";
  const article = {
    id: 'gatto',
    title: "Pixar's Kitty Adventure 'Gatto' Looks Purrfectly Delightful",
    excerpt,
    body: '',
    source: 'Gizmodo',
    imageUrl: 'https://example.com/hero.jpg',
    topics: ['movies'],
    readTimeMinutes: 3,
    publishedAt: '2026-06-10T12:00:00.000Z',
    url: 'https://gizmodo.com/gatto-trailer-pixar-movie-film-animated-2000770681',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [{ type: 'paragraph', text: excerpt }],
  });

  assert.equal(layout.feedLede, null);
  assert.equal(layout.bodyBlocks.length, 1);
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

run('resolveReaderBlockLayout strips Guardian live-blog Key events sidebar and pro-tip', () => {
  const article = {
    id: 'guardian-live',
    title: 'World Cup 2026: Mexico’s winning start – live',
    excerpt: 'Live updates from the tournament.',
    body: '',
    source: 'The Guardian Football',
    imageUrl: 'https://example.com/hero.jpg',
    topics: ['sports'],
    readTimeMinutes: 5,
    publishedAt: '2026-06-12T13:47:42.000Z',
    url: 'https://www.theguardian.com/football/live/2026/jun/12/world-cup-2026-news-updates-live',
  } satisfies Article;

  const layout = resolveReaderBlockLayout({
    article,
    extractedBlocks: [
      {
        type: 'paragraph',
        text:
          'Key events4h agoRepublic of Ireland to face Israel in neutral country4h agoKenny Jackett dies, aged 644h agoEndo retires from Japan duty as injury ends World Cup dream6h agoPFA refuses to drop legal case against Fifa6h agoViolent clashes outside Azteca6h agoEmpty seats highlight fears over ticket pricing7h agoPreamble',
      },
      { type: 'paragraph', text: 'Republic of Ireland to face Israel in neutral country' },
      { type: 'paragraph', text: 'Kenny Jackett dies, aged 64' },
      { type: 'paragraph', text: 'Empty seats highlight fears over ticket pricing' },
      {
        type: 'paragraph',
        text: 'Pro-tip in this article: Telemundo, the World Cup’s Spanish-language broadcaster in the US, did not cut away to full-screen advertising during the hydration breaks.',
      },
    ],
  });

  assert.equal(layout.bodyBlocks.length, 0);
});

run('resolveReaderContentForArticle builds feed preview from excerpt', () => {
  const article = {
    id: 'story-1',
    title: 'Headline',
    excerpt: 'Standfirst from the feed.',
    body: '',
    source: 'Example',
    imageUrl: 'https://example.com/hero.jpg',
    topics: ['technology'],
    readTimeMinutes: 4,
    publishedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://example.com/story',
  } satisfies Article;

  const preview = resolveReaderContentForArticle(article);
  assert.ok(preview);
  assert.equal(preview.source, 'feed');
  assert.equal(preview.blocks[0]?.type, 'paragraph');
  assert.equal(preview.blocks[0]?.type === 'paragraph' ? preview.blocks[0].text : '', article.excerpt);
});

run('resolveReaderContentForArticle prefers cached extracted content', () => {
  const article = {
    id: 'story-2',
    title: 'Headline',
    excerpt: 'Feed excerpt',
    body: '',
    source: 'Example',
    imageUrl: 'https://example.com/hero.jpg',
    topics: ['technology'],
    readTimeMinutes: 4,
    publishedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://example.com/story',
  } satisfies Article;

  const cached = {
    title: article.title,
    blocks: [{ type: 'paragraph' as const, text: 'Extracted body.' }],
    readTimeMinutes: 6,
    source: 'extracted' as const,
  };

  const resolved = resolveReaderContentForArticle(article, () => cached);
  assert.equal(resolved, cached);
});
