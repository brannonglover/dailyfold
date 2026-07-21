import 'react-native-gesture-handler';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { memo, useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ArticlesProvider } from '@/contexts/ArticlesContext';
import { PreferencesProvider } from '@/contexts/PreferencesContext';
import { AppThemeProvider } from '@/contexts/ThemeContext';
import { useAppFonts } from '@/constants/Fonts';
import { useNotificationNavigation } from '@/hooks/useNotificationNavigation';
import { useTrendingNotificationBackground } from '@/hooks/useTrendingNotificationBackground';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const DarkNavTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#121212',
    card: '#121212',
    text: '#F5F5F5',
    border: '#2E2E2E',
    primary: '#FF7A6B',
  },
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user && !inAuthGroup) {
      router.replace('/welcome');
    } else if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, isLoading, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const { loaded, error } = useAppFonts();

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppThemeProvider>
        <AuthProvider>
          <PreferencesProvider>
            <ArticlesProvider>
              <RootLayoutNav />
            </ArticlesProvider>
          </PreferencesProvider>
        </AuthProvider>
      </AppThemeProvider>
    </GestureHandlerRootView>
  );
}

const RootLayoutNav = memo(function RootLayoutNav() {
  useNotificationNavigation();
  useTrendingNotificationBackground();

  return (
    <ThemeProvider value={DarkNavTheme}>
      <AuthGate>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="sources"
            options={{
              headerShown: true,
              presentation: 'card',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="article/[id]"
            options={{
              headerShown: true,
              presentation: 'card',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              animationMatchesGesture: true,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="browser"
            options={{
              headerShown: false,
              presentation: 'card',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              animationMatchesGesture: true,
              animation: 'slide_from_right',
            }}
          />
          <Stack.Screen
            name="for-you/[type]/[value]"
            options={{
              headerShown: true,
              presentation: 'card',
              gestureEnabled: true,
              fullScreenGestureEnabled: false,
              animation: 'slide_from_right',
            }}
          />
        </Stack>
      </AuthGate>
    </ThemeProvider>
  );
});
