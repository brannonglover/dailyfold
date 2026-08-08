import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

import { API_URL } from '@/constants/api';
import { supabase } from '@/lib/supabase';
import { notificationsAvailable } from '@/services/notificationSetup';
import { UserPreferences } from '@/types';

const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_CACHE_PREFIX = '@dailyfold/pushToken/';

/** Subset of UserPreferences the backend's notify cron actually consumes — see
 * backend/lib/notify/types.ts:PushPreferences. Raw liked/clicked article snapshots
 * are deliberately not sent (they exist client-side only to derive these scores). */
function toPushPreferencesPayload(prefs: UserPreferences) {
  return {
    topicScores: prefs.topicScores,
    keywordScores: prefs.keywordScores,
    sportTagScores: prefs.sportTagScores ?? {},
    enabledTopics: prefs.enabledTopics,
    enabledSourceIds: prefs.enabledSourceIds,
    enabledSportTags: prefs.enabledSportTags,
    blockedTopics: prefs.blockedTopics,
    blockedSportTags: prefs.blockedSportTags,
    blockedKeywords: prefs.blockedKeywords,
    trendingNotificationsEnabled: prefs.trendingNotificationsEnabled,
  };
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getAccessToken(): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function getCachedPushToken(userId: string): Promise<string | null> {
  return AsyncStorage.getItem(`${TOKEN_CACHE_PREFIX}${userId}`);
}

async function setCachedPushToken(userId: string, token: string): Promise<void> {
  await AsyncStorage.setItem(`${TOKEN_CACHE_PREFIX}${userId}`, token);
}

async function clearCachedPushToken(userId: string): Promise<void> {
  await AsyncStorage.removeItem(`${TOKEN_CACHE_PREFIX}${userId}`);
}

/** Acquires an Expo push token. Requires a dev-client/TestFlight/production build —
 * Expo Go cannot receive remote push since Expo SDK 53. Returns null on any failure. */
export async function getExpoPushToken(): Promise<string | null> {
  if (!notificationsAvailable()) return null;

  try {
    const { default: getExpoPushTokenAsync } = await import(
      'expo-notifications/build/getExpoPushTokenAsync'
    );
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;

    const token = await getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    return null;
  }
}

/** Registers (upserts) this device's push token + notification-relevant preferences. */
export async function registerPushToken(
  userId: string,
  token: string,
  prefs: UserPreferences,
): Promise<void> {
  const accessToken = await getAccessToken();
  if (!accessToken) return;

  try {
    const response = await withTimeout((signal) =>
      fetch(`${API_URL}/api/push-subscription`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expoPushToken: token, ...toPushPreferencesPayload(prefs) }),
        signal,
      }),
    );
    if (response.ok) {
      await setCachedPushToken(userId, token);
    }
  } catch {
    // Best-effort — a failed sync is retried on the next persist()/app launch.
  }
}

/** Unregisters a device's push token. Best-effort — never blocks logout/toggle-off. */
export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  const accessToken = await getAccessToken();
  if (accessToken) {
    try {
      await withTimeout((signal) =>
        fetch(`${API_URL}/api/push-subscription?token=${encodeURIComponent(token)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
          signal,
        }),
      );
    } catch {
      // Best-effort — an orphaned token row is harmless (stale-token cleanup removes it).
    }
  }
  await clearCachedPushToken(userId);
}
