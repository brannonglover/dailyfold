import { createHash } from 'crypto';

import { inferSportTags } from '../../catalog/sports';
import { decodeFeedText, stripAndDecodeHtml } from '../../catalog/decodeHtmlText';

import { detectRequiresSubscription } from './subscription';
import { Article, FeedConfig, Topic } from './types';

const TOPICS: Topic[] = [
  'technology',
  'culture',
  'science',
  'business',
  'politics',
  'health',
  'design',
  'world',
  'sports',
  'art',
  'gardening',
];

/** Client renders an in-app placeholder when empty. */
const PLACEHOLDER_IMAGE = '';

function stripHtml(html: string): string {
  return stripAndDecodeHtml(html);
}

function hashId(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function normalizeImageUrl(url: string | null | undefined, pageUrl?: string): string | null {
  if (!url?.trim()) return null;

  let normalized = url
    .trim()
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  if (normalized.startsWith('//')) {
    normalized = `https:${normalized}`;
  } else if (normalized.startsWith('/')) {
    if (!pageUrl) return null;
    try {
      normalized = new URL(normalized, pageUrl).href;
    } catch {
      return null;
    }
  } else if (normalized.startsWith('http://')) {
    normalized = `https://${normalized.slice('http://'.length)}`;
  }

  try {
    return new URL(normalized).href;
  } catch {
    return null;
  }
}

const FEED_HERO_TARGET_WIDTH = 960;

function isImageMedia(attrs: { medium?: string; type?: string; url?: string }): boolean {
  if (attrs.medium && attrs.medium !== 'image') return false;
  if (attrs.type?.startsWith('video')) return false;
  if (attrs.type?.startsWith('image')) return true;
  if (attrs.url && isDisplayableImageUrl(attrs.url)) return true;
  return false;
}

function isDisplayableImageUrl(url: string): boolean {
  if (/\.m3u8(\?|$)/i.test(url)) return false;
  if (/\.(mp4|webm|mov|avi)(\?|$)/i.test(url)) return false;
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg)(\?|$)/i.test(url) || /\/image\//i.test(url);
}

/** Bump common RSS/CDN thumbnail params so feed heroes are not upscaled from tiny sources. */
export function upgradeFeedImageUrl(url: string): string {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.endsWith('guim.co.uk')) {
      const width = Number(parsed.searchParams.get('width'));
      if (width > 0 && width < 600) {
        parsed.searchParams.set('width', String(FEED_HERO_TARGET_WIDTH));
      }
    }

    const queryWidth = parsed.searchParams.get('width') ?? parsed.searchParams.get('w');
    if (queryWidth) {
      const width = Number(queryWidth);
      if (width > 0 && width < 400) {
        parsed.searchParams.set(
          parsed.searchParams.has('w') ? 'w' : 'width',
          String(FEED_HERO_TARGET_WIDTH),
        );
        parsed.searchParams.delete('h');
        parsed.searchParams.delete('crop');
        parsed.searchParams.delete('resize');
      }
    }

    if (parsed.hostname.includes('ichef.bbci.co.uk')) {
      return url.replace(/\/standard\/\d+\//i, '/standard/976/');
    }

    const resizedPath = parsed.pathname.replace(
      /-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|gif|webp|avif))$/i,
      '$1',
    );
    if (resizedPath !== parsed.pathname) {
      parsed.pathname = resizedPath;
    }

    return parsed.href;
  } catch {
    return url;
  }
}

interface MediaRef {
  url: string;
  width: number;
  height: number;
}

function mediaPixels(ref: MediaRef): number {
  if (ref.width > 0 && ref.height > 0) return ref.width * ref.height;
  return Math.max(ref.width, ref.height);
}

