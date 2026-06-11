import { isArticlePlaceholderImageUrl } from '../../catalog/imagePlaceholders';

import type { ReaderBlock } from './extract';

type EmbeddedImage = {
  url: string;
  caption?: string;
  alt?: string;
};

type EmbeddedVideo = {
  url: string;
  poster?: string;
  caption?: string;
  provider?: string;
};

export type VideoProvider = 'youtube' | 'vimeo' | 'file';

const VIDEO_PLACEMENT_KEYWORDS = ['video', 'watch', 'trailer', 'clip', 'highlights', 'footage'];

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

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] ?? null;
      }
      const watchId = parsed.searchParams.get('v');
      if (watchId) return watchId;
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/(?:video\/)?(\d+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

/** Detect hosted video provider from a source or embed URL. */
export function detectVideoProvider(url: string): VideoProvider | undefined {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host.includes('youtube.com') || host === 'youtu.be' || host.includes('youtube-nocookie.com')) {
      return 'youtube';
    }
    if (host.includes('vimeo.com') || host.includes('player.vimeo.com')) {
      return 'vimeo';
    }
    if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(parsed.pathname)) {
      return 'file';
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/** Normalize source URLs to in-app playback URLs (embed or direct file). */
export function normalizeVideoPlaybackUrl(
  url: string,
  provider?: string,
): string | null {
  const resolvedProvider = (provider as VideoProvider | undefined) ?? detectVideoProvider(url);
  if (resolvedProvider === 'youtube') {
    const id = extractYouTubeId(url);
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (resolvedProvider === 'vimeo') {
    const id = extractVimeoId(url);
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  if (resolvedProvider === 'file') {
    return url;
  }
  return null;
}

function resolveMediaUrl(src: string, baseUrl: string): string | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, baseUrl).href;
  } catch {
    return null;
  }
}

function collectJsonLdVideos(data: unknown, videos: EmbeddedVideo[]): void {
  if (!data) return;

  if (Array.isArray(data)) {
    for (const entry of data) collectJsonLdVideos(entry, videos);
    return;
  }

  if (typeof data !== 'object') return;

  const record = data as Record<string, unknown>;
  const type = record['@type'];
  const isVideoObject =
    type === 'VideoObject' || (Array.isArray(type) && type.includes('VideoObject'));

  if (isVideoObject) {
    const poster =
      typeof record.thumbnailURL === 'string' ? record.thumbnailURL : undefined;
    const caption = typeof record.name === 'string' ? record.name : undefined;
    const candidates = [record.contentUrl, record.embedUrl].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );

    for (const candidate of candidates) {
      const provider = detectVideoProvider(candidate);
      const playbackUrl = normalizeVideoPlaybackUrl(candidate, provider);
      if (playbackUrl) {
        videos.push({
          url: playbackUrl,
          poster,
          caption,
          provider: provider ?? detectVideoProvider(playbackUrl),
        });
      }
    }

    if (candidates.length === 0 && poster) {
      videos.push({ url: poster, poster, caption });
    }
  }

  for (const value of Object.values(record)) {
    if (value && typeof value === 'object') collectJsonLdVideos(value, videos);
  }
}

/** Playable video URLs from JSON-LD VideoObject blocks. */
export function parseJsonLdVideoEntries(html: string): EmbeddedVideo[] {
  const videos: EmbeddedVideo[] = [];
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(pattern)) {
    const raw = match[1]?.trim();
    if (!raw) continue;

    try {
      collectJsonLdVideos(JSON.parse(raw), videos);
    } catch {
      const contentUrl = raw.match(/"contentUrl"\s*:\s*"([^"]+)"/)?.[1];
      const embedUrl = raw.match(/"embedUrl"\s*:\s*"([^"]+)"/)?.[1];
      const poster = raw.match(/"thumbnailURL"\s*:\s*"([^"]+)"/)?.[1];
      const caption = raw.match(/"name"\s*:\s*"([^"]+)"/)?.[1];
      for (const candidate of [contentUrl, embedUrl]) {
        if (!candidate) continue;
        const provider = detectVideoProvider(candidate);
        const playbackUrl = normalizeVideoPlaybackUrl(candidate, provider);
        if (playbackUrl) {
          videos.push({
            url: playbackUrl,
            poster,
            caption,
            provider: provider ?? detectVideoProvider(playbackUrl),
          });
        }
      }
      if (!contentUrl && !embedUrl && poster) {
        videos.push({ url: poster, poster, caption });
      }
    }
  }

  return videos;
}

