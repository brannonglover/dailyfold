import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import {
  clearLastNotificationResponse,
  getLastNotificationResponse,
  initNotifications,
  notificationsAvailable,
  subscribeToNotificationResponses,
} from '@/services/notificationSetup';

function articleIdFromNotification(
  notification: { request: { content: { data?: unknown } } } | undefined,
): string | undefined {
  const data = notification?.request.content.data;
  if (!data || typeof data !== 'object') return undefined;
  const articleId = (data as { articleId?: unknown }).articleId;
  return typeof articleId === 'string' ? articleId : undefined;
}

function responseKey(notification: { date: number; request: { identifier: string } }): string {
  return `${notification.request.identifier}:${notification.date}`;
}

/** Tracks notification taps already navigated (survives effect re-runs / Strict Mode). */
const handledResponseKeys = new Set<string>();

/** Deep-link to an article when the user taps a trending notification. */
export function useNotificationNavigation() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (Platform.OS === 'web' || !notificationsAvailable()) return;

    let subscription: { remove: () => void } | undefined;

    void (async () => {
      try {
        await initNotifications();

        function openArticleFromNotification(
          notification: { request: { content: { data?: unknown } } } | undefined,
        ) {
          const articleId = articleIdFromNotification(notification);
          if (articleId) routerRef.current.push(`/article/${articleId}`);
        }

        function handleNotificationResponse(response: {
          notification: { date: number; request: { identifier: string; content: { data?: unknown } } };
        }) {
          const key = responseKey(response.notification);
          if (handledResponseKeys.has(key)) return;
          handledResponseKeys.add(key);
          openArticleFromNotification(response.notification);
        }

        const last = await getLastNotificationResponse();
        if (last?.notification) {
          handleNotificationResponse(last);
          await clearLastNotificationResponse();
        }

        subscription =
          (await subscribeToNotificationResponses((response) => {
            handleNotificationResponse(response);
          })) ?? undefined;
      } catch {
        // Native notifications unavailable — skip deep-link setup.
      }
    })();

    return () => subscription?.remove();
  }, []);
}
