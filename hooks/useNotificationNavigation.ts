import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { getRememberedArticle, rememberOpenArticle } from '@/services/articleSession';
import { takeWarmArticleCache, warmArticleCache } from '@/services/articleCache';
import {
  clearLastNotificationResponse,
  getLastNotificationResponse,
  initNotifications,
  notificationsAvailable,
  subscribeToNotificationResponses,
} from '@/services/notificationSetup';
import { cancelWorldCupMatchNotifications } from '@/services/worldCupNotificationScheduler';
import {
  articleIdFromNotificationPayload,
  articlePath,
  isValidArticleRouteId,
} from '@/utils/notificationArticleLink';

function worldCupScreenFromNotification(
  notification: { request: { content: { data?: unknown } } } | undefined,
): boolean {
  const data = notification?.request.content.data;
  if (!data || typeof data !== 'object') return false;
  return (data as { screen?: unknown }).screen === 'world-cup';
}

function responseKey(notification: { date: number; request: { identifier: string } }): string {
  return `${notification.request.identifier}:${notification.date}`;
}

/** Tracks notification taps already navigated (survives effect re-runs / Strict Mode). */
const handledResponseKeys = new Set<string>();

async function seedRememberedArticle(articleId: string): Promise<void> {
  if (getRememberedArticle(articleId)) return;

  warmArticleCache();
  const warmPromise = takeWarmArticleCache();
  if (!warmPromise) return;

  try {
    const warm = await warmPromise;
    const article = warm.articles.find((entry) => entry.id === articleId);
    if (article) rememberOpenArticle(article);
  } catch {
    // Warm cache may still be loading on cold start.
  }
}

async function getColdStartNotificationResponse(): Promise<
  Awaited<ReturnType<typeof getLastNotificationResponse>>
> {
  const last = await getLastNotificationResponse();
  if (last?.notification) return last;

  // Some devices surface the tap response a beat after JS boots.
  await new Promise((resolve) => setTimeout(resolve, 150));
  return getLastNotificationResponse();
}

/** Deep-link to an article when the user taps a trending notification. */
export function useNotificationNavigation() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const { isLoading: authLoading } = useAuth();
  const rootNavigationState = useRootNavigationState();
  const navigationReady = rootNavigationState?.key != null;

  useEffect(() => {
    if (Platform.OS === 'web' || !notificationsAvailable()) return;
    if (authLoading || !navigationReady) return;

    let subscription: { remove: () => void } | undefined;

    void (async () => {
      try {
        await initNotifications();
        await cancelWorldCupMatchNotifications();

        async function openArticleFromNotification(
          notification: { request: { content: { data?: unknown } } } | undefined,
        ) {
          const articleId = articleIdFromNotificationPayload(notification);
          if (!isValidArticleRouteId(articleId)) return;

          await seedRememberedArticle(articleId);
          routerRef.current.push(articlePath(articleId));
        }

        function openWorldCupFromNotification(
          notification: { request: { content: { data?: unknown } } } | undefined,
        ) {
          if (worldCupScreenFromNotification(notification)) {
            routerRef.current.push('/(tabs)/world-cup');
          }
        }

        function handleNotificationResponse(response: {
          notification: { date: number; request: { identifier: string; content: { data?: unknown } } };
        }) {
          const key = responseKey(response.notification);
          if (handledResponseKeys.has(key)) return;
          handledResponseKeys.add(key);
          openWorldCupFromNotification(response.notification);
          void openArticleFromNotification(response.notification);
        }

        subscription =
          (await subscribeToNotificationResponses((response) => {
            handleNotificationResponse(response);
          })) ?? undefined;

        const last = await getColdStartNotificationResponse();
        if (last?.notification) {
          handleNotificationResponse(last);
          await clearLastNotificationResponse();
        }
      } catch {
        // Native notifications unavailable — skip deep-link setup.
      }
    })();

    return () => subscription?.remove();
  }, [authLoading, navigationReady]);
}