function parseMediaRef(field: unknown): MediaRef | null {
  if (typeof field === 'string') {
    return isDisplayableImageUrl(field) ? { url: field, width: 0, height: 0 } : null;
  }

  if (!field || typeof field !== 'object') return null;

  const record = field as Record<string, unknown>;
  const attrs = record.$ as
    | { medium?: string; type?: string; url?: string; width?: string; height?: string }
    | undefined;

  if (attrs?.url && isImageMedia(attrs)) {
    return {
      url: attrs.url,
      width: Number(attrs.width) || 0,
      height: Number(attrs.height) || 0,
    };
  }

  if (typeof record.url === 'string' && isDisplayableImageUrl(record.url)) {
    return { url: record.url, width: 0, height: 0 };
  }

  return null;
}

function collectMediaRefs(field: unknown): MediaRef[] {
  if (!field) return [];

  if (Array.isArray(field)) {
    return field.flatMap((entry) => collectMediaRefs(entry));
  }

  const direct = parseMediaRef(field);
  if (direct) return [direct];

  if (typeof field !== 'object') return [];

  const record = field as Record<string, unknown>;
  const nestedFields = [
    record['media:content'],
    record.mediaContent,
    record['media:thumbnail'],
    record.mediaThumbnail,
    record['media:group'],
    record.mediaGroup,
  ];

  return nestedFields.flatMap((nested) => collectMediaRefs(nested));
}

function extractImagesFromHtml(html: string): string[] {
  const urls: string[] = [];
  const pattern = /<img[^>]+src=["']([^"']+)["']/gi;
  for (const match of html.matchAll(pattern)) {
    if (match[1]) urls.push(match[1]);
  }
  return urls;
}

type ImageCandidateTier = 0 | 1 | 2 | 3;

function extractImage(
  item: {
    link?: string;
    content?: string;
    summary?: string;
    enclosure?: { url?: string; type?: string };
    mediaContent?: unknown;
    mediaThumbnail?: unknown;
    mediaGroup?: unknown;
    'media:content'?: unknown;
    'media:thumbnail'?: unknown;
    'media:group'?: unknown;
  },
  pageUrl?: string,
): string | null {
  const ranked: { tier: ImageCandidateTier; pixels: number; url: string }[] = [];

  const addTier = (tier: ImageCandidateTier, field: unknown) => {
    for (const ref of collectMediaRefs(field)) {
      ranked.push({ tier, pixels: mediaPixels(ref), url: ref.url });
    }
  };

  addTier(0, item.mediaContent);
  addTier(0, item['media:content']);
  addTier(1, item.mediaGroup);
  addTier(1, item['media:group']);

  if (item.enclosure?.url) {
    const type = item.enclosure.type ?? '';
    const url = item.enclosure.url;
    if (type.startsWith('image') || isDisplayableImageUrl(url)) {
      ranked.push({ tier: 0, pixels: 0, url });
    }
  }

  const html = item.content ?? item.summary ?? '';
  for (const url of extractImagesFromHtml(html)) {
    ranked.push({ tier: 2, pixels: 0, url });
  }

  addTier(3, item.mediaThumbnail);
  addTier(3, item['media:thumbnail']);

  ranked.sort((a, b) => a.tier - b.tier || b.pixels - a.pixels);

  for (const candidate of ranked) {
    const normalized = normalizeImageUrl(candidate.url, pageUrl);
    if (!normalized || !isDisplayableImageUrl(normalized)) continue;
    return upgradeFeedImageUrl(normalized);
  }

  return null;
}

