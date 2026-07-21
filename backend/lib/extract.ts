import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import { filterGuardianLiveBlogArtifacts } from '../../catalog/guardianLiveBlogSidebar';
import {
  isArticlePlaceholderImageUrl,
  isPlaceholderImageElement,
} from '../../catalog/imagePlaceholders';

import {
  detectVideoProvider,
  normalizeVideoPlaybackUrl,
  supplementBlocksWithEmbeddedImages,
} from './embeddedMedia';
import { Article } from './types';

const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; DailyFoldReader/1.0; +https://github.com/brannonglover/current)';

export type ReaderBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'video'; url: string; poster?: string; provider?: string; caption?: string };

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

/** One `srcset` entry parsed into its URL and relative quality (width or density x100). */
function parseSrcsetCandidates(srcset: string): { url: string; width: number }[] {
  return srcset
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [url, descriptor] = entry.split(/\s+/, 2);
      if (!url) return null;
      const widthMatch = descriptor?.match(/^(\d+)w$/);
      const densityMatch = descriptor?.match(/^(\d+(?:\.\d+)?)x$/);
      const width = widthMatch
        ? Number(widthMatch[1])
        : densityMatch
          ? Number(densityMatch[1]) * 100
          : 0;
      return { url, width };
    })
    .filter((candidate): candidate is { url: string; width: number } => candidate !== null);
}

/** Highest-resolution URL in a `srcset`/`data-srcset` list (entries aren't guaranteed ordering). */
function bestSrcsetUrl(srcset: string): string | null {
  const candidates = parseSrcsetCandidates(srcset);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, next) => (next.width > best.width ? next : best)).url;
}

function resolveImgSrc(img: Element, baseUrl: string): string | null {
  const srcset = img.getAttribute('srcset') ?? img.getAttribute('data-srcset');

  const candidates = [
    // Prefer srcset's highest-resolution entry — plain `src` is often a low-res
    // fallback for browsers that don't support srcset, which reads as blurry here.
    srcset ? bestSrcsetUrl(srcset) : null,
    img.getAttribute('src'),
    img.getAttribute('data-src'),
    img.getAttribute('data-lazy-src'),
    img.getAttribute('data-original'),
    img.getAttribute('data-lazy'),
  ];

  for (const candidate of candidates) {
    if (!candidate?.trim()) continue;
    const resolved = resolveImageUrl(candidate, baseUrl);
    if (resolved && !isArticlePlaceholderImageUrl(resolved)) return resolved;
  }

  return null;
}

/** Highest-resolution candidate across a `<picture>`'s `<source>` variants, falling back to its `<img>`. */
function resolvePictureSrc(picture: Element, baseUrl: string): string | null {
  let best: { url: string; width: number } | null = null;

  for (const source of picture.querySelectorAll('source')) {
    const srcset = source.getAttribute('srcset') ?? source.getAttribute('data-srcset');
    if (!srcset) continue;
    for (const candidate of parseSrcsetCandidates(srcset)) {
      const resolved = resolveImageUrl(candidate.url, baseUrl);
      if (!resolved || isArticlePlaceholderImageUrl(resolved)) continue;
      if (!best || candidate.width > best.width) best = { url: resolved, width: candidate.width };
    }
  }

  if (best) return best.url;

  const img = picture.querySelector('img');
  return img ? resolveImgSrc(img, baseUrl) : null;
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

function pushVideoBlock(
  blocks: ReaderBlock[],
  url: string,
  baseUrl: string,
  options?: { poster?: string; caption?: string },
) {
  const resolved = resolveImageUrl(url, baseUrl);
  if (!resolved) return;

  const provider = detectVideoProvider(resolved);
  const playbackUrl = normalizeVideoPlaybackUrl(resolved, provider);
  if (!playbackUrl) return;

  const poster = options?.poster
    ? resolveImageUrl(options.poster, baseUrl) ?? undefined
    : undefined;

  blocks.push({
    type: 'video',
    url: playbackUrl,
    poster,
    provider: provider ?? detectVideoProvider(playbackUrl),
    caption: options?.caption?.trim() || undefined,
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
    const url = resolvePictureSrc(node, baseUrl);
    if (url && (!img || isLikelyContentImage(img, url))) {
      pushImageUrl(blocks, url, undefined, img?.getAttribute('alt')?.trim() || undefined);
    }
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
    const poster = node.getAttribute('poster') ?? undefined;
    const src =
      node.getAttribute('src') ??
      node.querySelector('source[src]')?.getAttribute('src') ??
      undefined;
    if (src) {
      pushVideoBlock(blocks, src, baseUrl, { poster });
    } else if (poster) {
      const url = resolveImageUrl(poster, baseUrl);
      if (url) pushImageUrl(blocks, url);
    }
    return;
  }

  if (tag === 'iframe') {
    const src = node.getAttribute('src');
    if (src) pushVideoBlock(blocks, src, baseUrl);
    return;
  }

  if (tag === 'p' || tag === 'h2' || tag === 'h3') {
    const img = node.querySelector('img');
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    if (img) {
      const url = resolveImgSrc(img, baseUrl);
      if (url && isLikelyContentImage(img, url)) {
        // Short text alongside the image reads as a caption, not body copy — image only.
        if (text.length < 40) {
          pushImageUrl(blocks, url);
          return;
        }
        // Otherwise keep both: the image was previously dropped silently here.
        pushImageUrl(blocks, url);
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

  if (node.children.length === 0) {
    // Leaf container (e.g. a bare <div>/<li> paragraph with no <p> wrapper) — its own
    // text is otherwise never visited, since recursion below only walks element children.
    pushParagraph(blocks, node.textContent ?? '');
    return;
  }

  for (const child of node.children) {
    walkArticleNode(child, blocks, baseUrl);
  }
}

export function blocksFromHtml(html: string, baseUrl: string): ReaderBlock[] {
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

function normalizeParagraphText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s'"]/gu, '')
    .trim();
}

function paragraphsSubstantiallyMatch(a: string, b: string): boolean {
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

/** True when cached blocks add nothing beyond RSS feed body/excerpt (e.g. failed extraction saved as extracted). */
export function readerContentNoBetterThanFeed(
  blocks: ReaderBlock[],
  article: Article,
): boolean {
  if (blocks.length === 0) return true;

  const hasMedia = blocks.some((block) => block.type === 'video' || block.type === 'image');
  if (hasMedia) return false;

  const cachedText = blocks
    .filter((block): block is Extract<ReaderBlock, { type: 'paragraph' }> => block.type === 'paragraph')
    .map((block) => block.text);
  const feedText = feedBlocks(article)
    .filter((block): block is Extract<ReaderBlock, { type: 'paragraph' }> => block.type === 'paragraph')
    .map((block) => block.text);

  if (feedText.length === 0) return false;
  if (cachedText.length > feedText.length) return false;

  return cachedText.every(
    (text, index) => feedText[index] && paragraphsSubstantiallyMatch(text, feedText[index]!),
  );
}

export function isUsableExtractedReaderCache(
  cached: ReaderContent,
  article: Article,
  options?: { legacyTextOnlyFormat?: boolean },
): boolean {
  if (cached.source !== 'extracted') return false;
  if (cached.blocks.length === 0) return false;
  if (options?.legacyTextOnlyFormat) return false;
  if (readerContentNoBetterThanFeed(cached.blocks, article)) return false;
  return true;
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

    const blocks = filterGuardianLiveBlogArtifacts(
      supplementBlocksWithEmbeddedImages(
        blocksFromHtml(parsed.content, article.url),
        html,
        article.url,
      ),
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
