import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

export const TRENDING_CHANNEL_ID = 'trending';

export type TrendingNotificationPermissionResult = 'granted' | 'denied' | 'unavailable';

type NotificationContent = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
};

type NotificationResponse = {
  notification: { date: number; request: { identifier: string; content: { data?: unknown } } };
};

let available: boolean | undefined;
let initialized = false;

/** True when local notification native modules are linked (dev build / Expo Go). */
export function notificationsAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  if (available !== undefined) return available;

  available =
    requireOptionalNativeModule('ExpoNotificationScheduler') != null &&
    requireOptionalNativeModule('ExpoNotificationPermissionsModule') != null;

  return available;
}

function markUnavailable(): void {
  available = false;
}

export async function initNotifications(): Promise<void> {
  if (!notificationsAvailable() || initialized) return;

  try {
    const { setNotificationHandler } = await import(
      'expo-notifications/build/NotificationsHandler'
    );
    if (typeof setNotificationHandler !== 'function') {
      markUnavailable();
      return;
    }

    initialized = true;
    setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    markUnavailable();
  }
}

export async function ensureTrendingNotificationChannel(): Promise<void> {
  if (!notificationsAvailable() || Platform.OS !== 'android') return;

  try {
    const [{ default: setNotificationChannelAsync }, { AndroidImportance }] = await Promise.all([
      import('expo-notifications/build/setNotificationChannelAsync'),
      import('expo-notifications/build/NotificationChannelManager.types'),
    ]);

    await setNotificationChannelAsync(TRENDING_CHANNEL_ID, {
      name: 'Trending stories',
      importance: AndroidImportance.DEFAULT,
      vibrationPattern: [0, 200, 120, 200],
    });
  } catch {
    markUnavailable();
  }
}

export async function getNotificationPermissionGranted(): Promise<boolean> {
  if (!notificationsAvailable()) return false;

  try {
    const { getPermissionsAsync } = await import(
      'expo-notifications/build/NotificationPermissions'
    );
    const { status } = await getPermissionsAsync();
    return status === 'granted';
  } catch {
    markUnavailable();
    return false;
  }
}

/** Request OS permission; creates Android channel first when needed. */
export async function requestTrendingNotificationPermission(): Promise<TrendingNotificationPermissionResult> {
  if (!notificationsAvailable()) return 'unavailable';

  try {
    await ensureTrendingNotificationChannel();

    const { getPermissionsAsync, requestPermissionsAsync } = await import(
      'expo-notifications/build/NotificationPermissions'
    );

    const existing = await getPermissionsAsync();
    if (existing.status === 'granted') return 'granted';

    const { status } = await requestPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch {
    markUnavailable();
    return 'unavailable';
  }
}

export async function scheduleLocalNotification(content: NotificationContent): Promise<void> {
  if (!notificationsAvailable()) return;

  try {
    const { default: scheduleNotificationAsync } = await import(
      'expo-notifications/build/scheduleNotificationAsync'
    );
    await scheduleNotificationAsync({ content, trigger: null });
  } catch {
    markUnavailable();
  }
}

export async function getLastNotificationResponse(): Promise<NotificationResponse | null> {
  if (!notificationsAvailable()) return null;

  try {
    const { getLastNotificationResponse: getLast } = await import(
      'expo-notifications/build/NotificationsEmitter'
    );
    return getLast();
  } catch {
    markUnavailable();
    return null;
  }
}

export async function clearLastNotificationResponse(): Promise<void> {
  if (!notificationsAvailable()) return;

  try {
    const { clearLastNotificationResponse: clearLast } = await import(
      'expo-notifications/build/NotificationsEmitter'
    );
    clearLast();
  } catch {
    markUnavailable();
  }
}

export async function subscribeToNotificationResponses(
  listener: (response: NotificationResponse) => void,
): Promise<{ remove: () => void } | null> {
  if (!notificationsAvailable()) return null;

  try {
    const { addNotificationResponseReceivedListener } = await import(
      'expo-notifications/build/NotificationsEmitter'
    );
    return addNotificationResponseReceivedListener(listener);
  } catch {
    markUnavailable();
    return null;
  }
}
