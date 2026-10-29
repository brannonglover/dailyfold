import { listArticlesNeedingVideoScan, recordVideoScans, type VideoScanResult } from './db';
import { extractReaderContent } from './extract';
import type { Article } from './types';
import { videoMatchesHeadline } from './videoRelevance';

const DEFAULT_SINCE_HOURS = Number(process.env.VIDEO_SCAN_SINCE_HOURS ?? 48);
const DEFAULT_BATCH_SIZE = 40;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_BUDGET_MS = 200_000;
const PER_ARTICLE_TIMEOUT_MS = 20_000;

export interface VideoScanOptions {
  /** Only articles published within this many hours are checked. */
  sinceHours?: number;
  /** Stop starting new batches once this much wall time has passed. */
  budgetMs?: number;
  concurrency?: number;
  /** Hard cap on articles scanned this run. */
  maxArticles?: number;
  log?: (message: string) => void;
}

export interface VideoScanSummary {
  scanned: number;
  withVideo: number;
}

/**
 * Direct-file videos only (MP4/WebM/MOV): they play in the native player, which is what a
 * swipe-up feed needs. YouTube/Vimeo embeds stay in the reader. Clips whose caption is about
 * something other than the headline are skipped (see videoRelevance.ts).
 */
async function scanArticle(article: Article): Promise<VideoScanResult> {
  try {
    const content = await Promise.race([
      extractReaderContent(article),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), PER_ARTICLE_TIMEOUT_MS),
      ),
    ]);
    for (const block of content.blocks) {
      if (
        block.type === 'video' &&
        block.provider === 'file' &&
        videoMatchesHeadline(block.caption, article.title)
      ) {
        // iOS blocks cleartext (ATS); publishers like Fox serve the same file over https.
        const url = block.url.replace(/^http:\/\//i, 'https://');
        return { article, video: { url, poster: block.poster, caption: block.caption } };
      }
    }
  } catch {
    // Treated as "no video": the article is still marked scanned so one flaky page
    // can't be refetched on every run.
  }
  return { article };
}

export async function scanArticlesForVideos(
  options: VideoScanOptions = {},
): Promise<VideoScanSummary> {
  const log = options.log ?? (() => {});
  const sinceHours = options.sinceHours ?? DEFAULT_SINCE_HOURS;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const maxArticles = options.maxArticles ?? Number.POSITIVE_INFINITY;
  const started = Date.now();
  const summary: VideoScanSummary = { scanned: 0, withVideo: 0 };

  while (Date.now() - started < budgetMs && summary.scanned < maxArticles) {
    const batchSize = Math.min(DEFAULT_BATCH_SIZE, maxArticles - summary.scanned);
    const batch = await listArticlesNeedingVideoScan(sinceHours, batchSize);
    if (batch.length === 0) break;

    const results: VideoScanResult[] = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, batch.length) }, async () => {
        while (next < batch.length) {
          results.push(await scanArticle(batch[next++]));
        }
      }),
    );

    summary.withVideo += await recordVideoScans(results);
    summary.scanned += results.length;
    log(`video scan: ${summary.scanned} scanned, ${summary.withVideo} with video`);
  }

  return summary;
}
