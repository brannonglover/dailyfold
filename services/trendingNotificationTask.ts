import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { FALLBACK_SOURCES } from '@/data/sources';
import { getSessionUser } from '@/services/auth';
import { fetchPersonalizedFeed } from '@/services/feed';
import {
  runBackgroundFeedRefreshWithDeps,
  type BackgroundFeedRefreshResult,
} from '@/services/feedBackgroundRefresh';
import { applyTrendingNotificationFilters } from '@/services/feedFilters';
import {
  reloadFeedSnapshotRecord,
  saveFeedSnapshot,
} from '@/services/feedPersistence';
import {
  getNotificationPermissionGranted,
  notificationsAvailable,
} from '@/services/notificationSetup';
import { fetchSources } from '@/services/sources';
import { getPreferences } from '@/services/storage';
import { processHotTrendingNotifications } from '@/services/trendingNotifications';

export const TRENDING_NOTIFICATION_TASK = 'dailyfold-trending-notifications';

/** Requested interval only — the OS decides when we actually run. */
export const TRENDING_NOTIFICATION_INTERVAL_MINUTES = 15;

let backgroundTaskExpired = false;

function markBackgroundTaskExpired(): void {
  backgroundTaskExpired = true;
}

async function runBackgroundFeedMaintenance(): Promise<BackgroundFeedRefreshResult> {
  return runBackgroundFeedRefreshWithDeps({
    nowMs: () => Date.now(),
    isExpired: () => backgroundTaskExpired,
    loadUser: getSessionUser,
    loadPreferences: getPreferences,
    loadRecord: reloadFeedSnapshotRecord,
    saveRecord: saveFeedSnapshot,
    fetchFeed: (preferences, knownArticles) =>
      fetchPersonalizedFeed({
        preferences,
        knownArticles,
        mode: 'full',
        limit: 100,
        want: 20,
      }),
    fetchSources: async () => {
      try {
        return await fetchSources();
      } catch {
        return FALLBACK_SOURCES;
      }
    },
    evaluateNotifications: async (userId, articles, preferences, sources) => {
      const filtered = applyTrendingNotificationFilters(articles, preferences, sources);
      await processHotTrendingNotifications(userId, filtered, true, preferences);
    },
    notificationsEligible: async (preferences) => {
      if (!preferences.trendingNotificationsEnabled) return false;
      if (!notificationsAvailable()) return false;
      if (!(await getNotificationPermissionGranted())) return false;
      return true;
    },
  });
}

/**
 * Single Expo background worker: refresh the persisted feed snapshot, then
 * evaluate trending notifications against that same article set.
 */
export async function runTrendingNotificationCheck(): Promise<BackgroundFeedRefreshResult> {
  return runBackgroundFeedMaintenance();
}

TaskManager.defineTask(TRENDING_NOTIFICATION_TASK, async () => {
  backgroundTaskExpired = false;
  const expiration = (
    BackgroundTask as { addExpirationListener?: (listener: () => void) => { remove: () => void } }
  ).addExpirationListener?.(markBackgroundTaskExpired);

  try {
    const result = await runBackgroundFeedMaintenance();
    return result.status === 'failed'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  } finally {
    expiration?.remove();
  }
});

export async function syncTrendingNotificationBackgroundTask(enabled: boolean): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;

    const registered = await TaskManager.isTaskRegisteredAsync(TRENDING_NOTIFICATION_TASK);
    if (enabled && !registered) {
      await BackgroundTask.registerTaskAsync(TRENDING_NOTIFICATION_TASK, {
        minimumInterval: TRENDING_NOTIFICATION_INTERVAL_MINUTES,
      });
    } else if (!enabled && registered) {
      await BackgroundTask.unregisterTaskAsync(TRENDING_NOTIFICATION_TASK);
    }
  } catch {
    // Background tasks unavailable (simulator, missing native module, etc.)
  }
}
