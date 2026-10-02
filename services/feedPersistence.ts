import AsyncStorage from '@react-native-async-storage/async-storage';

import { likedArticleSnapshot } from '@/services/likedArticles';
import {
  buildFeedSnapshotRecord,
  parseFeedSnapshotRecord,
  type FeedSnapshotRecord,
} from '@/shared/feed/snapshot';
import { Article } from '@/types';

const FEED_SNAPSHOT_PREFIX = '@dailyfold/feed/';
export const MAX_FEED_SNAPSHOT_ARTICLES = 120;

const memorySnapshots = new Map<string, FeedSnapshotRecord>();

function feedSnapshotKey(userId: string, sourceIdsKey: string): string {
  return `${FEED_SNAPSHOT_PREFIX}${userId}/${sourceIdsKey}`;
}

function memoryKey(userId: string, sourceIdsKey: string): string {
  return `${userId}/${sourceIdsKey}`;
}

/** Trim and strip bodies before persisting — full body loads in the reader. */
export function trimFeedSnapshot(articles: Article[]): Article[] {
  return articles.slice(0, MAX_FEED_SNAPSHOT_ARTICLES).map(likedArticleSnapshot);
}

function remember(userId: string, sourceIdsKey: string, record: FeedSnapshotRecord): void {
  memorySnapshots.set(memoryKey(userId, sourceIdsKey), record);
}

async function readStoredFeedSnapshotRecord(
  userId: string,
  sourceIdsKey: string,
): Promise<FeedSnapshotRecord | null> {
  const raw = await AsyncStorage.getItem(feedSnapshotKey(userId, sourceIdsKey));
  if (!raw) return null;
  try {
    const parsed = parseFeedSnapshotRecord(JSON.parse(raw) as unknown);
    if (parsed) remember(userId, sourceIdsKey, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function loadFeedSnapshotRecord(
  userId: string,
  sourceIdsKey: string,
): Promise<FeedSnapshotRecord | null> {
  const cached = memorySnapshots.get(memoryKey(userId, sourceIdsKey));
  if (cached && cached.articles.length > 0) return cached;
  return readStoredFeedSnapshotRecord(userId, sourceIdsKey);
}

/**
 * Always re-read storage. Background maintenance may have replaced the
 * snapshot in another JS context while this process still holds A in memory.
 */
export async function reloadFeedSnapshotRecord(
  userId: string,
  sourceIdsKey: string,
): Promise<FeedSnapshotRecord | null> {
  const stored = await readStoredFeedSnapshotRecord(userId, sourceIdsKey);
  if (stored) return stored;
  const cached = memorySnapshots.get(memoryKey(userId, sourceIdsKey));
  return cached && cached.articles.length > 0 ? cached : null;
}

export async function loadFeedSnapshot(
  userId: string,
  sourceIdsKey: string,
): Promise<Article[] | null> {
  const record = await loadFeedSnapshotRecord(userId, sourceIdsKey);
  return record?.articles ?? null;
}

/**
 * Persist a ranked snapshot. Writes one JSON value so a crash mid-write cannot
 * leave a half-cleared cache — the previous record stays until this setItem
 * completes. Empty incoming pages are ignored so a failed refresh cannot
 * destroy a valid snapshot.
 */
export async function saveFeedSnapshot(
  userId: string,
  sourceIdsKey: string,
  articles: Article[],
  extras?: {
    lastFeedRefreshAt?: string;
    newestPublishedAt?: string | null;
    rankWindowStart?: string | null;
  },
): Promise<FeedSnapshotRecord | null> {
  const trimmed = trimFeedSnapshot(articles);
  const previous =
    memorySnapshots.get(memoryKey(userId, sourceIdsKey)) ??
    (await loadFeedSnapshotRecord(userId, sourceIdsKey));
  const record = buildFeedSnapshotRecord(trimmed, previous, {
    lastFeedRefreshAt: extras?.lastFeedRefreshAt ?? new Date().toISOString(),
    newestPublishedAt: extras?.newestPublishedAt,
    rankWindowStart: extras?.rankWindowStart,
  });
  if (!record) return previous ?? null;

  remember(userId, sourceIdsKey, record);
  await AsyncStorage.setItem(feedSnapshotKey(userId, sourceIdsKey), JSON.stringify(record));
  return record;
}

/** Test-only: drop the in-process cache so the next load hits storage. */
export function clearFeedSnapshotMemoryForTests(): void {
  memorySnapshots.clear();
}
