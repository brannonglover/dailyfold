import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { getNotificationPermissionGranted } from '@/services/notificationSetup';
import { getExpoPushToken, registerPushToken } from '@/services/pushNotifications';
import { UserPreferences } from '@/types';

/**
 * Registers this device's push token on launch when notifications are already
 * enabled and OS permission already granted — covers reinstalls, Expo push token
 * rotation, and app updates without requiring the user to re-toggle the setting.
 * Safe to run every launch: the backend route upserts by token.
 */
export function usePushNotificationRegistration() {
  const { user } = useAuth();
  const { preferences, trendingNotificationsEnabled } = usePreferences();
  const preferencesRef = useRef<UserPreferences | null>(null);
  const registeredForUserRef = useRef<string | null>(null);
  preferencesRef.current = preferences;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!user || !trendingNotificationsEnabled) return;
    if (registeredForUserRef.current === user.id) return;

    let cancelled = false;
    void (async () => {
      const granted = await getNotificationPermissionGranted();
      if (!granted || cancelled) return;

      const token = await getExpoPushToken();
      const prefs = preferencesRef.current;
      if (!token || !prefs || cancelled) return;

      registeredForUserRef.current = user.id;
      void registerPushToken(user.id, token, prefs);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, trendingNotificationsEnabled]);
}
