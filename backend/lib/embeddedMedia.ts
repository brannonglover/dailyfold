import { isArticlePlaceholderImageUrl } from '../../catalog/imagePlaceholders';

import type { ReaderBlock } from './extract';

type EmbeddedImage = {
  url: string;
  caption?: string;
  alt?: string;
};

/** Direct espncdn URLs load more reliably than combiner query URLs in mobile clients. */
export function normalizeEspnCdnImageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('espncdn.com')) return url;

    if (parsed.pathname.includes('/combiner/')) {
      const img = parsed.searchParams.get('img');
      if (img) {
        const path = decodeURIComponent(img);
        if (path.startsWith('/')) {
          return `https://a.espncdn.com${path}`;
        }
      }
    }

    return url;
  } catch {
    return url;
  }
}

function collectJsonLdVideoThumbnails(data: unknown, urls: string[]): void {
  if (!data) return;

  if (Array.isArray(data)) {
    for (const entry of data) collectJsonLdVideoThumbnails(entry, urls);
    return;
  }

  if (typeof data !== 'object') return;

  const record = data as Record<string, unknown>;
  const type = record['@type'];
  if (
    (type === 'VideoObject' || (Array.isArray(type) && type.includes('VideoObject'))) &&
    typeof record.thumbnailURL === 'string'
  ) {
    urls.push(record.thumbnailURL);
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') collectJsonLdVideoThumbnails(value, urls);
  }
}

/** Video poster/thumbnail URLs from JSON-LD VideoObject blocks (common on ESPN). */
export function parseJsonLdVideoThumbnailUrls(html: string): string[] {
  const urls: string[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      collectJsonLdVideoThumbnails(JSON.parse(raw), urls);
    } catch {
      for (const thumbMatch of raw.matchAll(/"thumbnailURL"\s*:\s*"([^"]+)"/g)) {
        if (thumbMatch[1]) urls.push(thumbMatch[1]);
      }
    }
  }

  return urls;
}

function parseVideoPosterUrls(html: string): string[] {
  const urls: string[] = [];
  const pattern = /<video[^>]+poster=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

function parseEspnMotionPreloadUrls(html: string): string[] {
  const urls: string[] = [];
  const pattern = /<link[^>]+href=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const href = match[1];
    if (!href) continue;
    if (href.includes('media/motion') || href.includes('media%2Fmotion')) {
      urls.push(href);
    }
  }

  return urls;
}

/** Candidate hero URLs from embedded video markup when no static <img> exists. */
export function parsePageVideoThumbnailUrls(html: string): string[] {
  const seen = new Set<string>();
  const ranked: string[] = [];

  const add = (url: string) => {
    const normalized = normalizeEspnCdnImageUrl(url.trim());
    if (!normalized || seen.has(normalized) || isArticlePlaceholderImageUrl(normalized)) return;
    seen.add(normalized);
    ranked.push(normalized);
  };

  for (const url of parseJsonLdVideoThumbnailUrls(html)) add(url);
  for (const url of parseVideoPosterUrls(html)) add(url);
  for (const url of parseEspnMotionPreloadUrls(html)) add(url);

  return ranked;
}

function parseJsonArrayAfter(text: string, startIndex: number, key: string): unknown[] | null {
  const marker = `"${key}":`;
  const relStart = text.indexOf(marker, startIndex);
  if (relStart < 0) return null;

  const slice = text.slice(relStart + marker.length).trimStart();
  if (!slice.startsWith('[')) return null;

  let depth = 0;
  for (let i = 0; i < slice.length; i += 1) {
    if (slice[i] === '[') depth += 1;
    else if (slice[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(slice.slice(0, i + 1)) as unknown[];
      }
    }
  }
  return null;
}

function articleSlugFromUrl(articleUrl: string): string | null {
  try {
    const parts = new URL(articleUrl).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? null;
  } catch {
    return null;
  }
}

function imageUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

/** Parse CMS `media` images embedded in Bundesliga Angular transfer state. */
export function parseBundesligaEmbeddedImages(
  html: string,
  articleUrl: string,
): EmbeddedImage[] {
  if (!articleUrl.includes('bundesliga.com')) return [];

  const slug = articleSlugFromUrl(articleUrl);
  if (!slug) return [];

  const slugIndex = html.indexOf(`"slug":"${slug}"`);
  if (slugIndex < 0) return [];

  const media = parseJsonArrayAfter(html, slugIndex, 'media');
  if (!media) return [];

  const images: EmbeddedImage[] = [];
  for (const entry of media) {
    if (!entry || typeof entry !== 'object') continue;
    const block = entry as {
      type?: string;
      desktop?: { src?: string; caption?: string; alt?: string };
    };
    if (block.type !== 'image') continue;

    const src = block.desktop?.src?.trim();
    if (!src) continue;

    images.push({
      url: src,
      caption: block.desktop?.caption?.trim() || undefined,
      alt: block.desktop?.alt?.trim() || undefined,
    });
  }

  return images;
}

function captionKeywords(caption: string): string[] {
  return caption
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 4);
}

function findInsertIndexForImage(blocks: ReaderBlock[], caption?: string): number {
  if (!caption) return blocks.length;

  const keywords = captionKeywords(caption);
  if (keywords.length === 0) return blocks.length;

  let bestIndex = blocks.length;
  let bestScore = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.type !== 'paragraph') continue;

    const text = block.text.toLowerCase();
    const score = keywords.reduce((sum, word) => (text.includes(word) ? sum + 1 : sum), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i + 1;
    }
  }

  return bestIndex;
}

function supplementBlocksWithVideoThumbnails(blocks: ReaderBlock[], html: string): ReaderBlock[] {
  const hasImage = blocks.some((block) => block.type === 'image');
  if (hasImage) return blocks;

  const thumbnails = parsePageVideoThumbnailUrls(html);
  if (thumbnails.length === 0) return blocks;

  return [
    { type: 'image', url: thumbnails[0]!, alt: 'Video thumbnail' },
    ...blocks,
  ];
}

/** Insert CMS images and video thumbnails missing from Readability output. */
export function supplementBlocksWithEmbeddedImages(
  blocks: ReaderBlock[],
  html: string,
  articleUrl: string,
): ReaderBlock[] {
  const embedded = parseBundesligaEmbeddedImages(html, articleUrl);

  let next = [...blocks];
  const seen = new Set(
    next
      .filter((block): block is Extract<ReaderBlock, { type: 'image' }> => block.type === 'image')
      .map((block) => imageUrlKey(block.url)),
  );

  for (const image of embedded) {
    const key = imageUrlKey(image.url);
    if (seen.has(key)) continue;

    const insertAt = findInsertIndexForImage(next, image.caption);
    next.splice(insertAt, 0, {
      type: 'image',
      url: image.url,
      alt: image.alt,
      caption: image.caption,
    });
    seen.add(key);
  }

  return supplementBlocksWithVideoThumbnails(next, html);
}

export { imageUrlKey };