function parseVideoElementEntries(html: string, baseUrl: string): EmbeddedVideo[] {
  const videos: EmbeddedVideo[] = [];
  const pattern = /<video\b[^>]*>([\s\S]*?)<\/video>/gi;

  for (const match of html.matchAll(pattern)) {
    const tag = match[0] ?? '';
    const inner = match[1] ?? '';
    const posterMatch = tag.match(/\bposter=["']([^"']+)["']/i);
    const poster = posterMatch?.[1]
      ? resolveMediaUrl(posterMatch[1], baseUrl) ?? undefined
      : undefined;

    const srcCandidates = [
      tag.match(/\bsrc=["']([^"']+)["']/i)?.[1],
      ...inner.matchAll(/<source[^>]+src=["']([^"']+)["']/gi).map((source) => source[1]),
    ].filter((value): value is string => !!value);

    for (const candidate of srcCandidates) {
      const resolved = resolveMediaUrl(candidate, baseUrl);
      if (!resolved) continue;
      const provider = detectVideoProvider(resolved);
      const playbackUrl = normalizeVideoPlaybackUrl(resolved, provider);
      if (playbackUrl) {
        videos.push({
          url: playbackUrl,
          poster,
          provider: provider ?? 'file',
        });
        break;
      }
    }
  }

  return videos;
}

function parseIframeVideoEntries(html: string, baseUrl: string): EmbeddedVideo[] {
  const videos: EmbeddedVideo[] = [];
  const pattern = /<iframe\b[^>]+src=["']([^"']+)["'][^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const src = match[1];
    if (!src) continue;
    const resolved = resolveMediaUrl(src, baseUrl);
    if (!resolved) continue;

    const provider = detectVideoProvider(resolved);
    const playbackUrl = normalizeVideoPlaybackUrl(resolved, provider);
    if (!playbackUrl || !provider || provider === 'file') continue;

    videos.push({
      url: playbackUrl,
      provider,
    });
  }

  return videos;
}

/** Parse CMS `media` videos embedded in Bundesliga Angular transfer state. */
export function parseBundesligaEmbeddedVideos(
  html: string,
  articleUrl: string,
): EmbeddedVideo[] {
  if (!articleUrl.includes('bundesliga.com')) return [];

  const slug = articleSlugFromUrl(articleUrl);
  if (!slug) return [];

  const slugIndex = html.indexOf(`"slug":"${slug}"`);
  if (slugIndex < 0) return [];

  const media = parseJsonArrayAfter(html, slugIndex, 'media');
  if (!media) return [];

  const videos: EmbeddedVideo[] = [];
  for (const entry of media) {
    if (!entry || typeof entry !== 'object') continue;
    const block = entry as {
      type?: string;
      poster?: string;
      src?: string;
      url?: string;
      embedUrl?: string;
      desktop?: { src?: string; caption?: string };
    };
    if (block.type !== 'video') continue;

    const poster = block.poster?.trim() || undefined;
    const caption = block.desktop?.caption?.trim() || undefined;
    const candidates = [block.embedUrl, block.src, block.url, block.desktop?.src].filter(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    );

    let added = false;
    for (const candidate of candidates) {
      const provider = detectVideoProvider(candidate);
      const playbackUrl = normalizeVideoPlaybackUrl(candidate, provider);
      if (!playbackUrl) continue;
      videos.push({
        url: playbackUrl,
        poster,
        caption,
        provider: provider ?? detectVideoProvider(playbackUrl),
      });
      added = true;
      break;
    }

    if (!added && poster) {
      videos.push({ url: poster, poster, caption });
    }
  }

  return videos;
}

