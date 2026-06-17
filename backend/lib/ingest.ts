import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

import Parser from 'rss-parser';

import {
  getLastIngestAt,
  listGuardianArticlesNeedingHeroRepair,
  pruneOldArticles,
  setLastIngestAt,
  updateArticleImageUrl,
  upsertArticle,
} from './db';
import {
  augmentFeedItemMediaFromXml,
  extractItemMediaFromFeedXml,
} from './feedMedia';
import { repairBrokenGuardianImageUrl } from '../../catalog/guardianImageUrl';
import { FEEDS } from './feeds';
import { normalizeFeedItem } from './normalize';
import {
  articleNeedsHeroEnrichment,
  enrichArticlesMissingHeroImages,
} from './ogImage';
import { Article } from './types';

const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_REDIRECTS = 5;

const PARSER_HEADERS = {
  Accept: 'application/rss+xml, application/xml, text/xml, */*',
  'User-Agent': 'DailyFoldReader/1.0 (+https://github.com/brannonglover/current)',
};

const INSECURE_TLS_AGENT = new https.Agent({ rejectUnauthorized: false });

const PARSER_CUSTOM_FIELDS = {
  item: [
    // keepArray: Guardian (and others) ship multiple <media:content> widths; default parser keeps only the first (smallest).
    ['media:content', 'mediaContent', { keepArray: true }],
    ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    ['media:group', 'mediaGroup'],
    ['media:restriction', 'mediaRestriction'],
    ['dc:accessRights', 'accessRights'],
  ],
};

function createParser(timeoutMs: number) {
  return new Parser({
    timeout: timeoutMs,
    headers: PARSER_HEADERS,
    customFields: PARSER_CUSTOM_FIELDS,
  });
}

function isTlsVerificationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return (
    code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    /certificate/i.test(error.message)
  );
}

function fetchFeedXml(
  feedUrl: string,
  timeoutMs: number,
  allowInsecureTls: boolean,
  redirectCount = 0,
): Promise<string> {
  const url = new URL(feedUrl);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.get(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: PARSER_HEADERS,
        agent: isHttps && allowInsecureTls ? INSECURE_TLS_AGENT : undefined,
        timeout: timeoutMs,
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (redirectCount >= MAX_FEED_REDIRECTS) {
            reject(new Error('Too many redirects'));
            return;
          }
          const nextUrl = new URL(res.headers.location, feedUrl).href;
          fetchFeedXml(nextUrl, timeoutMs, allowInsecureTls, redirectCount + 1)
            .then(resolve, reject);
          return;
        }

        if (!res.statusCode || res.statusCode >= 300) {
          reject(new Error(`Status code ${res.statusCode ?? 'unknown'}`));
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => resolve(body));
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });
  });
}

async function fetchFeedXmlWithTlsFallback(feedUrl: string, timeoutMs: number): Promise<string> {
  try {
    return await fetchFeedXml(feedUrl, timeoutMs, false);
  } catch (error) {
    if (!isTlsVerificationError(error)) throw error;
    return fetchFeedXml(feedUrl, timeoutMs, true);
  }
}

const ITEMS_PER_FEED = Number(process.env.ITEMS_PER_FEED ?? 50);
const MAX_ARTICLE_AGE_DAYS = Number(process.env.MAX_ARTICLE_AGE_DAYS ?? 30);

let lastGuardianHeroRepairAt = 0;
const GUARDIAN_HERO_REPAIR_COOLDOWN_MS = 5 * 60 * 1000;

function shouldRunGuardianHeroRepair(): boolean {
  return Date.now() - lastGuardianHeroRepairAt >= GUARDIAN_HERO_REPAIR_COOLDOWN_MS;
}

function markGuardianHeroRepairStarted(): void {
  lastGuardianHeroRepairAt = Date.now();
}

export interface IngestOptions {
  verbose?: boolean;
}

function resolveVerbose(options: IngestOptions = {}): boolean {
  if (options.verbose !== undefined) return options.verbose;
  const env = process.env.INGEST_VERBOSE;
  return env === '1' || env === 'true';
}

