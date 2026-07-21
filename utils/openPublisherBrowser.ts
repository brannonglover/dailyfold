import { router } from 'expo-router';
import { Platform } from 'react-native';

export type OpenPublisherOptions = {
  title?: string;
  source?: string;
};

/** True when the article has an http(s) permalink suitable for "Open on …". */
export function hasOpenablePublisherUrl(url: string | undefined): boolean {
  const trimmed = url?.trim();
  return Boolean(trimmed && /^https?:\/\//i.test(trimmed));
}

/** Build the in-app publisher browser path with encoded query params. */
export function publisherBrowserHref(
  url: string,
  options?: OpenPublisherOptions,
): `/browser?${string}` {
  const params = new URLSearchParams({ url });
  const title = options?.title?.trim();
  const source = options?.source?.trim();
  if (title) params.set('title', title);
  if (source) params.set('source', source);
  return `/browser?${params.toString()}` as `/browser?${string}`;
}

/**
 * Opens the publisher site in the Dailyfold in-app browser.
 * On web, opens a new tab instead.
 */
export async function openPublisherArticle(
  url: string,
  options?: OpenPublisherOptions,
): Promise<void> {
  if (!hasOpenablePublisherUrl(url)) return;

  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  router.push(publisherBrowserHref(url, options));
}
