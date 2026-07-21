import { articleCount } from './db';
import { IngestResult, ingestFeeds, isIngestStale } from './ingest';

const INGEST_INTERVAL_MS = Number(process.env.INGEST_INTERVAL_MS ?? 30 * 60 * 1000);

let activeIngest: Promise<IngestResult> | null = null;

export function getIngestIntervalMs() {
  return INGEST_INTERVAL_MS;
}

export async function runIngestCycle(): Promise<IngestResult> {
  if (activeIngest) return activeIngest;

  activeIngest = ingestFeeds().finally(() => {
    activeIngest = null;
  });

  return activeIngest;
}

export interface EnsureFreshResult {
  ingestTriggered: boolean;
  ingestAwaited: boolean;
  ingestResult?: IngestResult;
}

/**
 * Keeps the article cache fresh:
 * - Empty DB → ingest and wait (first load)
 * - Stale cache or force refresh → ingest in background, return current articles immediately
 * - Fresh cache → no-op
 */
export async function ensureFreshArticles(
  options: { force?: boolean; awaitIngest?: boolean } = {},
): Promise<EnsureFreshResult> {
  const empty = (await articleCount()) === 0;
  const stale = options.force || (await isIngestStale(INGEST_INTERVAL_MS));

  if (!empty && !stale) {
    return { ingestTriggered: false, ingestAwaited: false };
  }

  const shouldAwait = empty || options.awaitIngest === true;

  if (shouldAwait) {
    const ingestResult = await runIngestCycle();
    return { ingestTriggered: true, ingestAwaited: true, ingestResult };
  }

  void runIngestCycle();
  return { ingestTriggered: true, ingestAwaited: false };
}
