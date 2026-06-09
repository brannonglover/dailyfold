import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

import Parser from 'rss-parser';

import {
  getLastIngestAt,
  pruneOldArticles,
  setLastIngestAt,
  upsertArticle,
} from './db';
import { FEEDS } from './feeds';
import { normalizeFeedItem } from './normalize';
import { enrichArticlesMissingHeroImages } from './ogImage';
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

export async function ingestFeeds(): Promise<IngestResult> {
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

  const feedResults = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const timeoutMs = feed.fetchTimeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
      const xml = await fetchFeedXmlWithTlsFallback(feed.url, timeoutMs);
      const parsed = await createParser(timeoutMs).parseString(xml);
      return { feed, parsed };
    }),
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

    const { parsed } = feedResult.value;
    result.feedsProcessed += 1;

    for (const item of parsed.items.slice(0, ITEMS_PER_FEED)) {
      result.itemsSeen += 1;
      const normalized = normalizeFeedItem(item, feed);
      if (!normalized) continue;

      pending.push({
        article: normalized.article,
        feedPublishedAt: normalized.feedPublishedAt,
      });
    }
  }

  await enrichArticlesMissingHeroImages(pending.map((entry) => entry.article));

  for (const entry of pending) {
    const action = upsertArticle(entry.article, {
      feedPublishedAt: entry.feedPublishedAt,
    });
    if (action === 'inserted') result.itemsInserted += 1;
    else result.itemsUpdated += 1;
  }

  result.itemsPruned = pruneOldArticles(MAX_ARTICLE_AGE_DAYS);
  setLastIngestAt(result.completedAt);

  return result;
}

export function isIngestStale(intervalMs: number): boolean {
  const last = getLastIngestAt();
  if (!last) return true;
  return Date.now() - last.getTime() > intervalMs;
}
