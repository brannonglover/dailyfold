import { Platform } from 'react-native';

import {
  ensureTrendingNotificationChannel,
  getNotificationPermissionGranted,
  notificationsAvailable,
  scheduleLocalNotification,
  TRENDING_CHANNEL_ID,
} from '@/services/notificationSetup';
import {
  getNotifiedArticleIds,
  markArticleNotified,
} from '@/services/trendingNotificationState';
import { Article } from '@/types';
import { findHotTrendingCandidates } from '@/utils/trendingArticles';

/**
 * Local notifications when the app learns of new hot trending stories.
 * Remote push can reuse the same payload shape: `{ articleId: string }`.
 */
export async function presentHotTrendingNotification(article: Article): Promise<void> {
  if (!notificationsAvailable()) return;

  await ensureTrendingNotificationChannel();

  await scheduleLocalNotification({
    title: 'Trending now',
    body: `${article.title} — ${article.source}`,
    data: { articleId: article.id },
    ...(Platform.OS === 'android' ? { channelId: TRENDING_CHANNEL_ID } : {}),
  });
}

export async function processHotTrendingNotifications(
  userId: string,
  articles: Article[],
  enabled: boolean,
): Promise<void> {
  if (!enabled || !notificationsAvailable()) return;
  if (!(await getNotificationPermissionGranted())) return;

  const notified = await getNotifiedArticleIds(userId);
  const candidates = findHotTrendingCandidates(articles);
  const next = candidates.find((c) => !notified.has(c.article.id));
  if (!next) return;

  await presentHotTrendingNotification(next.article);
  await markArticleNotified(userId, next.article.id);
}
