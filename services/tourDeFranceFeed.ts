import { decodeFeedText, stripAndDecodeHtml } from '@/catalog/decodeHtmlText';
import { resolveArticleImageUrl } from '@/constants/images';
import {
  TOUR_DE_FRANCE_FETCH_TIMEOUT_MS,
  TOUR_DE_FRANCE_NEWS_FEEDS,
} from '@/constants/tourDeFrance';
import {
  TOUR_DE_FRANCE_2026,
  TourGcRider,
  TourJerseyHolder,
  TourRaceSnapshot,
  TourRider,
  TourStage,
  stageStatus,
} from '@/data/tourDeFrance2026';

export interface TourNewsUpdate {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  tag?: string;
}

export interface TourFeedResult {
  race: TourRaceSnapshot;
  updates: TourNewsUpdate[];
  error?: string;
}

export type TourPill = 'stage' | 'gc' | 'jerseys' | 'riders';

async function fetchWithTimeout(
  url: string,
  timeoutMs = TOUR_DE_FRANCE_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractRssTag(block: string, tag: string): string {
  const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, 'i'));
  if (cdata?.[1] != null) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return (plain?.[1] ?? '').trim();
}

function extractMediaTagUrl(attrs: string): string | undefined {
  const href = attrs.match(/\burl=["']([^"']+)["']/i)?.[1];
  return href ? decodeRssImageUrl(href) : undefined;
}

function decodeRssImageUrl(raw: string): string {
  return decodeFeedText(raw).replace(/&amp;/g, '&');
}

/** Prefer media:content / media:thumbnail / enclosure / inline img. */
export function extractRssImageUrl(block: string): string | undefined {
  let bestContent: { url: string; width: number } | undefined;

  for (const match of block.matchAll(/<media:content\b([^>]*)\/?>/gi)) {
    const attrs = match[1] ?? '';
    const url = extractMediaTagUrl(attrs);
    if (!url) continue;
    const width = Number(attrs.match(/\bwidth="(\d+)"/i)?.[1] ?? 0);
    if (!bestContent || width > bestContent.width) {
      bestContent = { url, width };
    }
  }

  if (bestContent?.url) return bestContent.url;

  const thumbnailAttrs = block.match(/<media:thumbnail\b([^>]*)\/?>/i)?.[1];
  const thumbnailUrl = thumbnailAttrs ? extractMediaTagUrl(thumbnailAttrs) : undefined;
  if (thumbnailUrl) return thumbnailUrl;

  const enclosureAttrs = block.match(/<enclosure\b([^>]*)\/?>/i)?.[1];
  if (enclosureAttrs && /type=["']image\//i.test(enclosureAttrs)) {
    const enclosureUrl = extractMediaTagUrl(enclosureAttrs);
    if (enclosureUrl) return enclosureUrl;
  }

  const description = extractRssTag(block, 'description');
  const inlineImage = description.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
  return inlineImage ? decodeRssImageUrl(inlineImage) : undefined;
}

function parseRssDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date(0).toISOString();
}

const TOUR_NEWS_TAG_PATTERNS: { tag: string; pattern: RegExp }[] = [
  { tag: 'STAGE', pattern: /\bstage\s+\d+\b/i },
  { tag: 'GC', pattern: /\b(general classification|yellow jersey|maillot jaune|overall)\b/i },
  { tag: 'POINTS', pattern: /\b(green jersey|points classification|sprint)\b/i },
  { tag: 'CLIMB', pattern: /\b(polka|king of the mountains|mountains classification)\b/i },
];

export function inferTourNewsTag(title: string, excerpt = ''): string | undefined {
  const text = `${title} ${excerpt}`;
  for (const entry of TOUR_NEWS_TAG_PATTERNS) {
    if (entry.pattern.test(text)) return entry.tag;
  }
  return undefined;
}

