import { useEffect } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { syncTrendingNotificationBackgroundTask } from '@/services/trendingNotificationTask';

/**
 * Registers the periodic `expo-background-task` check as a best-effort fallback
 * alongside server-side push (backend/app/api/cron/notify). The AppState-triggered
 * instant check that used to run here on backgrounding was removed — iOS suspends
 * the app within seconds of backgrounding, not enough time for the auth check + 2
 * network fetches + notification scheduling it required, so it never reliably fired.
 */
export function useTrendingNotificationBackground() {
  const { user } = useAuth();
  const { trendingNotificationsEnabled } = usePreferences();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    if (!user) {
      void syncTrendingNotificationBackgroundTask(false);
      return;
    }

    void syncTrendingNotificationBackgroundTask(trendingNotificationsEnabled);
  }, [user, trendingNotificationsEnabled]);
}