function createProgressLogger(
  log: (message: string) => void,
  label: string,
  total: number,
  interval = 10,
): (completed: number, count: number) => void {
  let lastLogged = 0;
  return (completed, count) => {
    const shouldLog =
      completed === count || completed - lastLogged >= interval || count <= interval;
    if (!shouldLog) return;
    log(`${label}: ${completed}/${count}`);
    lastLogged = completed;
  };
}

function createHeroEnrichmentOptions(
  log: (message: string) => void,
  label: string,
  total: number,
) {
  return {
    onProgress: createProgressLogger(log, label, total),
    onHeartbeat: (completed: number, count: number, remaining: number) => {
      log(`${label}: still waiting (${completed}/${count}, ${remaining} remaining)...`);
    },
    onFetchTimeout: (url: string, elapsedMs: number) => {
      log(`${label}: fetch timed out after ${elapsedMs}ms — ${url}`);
    },
  };
}

function applyGuardianHeroFallback(article: Article): void {
  if (!article.source.startsWith('The Guardian')) return;
  if (!articleNeedsHeroEnrichment(article.imageUrl)) return;

  const fallback = repairBrokenGuardianImageUrl(article.imageUrl);
  if (fallback && fallback !== article.imageUrl) {
    article.imageUrl = fallback;
  }
}

/** Backfill Guardian heroes in the background (throttled). Safe to call from feed API reads. */
export function scheduleGuardianHeroRepair(): void {
  if (!shouldRunGuardianHeroRepair()) return;
  markGuardianHeroRepairStarted();
  void repairStoredGuardianHeroImages();
}

async function repairStoredGuardianHeroImages(
  log: (message: string) => void = () => {},
): Promise<number> {
  const stored = listGuardianArticlesNeedingHeroRepair();
  if (stored.length === 0) {
    log('Guardian hero repair: none needed');
    return 0;
  }

  log(`Guardian hero repair: ${stored.length} rows in database`);

  const articles = stored.map((row) => ({
    id: row.id,
    url: row.url,
    imageUrl: row.imageUrl,
  }));

  const repairTargets = articles.filter((article) => articleNeedsHeroEnrichment(article.imageUrl));
  const enrichStarted = Date.now();
  const { enriched } = await enrichArticlesMissingHeroImages(
    articles,
    createHeroEnrichmentOptions(log, 'Guardian hero repair (OG fetch)', repairTargets.length),
  );
  log(
    `Guardian hero repair (OG fetch): ${enriched} enriched in ${Date.now() - enrichStarted}ms`,
  );

  let repaired = 0;
  for (const article of articles) {
    const original = stored.find((row) => row.id === article.id);
    if (!original) continue;

    if (article.imageUrl !== original.imageUrl) {
      updateArticleImageUrl(article.id, article.imageUrl);
      repaired += 1;
      continue;
    }

    const fallback = repairBrokenGuardianImageUrl(original.imageUrl);
    if (fallback !== original.imageUrl) {
      updateArticleImageUrl(article.id, fallback);
      repaired += 1;
    }
  }

  log(`Guardian hero repair: ${repaired} rows updated`);
  return repaired;
}

export interface IngestResult {
  feedsTotal: number;
  feedsProcessed: number;
  feedsFailed: number;
  itemsSeen: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsPruned: number;
  errors: string[];
  completedAt: string;
}

