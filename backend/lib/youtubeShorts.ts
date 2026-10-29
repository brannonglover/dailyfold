import { listKnownShortIds, recordYouTubeShorts, type YouTubeShortRecord } from './db';
import { VIDEO_CHANNELS, type VideoChannel } from './videoChannels';

const DEFAULT_CONCURRENCY = 8;
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = 'Mozilla/5.0 (compatible; DailyFoldBot/1.0)';

export interface ShortsScanOptions {
  concurrency?: number;
  log?: (message: string) => void;
}

export interface ShortsScanSummary {
  channels: number;
  channelErrors: number;
  newShorts: number;
  embeddable: number;
}

interface FeedEntry {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl: string;
  channelName: string;
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function parseShortsFeed(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const body = match[1];
    const videoId = body.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1];
    const title = body.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const publishedAt = body.match(/<published>([^<]+)<\/published>/)?.[1];
    if (!videoId || !title || !publishedAt) continue;
    entries.push({
      videoId,
      title: decodeXml(title).trim(),
      publishedAt,
      thumbnailUrl: body.match(/<media:thumbnail url="([^"]+)"/)?.[1] ?? '',
      channelName: decodeXml(body.match(/<author>\s*<name>([\s\S]*?)<\/name>/)?.[1] ?? '').trim(),
    });
  }
  return entries;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** The channel's Shorts-only playlist: its id is the channel id with "UC" swapped for "UUSH". */
async function fetchChannelShorts(channel: VideoChannel): Promise<FeedEntry[]> {
  const response = await fetchWithTimeout(
    `https://www.youtube.com/feeds/videos.xml?playlist_id=UUSH${channel.id.slice(2)}`,
  );
  if (!response.ok) throw new Error(`feed ${response.status}`);
  return parseShortsFeed(await response.text());
}

/**
 * oEmbed answers 200 for videos that can be embedded, 401 when the owner disabled embedding,
 * and 404 for private/removed ones. Anything else (rate limit, network) is "unknown" so the
 * short is retried on the next run instead of being recorded as blocked.
 */
async function isEmbeddable(videoId: string): Promise<boolean | null> {
  try {
    const watchUrl = encodeURIComponent(`https://www.youtube.com/shorts/${videoId}`);
    const response = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${watchUrl}&format=json`,
    );
    if (response.ok) return true;
    if (response.status === 401 || response.status === 403 || response.status === 404) return false;
    return null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

/**
 * Pulls each curated channel's latest Shorts, checks the new ones can be embedded, and stores
 * them for the Videos tab. Cheap to run often: known videos are skipped before any oEmbed call.
 */
export async function scanYouTubeShorts(options: ShortsScanOptions = {}): Promise<ShortsScanSummary> {
  const log = options.log ?? (() => {});
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  let channelErrors = 0;
  const feeds = await mapWithConcurrency(VIDEO_CHANNELS, concurrency, async (channel) => {
    try {
      return { channel, entries: await fetchChannelShorts(channel) };
    } catch (error) {
      channelErrors += 1;
      log(`${channel.handle}: ${error instanceof Error ? error.message : 'failed'}`);
      return { channel, entries: [] as FeedEntry[] };
    }
  });

  const known = await listKnownShortIds(feeds.flatMap((f) => f.entries.map((e) => e.videoId)));
  const fresh = feeds.flatMap(({ channel, entries }) =>
    entries.filter((entry) => !known.has(entry.videoId)).map((entry) => ({ channel, entry })),
  );

  const checked = await mapWithConcurrency(fresh, concurrency, async ({ channel, entry }) => {
    const embeddable = await isEmbeddable(entry.videoId);
    if (embeddable === null) return null;
    const record: YouTubeShortRecord = {
      videoId: entry.videoId,
      channelId: channel.id,
      channelName: entry.channelName || channel.handle,
      topic: channel.topic,
      title: entry.title,
      thumbnailUrl: entry.thumbnailUrl,
      embeddable,
      publishedAt: entry.publishedAt,
    };
    return record;
  });

  const records = checked.filter((record): record is YouTubeShortRecord => record !== null);
  await recordYouTubeShorts(records);

  const summary: ShortsScanSummary = {
    channels: VIDEO_CHANNELS.length,
    channelErrors,
    newShorts: records.length,
    embeddable: records.filter((record) => record.embeddable).length,
  };
  log(
    `${summary.channels} channels (${channelErrors} failed), ${summary.newShorts} new, ` +
      `${summary.embeddable} embeddable`,
  );
  return summary;
}