function inferExtraTopics(text: string, base: Topic[], feedPrimaryTopic?: Topic): Topic[] {
  const lower = text.toLowerCase();
  const allowed = new Set<Topic>(base);
  const inferred = new Set<Topic>();

  const rules: [RegExp, Topic][] = [
    [
      /\b(sport|sports|football|basketball|baseball|hockey|soccer|tennis|golf|cricket|rugby|mma|olympic|playoff|playoffs|championship|nba|nfl|mlb|nhl|mls|fifa|uefa|premier league|champions league|la liga|bundesliga|serie a|world cup|super bowl|stanley cup|world series|formula 1|grand prix|matchday|goalkeeper|quarterback|pitcher|touchdown|home run|hat-trick)\b/,
      'sports',
    ],
    [/\b(garden|gardening|landscap|horticultur|backyard|perennial|vegetable patch)\b/, 'gardening'],
    [/\b(art|artist|gallery|museum|painting|sculpture|exhibition|curator)\b/, 'art'],
    [/\b(ai|artificial intelligence|machine learning|software|tech)\b/, 'technology'],
    [/\b(health|medical|medicine|wellness|diet)\b/, 'health'],
    [/\b(business|economy|market|startup|finance)\b/, 'business'],
    [/\b(science|research|study|physics|biology)\b/, 'science'],
    [/\b(design|architecture|interior)\b/, 'design'],
    [
      /\b(election|elections|government|policy|politic|politics|political|senate|congress|candidate|candidates|ballot|vote|voting|campaign|republican|democrat|democratic|gop|incumbent|legislat|parliament|minister|president|governor|white house|capitol)\b/,
      'politics',
    ],
    [/\b(culture|film|music|society|theater|theatre|literature|books)\b/, 'culture'],
    [/\b(world|global|international|war|climate)\b/, 'world'],
  ];

  for (const [pattern, topic] of rules) {
    if (topic === 'world' && feedPrimaryTopic === 'sports') continue;
    if (!allowed.has(topic)) continue;
    if (pattern.test(lower)) inferred.add(topic);
  }

  if (inferred.size === 0 && feedPrimaryTopic && allowed.has(feedPrimaryTopic)) {
    inferred.add(feedPrimaryTopic);
  }

  if (inferred.has('sports') && inferred.has('world')) {
    inferred.delete('world');
  }

  return TOPICS.filter((t) => inferred.has(t)).slice(0, 4);
}

function readTimeMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function safeIsoDate(value: string | undefined): string {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

export function normalizeFeedItem(
  item: {
    title?: string;
    link?: string;
    pubDate?: string;
    isoDate?: string;
    contentSnippet?: string;
    content?: string;
    summary?: string;
    categories?: unknown;
    accessRights?: unknown;
    mediaRestriction?: unknown;
    enclosure?: { url?: string; type?: string };
    mediaContent?: unknown;
    mediaThumbnail?: unknown;
    mediaGroup?: unknown;
    'media:content'?: unknown;
    'media:thumbnail'?: unknown;
    'media:group'?: unknown;
    'media:restriction'?: unknown;
  },
  feed: FeedConfig,
): Article | null {
  const url = item.link?.trim();
  const title = decodeFeedText(item.title);
  if (!url || !title) return null;

  const rawBody = item.content ?? item.summary ?? item.contentSnippet ?? '';
  const plain = stripHtml(rawBody || item.contentSnippet || '');
  const excerptSource = item.contentSnippet ?? item.summary ?? plain;
  const excerpt = stripHtml(excerptSource).slice(0, 280);
  const body = plain.slice(0, 8000) || excerpt;

  const publishedAt = safeIsoDate(item.isoDate ?? item.pubDate);
  const imageUrl = extractImage(item, url) ?? PLACEHOLDER_IMAGE;
  const text = `${title} ${excerpt}`;
  const topics = inferExtraTopics(text, feed.topics, feed.primaryTopic);
  const sportTags = inferSportTags(text, feed.sportTags ?? []);
  const requiresSubscription = detectRequiresSubscription({
    title,
    excerpt: excerpt || title,
    body,
    categories: item.categories,
    accessRights: item.accessRights,
    mediaRestriction: item.mediaRestriction ?? item['media:restriction'],
    feed,
  });

  return {
    id: hashId(url),
    title,
    excerpt: excerpt || title,
    body,
    source: feed.source,
    sourceLogo: feed.logoUrl,
    imageUrl,
    topics,
    sportTags: sportTags.length > 0 ? sportTags : undefined,
    readTimeMinutes: readTimeMinutes(body),
    publishedAt,
    url,
    requiresSubscription: requiresSubscription || undefined,
  };
}
