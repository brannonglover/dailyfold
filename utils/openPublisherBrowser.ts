import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

/** True when the article has an http(s) permalink suitable for "Open on …". */
export function hasOpenablePublisherUrl(url: string | undefined): boolean {
  const trimmed = url?.trim();
  return Boolean(trimmed && /^https?:\/\//i.test(trimmed));
}

let warmUpPromise: Promise<void> | null = null;

/** Preload the in-app browser so the first "View full article" tap feels instant. */
export function warmUpPublisherBrowser(): void {
  if (Platform.OS === 'web') return;
  warmUpPromise ??= WebBrowser.warmUpAsync()
    .then(() => undefined)
    .catch(() => undefined);
}

/** Opens the publisher site in an in-app browser with a close (X) control on iOS. */
export async function openPublisherArticle(url: string): Promise<void> {
  if (!hasOpenablePublisherUrl(url)) return;
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  warmUpPublisherBrowser();

  await WebBrowser.openBrowserAsync(url, {
    dismissButtonStyle: 'close',
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    enableBarCollapsing: true,
    showTitle: true,
  });
}
