import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { supabase } from '@/lib/supabase';

/**
 * Target of the `dailyfold://auth-callback?code=…` link opened from the email-confirmation page
 * (backend `/auth/confirmed`). Exchanges the one-time PKCE code for a session; AuthContext then
 * sees SIGNED_IN and AuthGate moves the user from the (auth) group into the tabs. It lives inside
 * (auth) so AuthGate does not bounce a still-signed-out user to /welcome mid-exchange.
 */
export default function AuthCallbackScreen() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const router = useRouter();
  const { colors, styles: themeStyles } = useTheme();
  const exchangedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  const codeValue = Array.isArray(code) ? code[0] : code;

  useEffect(() => {
    if (!codeValue || exchangedRef.current) return;
    exchangedRef.current = true;

    supabase.auth.exchangeCodeForSession(codeValue).then(({ error }) => {
      if (error) setFailed(true);
    });
  }, [codeValue]);

  // No code in the link at all: nothing to exchange, send them to sign in.
  useEffect(() => {
    if (codeValue) return;
    const timer = setTimeout(() => setFailed(true), 400);
    return () => clearTimeout(timer);
  }, [codeValue]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {failed ? (
        <>
          <Text style={themeStyles.title}>Please sign in</Text>
          <Text style={[themeStyles.body, styles.message, { color: colors.textSecondary }]}>
            We couldn't sign you in automatically. If you confirmed your email, sign in with your
            email and password.
          </Text>
          <Pressable style={themeStyles.button} onPress={() => router.replace('/login')}>
            <Text style={themeStyles.buttonText}>Sign in</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.accent} />
          <Text style={[themeStyles.body, styles.message, { color: colors.textSecondary }]}>
            Signing you in…
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  message: {
    textAlign: 'center',
    marginBottom: 8,
  },
});
