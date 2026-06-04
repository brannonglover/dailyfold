import { Platform, Share, ShareContent } from 'react-native';

import { Article } from '@/types';

/** Publisher URL — never a Beacon deep link. */
export function getPublisherShareUrl(article: Article): string | null {
  const url = article.url?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function buildShareContent(publisherUrl: string): ShareContent {
  if (Platform.OS === 'ios') {
    return { url: publisherUrl };
  }

  // Android ignores the `url` field — message must carry the link.
  return { message: publisherUrl };
}

async function shareOnWeb(publisherUrl: string): Promise<void> {
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    await navigator.share({ url: publisherUrl });
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(publisherUrl);
    return;
  }

  throw new Error('Sharing is not available in this browser.');
}

/** Share the article's publisher link so recipients can open it in any app. */
export async function shareArticle(article: Article): Promise<void> {
  const publisherUrl = getPublisherShareUrl(article);
  if (!publisherUrl) {
    throw new Error('This article does not have a shareable link.');
  }

  if (Platform.OS === 'web') {
    await shareOnWeb(publisherUrl);
    return;
  }

  const content = buildShareContent(publisherUrl);
  await Share.share(content, {
    dialogTitle: 'Share link',
  });
}