/** Keep Tour-relevant items when a feed mixes in other cycling news. */
export function isTourRelevantNews(title: string, excerpt = ''): boolean {
  return /\b(tour de france|tour\s*de\s*france|tdf|le tour|pogacar|pogačar|evenepoel|pedersen|philipsen|del toro|alpe d['']huez|orci[eè]res|voiron)\b/i.test(
    `${title} ${excerpt}`,
  );
}

/** Parse RSS 2.0 XML into Tour news updates. */
export function parseTourRss(xml: string, source: string): TourNewsUpdate[] {
  const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  const updates: TourNewsUpdate[] = [];

  for (const block of items) {
    const title = stripAndDecodeHtml(extractRssTag(block, 'title'));
    const link = decodeFeedText(extractRssTag(block, 'link'));
    const guid = decodeFeedText(extractRssTag(block, 'guid'));
    const pubDate = extractRssTag(block, 'pubDate');
    const description = stripAndDecodeHtml(extractRssTag(block, 'description'));
    const rawImageUrl = extractRssImageUrl(block);
    const resolvedImageUrl = rawImageUrl ? resolveArticleImageUrl(rawImageUrl) : undefined;

    if (!title || !link) continue;
    if (!isTourRelevantNews(title, description)) continue;

    updates.push({
      id: guid || link,
      title,
      excerpt: description,
      url: link,
      source,
      publishedAt: parseRssDate(pubDate),
      imageUrl: resolvedImageUrl || undefined,
      tag: inferTourNewsTag(title, description),
    });
  }

  return updates;
}

function mergeUpdates(feedUpdates: TourNewsUpdate[][]): TourNewsUpdate[] {
  const byUrl = new Map<string, TourNewsUpdate>();

  for (const batch of feedUpdates) {
    for (const item of batch) {
      if (!byUrl.has(item.url)) {
        byUrl.set(item.url, item);
      }
    }
  }

  return [...byUrl.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

async function fetchNewsUpdates(): Promise<TourNewsUpdate[]> {
  const batches = await Promise.all(
    TOUR_DE_FRANCE_NEWS_FEEDS.map(async (feed) => {
      try {
        const response = await fetchWithTimeout(feed.url);
        if (!response.ok) return [];
        const xml = await response.text();
        return parseTourRss(xml, feed.name);
      } catch {
        return [];
      }
    }),
  );

  return mergeUpdates(batches);
}

export function getStaticRaceSnapshot(): TourRaceSnapshot {
  return TOUR_DE_FRANCE_2026;
}

export function getStageByNumber(
  race: TourRaceSnapshot,
  stageNumber: number,
): TourStage | undefined {
  return race.stages.find((stage) => stage.number === stageNumber);
}

export function getTimelineWindow(
  stages: TourStage[],
  currentStageNumber: number,
  windowSize = 5,
): TourStage[] {
  if (stages.length <= windowSize) return stages;
  const currentIndex = Math.max(
    0,
    stages.findIndex((stage) => stage.number === currentStageNumber),
  );
  const half = Math.floor(windowSize / 2);
  let start = Math.max(0, currentIndex - half);
  const end = Math.min(stages.length, start + windowSize);
  start = Math.max(0, end - windowSize);
  return stages.slice(start, end);
}

export function formatStagePillLabel(stageNumber: number): string {
  return `Stage ${stageNumber}`;
}

export function collapsedGcStandings(
  riders: TourGcRider[],
  limit = 5,
): TourGcRider[] {
  return riders.slice(0, limit);
}

export function jerseyHolders(race: TourRaceSnapshot): TourJerseyHolder[] {
  return race.jerseys;
}

export function featuredRiders(race: TourRaceSnapshot): TourRider[] {
  return race.riders;
}

export { stageStatus };

/** Load static race snapshot + Tour news RSS. */
export async function fetchTourDeFranceFeed(): Promise<TourFeedResult> {
  const race = getStaticRaceSnapshot();
  const errors: string[] = [];

  let updates: TourNewsUpdate[] = [];
  try {
    updates = await fetchNewsUpdates();
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Could not load Tour news');
  }

  return {
    race,
    updates,
    error: errors.length > 0 ? errors.join(' · ') : undefined,
  };
}
