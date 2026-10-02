import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { syncTrendingNotificationBackgroundTask } from '@/services/trendingNotificationTask';

/**
 * Registers the single Expo background worker whenever a user is signed in.
 * That worker maintains the persisted feed snapshot and, when notifications
 * are enabled, reuses the same articles for trending evaluation.
 *
 * The requested 15-minute interval is opportunistic — iOS/Android decide
 * when the task actually runs.
 */
export function useTrendingNotificationBackground() {
  const { user } = useAuth();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    void syncTrendingNotificationBackgroundTask(!!user);
  }, [user]);
}
