import { articleImageUrlsMatch } from '@/constants/images';
import { Article } from '@/types';
import { ArticleReaderBlock } from '@/types/articleContent';
import { hasRealHeroImage } from '@/utils/articleStoryMatch';

/** Paragraphs from feed body/excerpt when extracted reader content is missing or empty. */
export function feedBlocksFromArticle(article: Article): ArticleReaderBlock[] {
  const fromBody = article.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (fromBody.length > 0) {
    return fromBody.map((text) => ({ type: 'paragraph', text }));
  }
  const excerpt = article.excerpt.trim();
  if (excerpt) return [{ type: 'paragraph', text: excerpt }];
  return [];
}

function normalizeParagraphText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'"]/gu, '')
    .trim();
}

/**
 * True when RSS excerpt is the article lede, not a multi-paragraph teaser that merely contains it.
 * Guardian (and similar feeds) often ship a standfirst plus opening copy in one excerpt blob.
 */
export function excerptMatchesArticleLede(extractedLede: string, excerpt: string): boolean {
  if (!paragraphsSubstantiallyMatch(extractedLede, excerpt)) return false;

  const lede = normalizeParagraphText(extractedLede);
  const preview = normalizeParagraphText(excerpt);
  if (!lede || !preview) return false;

  if (preview.length > lede.length * 1.2 && !lede.includes(preview)) return false;

  return true;
}

/** True when two paragraphs are the same standfirst/lede (handles truncated feed excerpts). */
export function paragraphsSubstantiallyMatch(a: string, b: string): boolean {
  const left = normalizeParagraphText(a);
  const right = normalizeParagraphText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  const wordsLeft = left.split(' ').filter((word) => word.length > 2);
  const wordsRight = new Set(right.split(' ').filter((word) => word.length > 2));
  if (wordsLeft.length === 0 || wordsRight.size === 0) return false;

  let overlap = 0;
  for (const word of wordsLeft) {
    if (wordsRight.has(word)) overlap += 1;
  }

  const minSize = Math.min(wordsLeft.length, wordsRight.size);
  return overlap / minSize >= 0.85;
}

function firstParagraphText(blocks: ArticleReaderBlock[]): string | null {
  const first = blocks.find((block) => block.type === 'paragraph');
  return first?.type === 'paragraph' ? first.text : null;
}

function dedupeLeadingParagraph(blocks: ArticleReaderBlock[], lede: string): ArticleReaderBlock[] {
  const firstText = firstParagraphText(blocks);
  if (!firstText || !paragraphsSubstantiallyMatch(firstText, lede)) return blocks;
  const index = blocks.findIndex((block) => block.type === 'paragraph');
  return index >= 0 ? [...blocks.slice(0, index), ...blocks.slice(index + 1)] : blocks;
}

function dedupeLeadingHeroImage(blocks: ArticleReaderBlock[], heroUrl: string): ArticleReaderBlock[] {
  const index = blocks.findIndex((block) => block.type === 'image');
  if (index < 0) return blocks;

  const block = blocks[index];
  if (block.type !== 'image' || !articleImageUrlsMatch(block.url, heroUrl)) return blocks;

  return [...blocks.slice(0, index), ...blocks.slice(index + 1)];
}

export interface ReaderBlockLayout {
  /** Text for the feed preview callout; null when body should stand alone. */
  feedLede: string | null;
  bodyBlocks: ArticleReaderBlock[];
}

/** Splits feed lede vs article body and dedupes standfirst/excerpt overlap after extraction. */
export function resolveReaderBlockLayout(params: {
  article: Article;
  extractedBlocks: ArticleReaderBlock[] | null;
}): ReaderBlockLayout {
  const { article, extractedBlocks } = params;
  const excerpt = article.excerpt.trim();
  const feedBlocks = feedBlocksFromArticle(article);

  const blocks = extractedBlocks ?? feedBlocks;

  let layout: ReaderBlockLayout;

  if (!extractedBlocks) {
    const feedLede = excerpt || null;
    layout = {
      feedLede,
      bodyBlocks: feedLede ? dedupeLeadingParagraph(blocks, feedLede) : blocks,
    };
  } else {
    const firstText = firstParagraphText(blocks);
    if (excerpt && firstText && excerptMatchesArticleLede(firstText, excerpt)) {
      layout = {
        feedLede: excerpt,
        bodyBlocks: dedupeLeadingParagraph(blocks, excerpt),
      };
    } else {
      layout = { feedLede: null, bodyBlocks: blocks };
    }
  }

  if (hasRealHeroImage(article)) {
    layout = {
      ...layout,
      bodyBlocks: dedupeLeadingHeroImage(layout.bodyBlocks, article.imageUrl),
    };
  }

  return layout;
}

/** @deprecated Use feedBlocksFromArticle */
export function feedParagraphsFromArticle(article: Article): string[] {
  return feedBlocksFromArticle(article)
    .filter((block): block is Extract<ArticleReaderBlock, { type: 'paragraph' }> => block.type === 'paragraph')
    .map((block) => block.text);
}

/** @deprecated Use resolveReaderBlockLayout */
export function resolveReaderParagraphLayout(params: {
  article: Article;
  extractedParagraphs: string[] | null;
}): { feedLede: string | null; bodyParagraphs: string[] } {
  const extractedBlocks =
    params.extractedParagraphs?.map((text) => ({ type: 'paragraph' as const, text })) ?? null;
  const layout = resolveReaderBlockLayout({
    article: params.article,
    extractedBlocks,
  });
  return {
    feedLede: layout.feedLede,
    bodyParagraphs: layout.bodyBlocks
      .filter((block): block is Extract<ArticleReaderBlock, { type: 'paragraph' }> => block.type === 'paragraph')
      .map((block) => block.text),
  };
}