export async function ingestFeeds(options: IngestOptions = {}): Promise<IngestResult> {
  const verbose = resolveVerbose(options);
  const log = (message: string) => {
    if (verbose) console.log(`[ingest] ${message}`);
  };

  const ingestStarted = Date.now();
  log(`Starting ingest of ${FEEDS.length} feeds`);

  const result: IngestResult = {
    feedsTotal: FEEDS.length,
    feedsProcessed: 0,
    feedsFailed: 0,
    itemsSeen: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsPruned: 0,
    errors: [],
    completedAt: new Date().toISOString(),
  };

  const feedFetchStarted = Date.now();
  log('Fetching RSS feeds...');

  const feedResults = await Promise.allSettled(
    FEEDS.map(async (feed, index) => {
      const feedStarted = Date.now();
      try {
        const timeoutMs = feed.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
        const xml = await fetchFeedXmlWithTlsFallback(feed.url, timeoutMs);
        const parsed = await createParser(timeoutMs).parseString(xml);
        const mediaByKey = extractItemMediaFromFeedXml(xml);
        const itemCount = Math.min(parsed.items.length, ITEMS_PER_FEED);
        log(
          `  [${index + 1}/${FEEDS.length}] ${feed.source}: ${itemCount} items (${Date.now() - feedStarted}ms)`,
        );
        return { feed, parsed, mediaByKey };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown feed error';
        log(
          `  [${index + 1}/${FEEDS.length}] ${feed.source}: FAILED — ${message} (${Date.now() - feedStarted}ms)`,
        );
        throw error;
      }
    }),
  );

  log(
    `Feeds fetched in ${Date.now() - feedFetchStarted}ms (${feedResults.filter((r) => r.status === 'fulfilled').length} ok, ${feedResults.filter((r) => r.status === 'rejected').length} failed)`,
  );

  const pending: { article: Article; feedPublishedAt?: string }[] = [];

  for (let i = 0; i < feedResults.length; i += 1) {
    const feedResult = feedResults[i];
    const feed = FEEDS[i];

    if (feedResult.status === 'rejected') {
      const message =
        feedResult.reason instanceof Error ? feedResult.reason.message : 'Unknown feed error';
      result.errors.push(`${feed.source}: ${message}`);
      result.feedsFailed += 1;
      continue;
    }

    const { parsed, mediaByKey } = feedResult.value;
    result.feedsProcessed += 1;

    for (const item of parsed.items.slice(0, ITEMS_PER_FEED)) {
      augmentFeedItemMediaFromXml(item, mediaByKey);
      result.itemsSeen += 1;
      const normalized = normalizeFeedItem(item, feed);
      if (!normalized) continue;

      pending.push({
        article: normalized.article,
        feedPublishedAt: normalized.feedPublishedAt,
      });
    }
  }

  log(`Normalized ${pending.length} articles from ${result.itemsSeen} feed items`);

  const enrichTargets = pending.filter((entry) =>
    articleNeedsHeroEnrichment(entry.article.imageUrl),
  );
  if (enrichTargets.length === 0) {
    log('Hero image enrichment: none needed');
  } else {
    log(`Hero image enrichment: ${enrichTargets.length} articles`);
    const enrichStarted = Date.now();
    const { enriched } = await enrichArticlesMissingHeroImages(
      pending.map((entry) => entry.article),
      createHeroEnrichmentOptions(log, 'Enriching hero images', enrichTargets.length),
    );
    log(`Hero image enrichment: ${enriched} found in ${Date.now() - enrichStarted}ms`);
  }

  const upsertStarted = Date.now();
  const upsertLogInterval = Math.max(25, Math.floor(pending.length / 10));
  for (let i = 0; i < pending.length; i += 1) {
    const entry = pending[i]!;
    applyGuardianHeroFallback(entry.article);

    const action = upsertArticle(entry.article, {
      feedPublishedAt: entry.feedPublishedAt,
    });
    if (action === 'inserted') result.itemsInserted += 1;
    else result.itemsUpdated += 1;

    const done = i + 1;
    if (verbose && (done % upsertLogInterval === 0 || done === pending.length)) {
      log(`Upserting articles: ${done}/${pending.length}`);
    }
  }
  log(
    `Upserted ${pending.length} articles (${result.itemsInserted} new, ${result.itemsUpdated} updated) in ${Date.now() - upsertStarted}ms`,
  );

  if (shouldRunGuardianHeroRepair()) {
    markGuardianHeroRepairStarted();
    await repairStoredGuardianHeroImages(log);
  } else {
    log(
      `Guardian hero repair: skipped (cooldown ${Math.round(GUARDIAN_HERO_REPAIR_COOLDOWN_MS / 60_000)}m)`,
    );
  }

  result.itemsPruned = pruneOldArticles(MAX_ARTICLE_AGE_DAYS);
  if (result.itemsPruned > 0) {
    log(`Pruned ${result.itemsPruned} articles older than ${MAX_ARTICLE_AGE_DAYS} days`);
  }
  setLastIngestAt(result.completedAt);

  log(`Done in ${Date.now() - ingestStarted}ms`);
  return result;
}

export function isIngestStale(intervalMs: number): boolean {
  const last = getLastIngestAt();
  if (!last) return true;
  return Date.now() - last.getTime() > intervalMs;
}