function videoUrlKey(url: string, provider?: string): string {
  const normalized = normalizeVideoPlaybackUrl(url, provider) ?? url;
  if (provider === 'youtube' || detectVideoProvider(normalized) === 'youtube') {
    const id = extractYouTubeId(normalized);
    if (id) return `youtube:${id}`;
  }
  if (provider === 'vimeo' || detectVideoProvider(normalized) === 'vimeo') {
    const id = extractVimeoId(normalized);
    if (id) return `vimeo:${id}`;
  }

  try {
    const parsed = new URL(normalized);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return normalized;
  }
}

/** Candidate playable videos from embedded markup across a publisher page. */
export function parsePageEmbeddedVideos(html: string, articleUrl: string): EmbeddedVideo[] {
  const seen = new Set<string>();
  const ranked: EmbeddedVideo[] = [];

  const add = (video: EmbeddedVideo) => {
    const provider = video.provider ?? detectVideoProvider(video.url);
    const playbackUrl = normalizeVideoPlaybackUrl(video.url, provider);
    if (!playbackUrl) return;

    const key = videoUrlKey(playbackUrl, provider);
    if (seen.has(key)) return;
    seen.add(key);

    ranked.push({
      url: playbackUrl,
      poster: video.poster ? normalizeEspnCdnImageUrl(video.poster.trim()) : undefined,
      caption: video.caption,
      provider: provider ?? detectVideoProvider(playbackUrl),
    });
  };

  for (const video of parseJsonLdVideoEntries(html)) add(video);
  for (const video of parseIframeVideoEntries(html, articleUrl)) add(video);
  for (const video of parseVideoElementEntries(html, articleUrl)) add(video);
  for (const video of parseBundesligaEmbeddedVideos(html, articleUrl)) add(video);

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

function findInsertIndexForVideo(blocks: ReaderBlock[], caption?: string): number {
  const captionIndex = caption ? findInsertIndexForImage(blocks, caption) : blocks.length;
  if (caption && captionIndex < blocks.length) return captionIndex;

  let bestIndex = 0;
  let bestScore = 0;

  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (block.type !== 'paragraph') continue;

    const text = block.text.toLowerCase();
    const score = VIDEO_PLACEMENT_KEYWORDS.reduce(
      (sum, word) => (text.includes(word) ? sum + 1 : sum),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i + 1;
    }
  }

  return bestScore > 0 ? bestIndex : 0;
}

function hasEmbeddedVideo(blocks: ReaderBlock[]): boolean {
  return blocks.some((block) => block.type === 'video');
}

function supplementBlocksWithEmbeddedVideos(
  blocks: ReaderBlock[],
  html: string,
  articleUrl: string,
): ReaderBlock[] {
  if (hasEmbeddedVideo(blocks)) return blocks;

  const videos = parsePageEmbeddedVideos(html, articleUrl);
  if (videos.length > 0) {
    const video = videos[0]!;
    const next = [...blocks];
    const insertAt = findInsertIndexForVideo(next, video.caption);
    next.splice(insertAt, 0, {
      type: 'video',
      url: video.url,
      poster: video.poster,
      provider: video.provider,
      caption: video.caption,
    });
    return next;
  }

  const hasImage = blocks.some((block) => block.type === 'image');
  if (hasImage) return blocks;

  const thumbnails = parsePageVideoThumbnailUrls(html);
  if (thumbnails.length === 0) return blocks;

  return [
    { type: 'image', url: thumbnails[0]!, alt: 'Video thumbnail' },
    ...blocks,
  ];
}

/** Insert CMS images and embedded videos missing from Readability output. */
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

  return supplementBlocksWithEmbeddedVideos(next, html, articleUrl);
}

export { imageUrlKey };
