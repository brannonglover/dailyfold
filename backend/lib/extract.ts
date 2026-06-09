import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import {
  isArticlePlaceholderImageUrl,
  isPlaceholderImageElement,
} from '../../catalog/imagePlaceholders';

import { supplementBlocksWithEmbeddedImages } from './embeddedMedia';
import { Article } from './types';

const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; DailyFoldReader/1.0; +https://github.com/brannonglover/current)';

export type ReaderBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt?: string; caption?: string };

export interface ReaderContent {
  title: string;
  blocks: ReaderBlock[];
  readTimeMinutes: number;
  source: 'extracted' | 'feed';
}

function readTimeMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function paragraphTexts(blocks: ReaderBlock[]): string[] {
  return blocks
    .filter((block): block is Extract<ReaderBlock, { type: 'paragraph' }> => block.type === 'paragraph')
    .map((block) => block.text);
}

function resolveImageUrl(src: string, baseUrl: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

function resolveImgSrc(img: Element, baseUrl: string): string | null {
  const candidates = [
    img.getAttribute('src'),
    img.getAttribute('data-src'),
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-original'),
    img.getAttribute('data-lazy'),
  ];

  const srcset = img.getAttribute('srcset') ?? img.getAttribute('data-srcset');
  if (srcset) {
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (first) candidates.push(first);
  }

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    const resolved = resolveImageUrl(candidate, baseUrl);
    if (resolved && !isArticlePlaceholderImageUrl(resolved)) return resolved;
  }

  return null;
}

function isLikelyContentImage(img: Element, resolvedSrc?: string | null): boolean {
  const src = resolvedSrc ?? img.getAttribute('src') ?? '';
  if (!src || src.startsWith('data:image/gif')) return false;
  if (isPlaceholderImageElement(img)) return false;
  if (resolvedSrc && isArticlePlaceholderImageUrl(resolvedSrc)) return false;

  const lower = src.toLowerCase();
  if (
    lower.includes('pixel') ||
    lower.includes('tracking') ||
    lower.includes('beacon') ||
    lower.includes('spacer') ||
    lower.includes('/assets/icons/')
  ) {
    return false;
  }

  const width = Number.parseInt(img.getAttribute('width') ?? '', 10);
  const height = Number.parseInt(img.getAttribute('height') ?? '', 10);
  if (width > 0 && width < 80) return false;
  if (height > 0 && height < 80) return false;

  return true;
}

function pushParagraph(blocks: ReaderBlock[], text: string) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length > 20) {
    blocks.push({ type: 'paragraph', text: normalized });
  }
}

function pushImage(
  blocks: ReaderBlock[],
  img: Element,
  baseUrl: string,
  caption?: string,
) {
  const url = resolveImgSrc(img, baseUrl);
  if (!url || !isLikelyContentImage(img, url)) return;

  blocks.push({
    type: 'image',
    url,
    alt: img.getAttribute('alt')?.trim() || undefined,
    caption: caption?.trim() || undefined,
  });
}

function pushImageUrl(
  blocks: ReaderBlock[],
  url: string,
  caption?: string,
  alt?: string,
) {
  if (isArticlePlaceholderImageUrl(url)) return;
  blocks.push({
    type: 'image',
    url,
    alt: alt?.trim() || undefined,
    caption: caption?.trim() || undefined,
  });
}

function walkArticleNode(node: Element, blocks: ReaderBlock[], baseUrl: string) {
  const tag = node.tagName.toLowerCase();

  if (tag === 'figure') {
    const img = node.querySelector('img');
    if (img) {
      const caption = node.querySelector('figcaption')?.textContent ?? undefined;
      pushImage(blocks, img, baseUrl, caption);
    }
    return;
  }

  if (tag === 'picture') {
    const img = node.querySelector('img');
    if (img) pushImage(blocks, img, baseUrl);
    return;
  }

  if (tag === 'dfl-media-wrapper' && node.classList.contains('image')) {
    const caption = node.querySelector('.caption')?.textContent?.replace(/\s+/g, ' ').trim();
    const img = node.querySelector('img');
    if (img) {
      const url = resolveImgSrc(img, baseUrl);
      if (url && isLikelyContentImage(img, url)) {
        pushImageUrl(blocks, url, caption);
      }
    }
    return;
  }

  if (tag === 'img') {
    pushImage(blocks, node, baseUrl);
    return;
  }

  if (tag === 'video') {
    const poster = node.getAttribute('poster');
    if (poster) {
      const url = resolveImageUrl(poster, baseUrl);
      if (url) pushImageUrl(blocks, url);
    }
    return;
  }

  if (tag === 'p' || tag === 'h2' || tag === 'h3') {
    const img = node.querySelector('img');
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (img) {
      const url = resolveImgSrc(img, baseUrl);
      if (url && isLikelyContentImage(img, url) && text.length < 40) {
        pushImageUrl(blocks, url);
        return;
      }
    }
    pushParagraph(blocks, text);
    return;
  }

  if (tag === 'blockquote') {
    const listItems = node.querySelectorAll('li');
    if (listItems.length > 0) {
      for (const item of listItems) {
        pushParagraph(blocks, item.textContent ?? '');
      }
      return;
    }
    pushParagraph(blocks, node.textContent ?? '');
    return;
  }

  for (const child of node.children) {
    walkArticleNode(child, blocks, baseUrl);
  }
}

function blocksFromHtml(html: string, baseUrl: string): ReaderBlock[] {
  const { document } = parseHTML(`<article>${html}</article>`);
  const root = document.querySelector('article');
  if (!root) return [];

  const blocks: ReaderBlock[] = [];
  for (const child of root.children) {
    walkArticleNode(child, blocks, baseUrl);
  }

  if (blocks.length > 0) return blocks;

  const plain = document.body?.textContent?.replace(/\s+/g, ' ').trim();
  if (!plain) return [];

  return plain
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20)
    .map((text) => ({ type: 'paragraph' as const, text }));
}

function feedBlocks(article: Article): ReaderBlock[] {
  const fromBody = article.body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (fromBody.length > 0) {
    return fromBody.map((text) => ({ type: 'paragraph', text }));
  }
  if (article.excerpt.trim()) {
    return [{ type: 'paragraph', text: article.excerpt.trim() }];
  }
  return [];
}

async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractReaderContent(article: Article): Promise<ReaderContent> {
  const feedFallback = (): ReaderContent => {
    const blocks = feedBlocks(article);
    const text = paragraphTexts(blocks).join('\n\n');
    return {
      title: article.title,
      blocks,
      readTimeMinutes: readTimeMinutes(text || article.excerpt),
      source: 'feed',
    };
  };

  try {
    const html = await fetchPageHtml(article.url);
    const { document } = parseHTML(html);
    const parsed = new Readability(document, { charThreshold: 100 }).parse();

    if (!parsed?.content) return feedFallback();

    const blocks = supplementBlocksWithEmbeddedImages(
      blocksFromHtml(parsed.content, article.url),
      html,
      article.url,
    );
    if (blocks.length === 0) return feedFallback();

    const text = paragraphTexts(blocks).join('\n\n');
    return {
      title: parsed.title?.trim() || article.title,
      blocks,
      readTimeMinutes: readTimeMinutes(text),
      source: 'extracted',
    };
  } catch {
    return feedFallback();
  }
}
