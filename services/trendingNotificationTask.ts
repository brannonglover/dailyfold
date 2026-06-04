import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { fetchArticles } from '@/services/articles';
import { getSessionUser } from '@/services/auth';
import { applyTrendingNotificationFilters } from '@/services/feedFilters';
import {
  getNotificationPermissionGranted,
  notificationsAvailable,
} from '@/services/notificationSetup';
import { fetchSources } from '@/services/sources';
import { getPreferences } from '@/services/storage';
import { processHotTrendingNotifications } from '@/services/trendingNotifications';

export const TRENDING_NOTIFICATION_TASK = 'beacon-trending-notifications';

/** Minimum background interval (minutes). Android WorkManager floor is 15. */
export const TRENDING_NOTIFICATION_INTERVAL_MINUTES = 15;

export async function runTrendingNotificationCheck(): Promise<void> {
  if (Platform.OS === 'web' || !notificationsAvailable()) return;

  const user = await getSessionUser();
  if (!user) return;

  const preferences = await getPreferences(user.id);
  if (!preferences.trendingNotificationsEnabled) return;
  if (!(await getNotificationPermissionGranted())) return;

  const [sources, { articles }] = await Promise.all([fetchSources(), fetchArticles()]);
  const filtered = applyTrendingNotificationFilters(articles, preferences, sources);
  await processHotTrendingNotifications(user.id, filtered, true, preferences);
}

TaskManager.defineTask(TRENDING_NOTIFICATION_TASK, async () => {
  try {
    await runTrendingNotificationCheck();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
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
