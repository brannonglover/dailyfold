import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { articlePath } from '@/utils/notificationArticleLink';

import {
  ensureTrendingNotificationChannel,
  getNotificationPermissionGranted,
  notificationsAvailable,
  scheduleLocalNotification,
  TRENDING_CHANNEL_ID,
} from '@/services/notificationSetup';
import { getCachedPushToken } from '@/services/pushNotifications';
import {
  getNotifiedArticleIds,
  isWithinTrendingNotificationCooldown,
  markArticleNotified,
  markTrendingNotificationSent,
} from '@/services/trendingNotificationState';
import { Article, UserPreferences } from '@/types';
import { POST_INGEST_NOTIFICATION_DELAY_MS } from '@/utils/postIngestNotificationDelay';
import { findHotTrendingCandidates } from '@/utils/trendingArticles';
import { isTrendingNotificationRelevant } from '@/utils/trendingNotificationInterest';

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
    data: {
      articleId: article.id,
      url: Linking.createURL(articlePath(article.id)),
    },
    ...(Platform.OS === 'android' ? { channelId: TRENDING_CHANNEL_ID } : {}),
  });
}

export async function processHotTrendingNotifications(
  userId: string,
  articles: Article[],
  enabled: boolean,
  preferences?: UserPreferences,
): Promise<void> {
  if (!enabled || !notificationsAvailable()) return;
  if (!(await getNotificationPermissionGranted())) return;

  if (await isWithinTrendingNotificationCooldown(userId)) return;

  const notified = await getNotifiedArticleIds(userId);
  const candidates = findHotTrendingCandidates(articles);
  const next = candidates.find((c) => {
    if (notified.has(c.article.id)) return false;
    if (
      preferences &&
      !isTrendingNotificationRelevant(c.article, preferences, Date.now(), c.burstCount)
    ) {
      return false;
    }
    return true;
  });
  if (!next) return;

  await presentHotTrendingNotification(next.article);
  await markArticleNotified(userId, next.article.id);
  await markTrendingNotificationSent(userId);
}

type PendingImportNotification = {
  userId: string;
  articles: Article[];
  preferences?: UserPreferences;
};

let pendingImportNotification: PendingImportNotification | null = null;
let importNotificationTimer: ReturnType<typeof setTimeout> | null = null;

export function cancelScheduledImportNotifications(): void {
  if (importNotificationTimer) {
    clearTimeout(importNotificationTimer);
    importNotificationTimer = null;
  }
  pendingImportNotification = null;
}

/**
 * Hold local trending alerts until shortly after an RSS import.
 * The first call starts the wait; later calls only refresh the payload.
 * Remote-push devices skip this path — the notify cron already waits.
 */
export async function scheduleHotTrendingNotificationsAfterImport(
  userId: string,
  articles: Article[],
  preferences?: UserPreferences,
  delayMs: number = POST_INGEST_NOTIFICATION_DELAY_MS,
): Promise<void> {
  if (await getCachedPushToken(userId)) return;

  pendingImportNotification = { userId, articles, preferences };
  if (importNotificationTimer) return;

  importNotificationTimer = setTimeout(() => {
    importNotificationTimer = null;
    const pending = pendingImportNotification;
    pendingImportNotification = null;
    if (!pending) return;
    void processHotTrendingNotifications(
      pending.userId,
      pending.articles,
      true,
      pending.preferences,
    );
  }, delayMs);
}
