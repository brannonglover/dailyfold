import { Image } from 'expo-image';
import { InteractionManager } from 'react-native';

import { Article } from '@/types';
import { collectFeedImageUrls } from '@/utils/feedImageUrls';

/** Images the first screens need — fetched immediately and awaited by the splash hold. */
export const PRIORITY_IMAGE_COUNT = 12;
/** Total images warmed per feed update; the remainder trickles in after interactions. */
export const TOTAL_IMAGE_COUNT = 60;
const TRICKLE_CHUNK = 6;
const MAX_TRACKED_URLS = 400;

/** URLs whose prefetch finished — in the expo-image cache, so cards can skip the fade-in. */
const cachedUrls = new Set<string>();
/** URLs already requested this session (in flight or done), to avoid re-queueing. */
const requestedUrls = new Set<string>();

export function isFeedImageCached(url: string): boolean {
  return cachedUrls.has(url);
}

function remember(set: Set<string>, url: string) {
  if (set.size >= MAX_TRACKED_URLS) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(url);
}

async function prefetchUrls(urls: string[]): Promise<void> {
  const fresh = urls.filter((url) => !requestedUrls.has(url));
  if (fresh.length === 0) return;
  for (const url of fresh) remember(requestedUrls, url);

  // One URL per call: Image.prefetch resolves false as soon as any image fails, so a
  // single dead publisher URL must not mask the rest of the batch.
  await Promise.all(
    fresh.map(async (url) => {
      try {
        if (await Image.prefetch(url, 'memory-disk')) remember(cachedUrls, url);
        else requestedUrls.delete(url);
      } catch {
        requestedUrls.delete(url);
      }
    }),
  );
}

/**
 * Warm the expo-image cache for the stories the reader is about to see. The returned
 * promise resolves when the priority batch (the first screens) is done; the rest is
 * fetched in small chunks once interactions settle so it never competes with scrolling.
 */
export function prefetchFeedImages(articles: readonly Article[]): Promise<void> {
  const urls = collectFeedImageUrls(articles, TOTAL_IMAGE_COUNT);
  const priority = urls.slice(0, PRIORITY_IMAGE_COUNT);
  const rest = urls.slice(PRIORITY_IMAGE_COUNT);

  const priorityDone = prefetchUrls(priority);

  if (rest.length > 0) {
    void priorityDone.then(() => {
      InteractionManager.runAfterInteractions(async () => {
        for (let i = 0; i < rest.length; i += TRICKLE_CHUNK) {
          await prefetchUrls(rest.slice(i, i + TRICKLE_CHUNK));
        }
      });
    });
  }

  return priorityDone;
}
