import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/useTheme';

export default function WelcomeScreen() {
  const { colors, styles: themeStyles } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 32,
        },
      ]}>
      <View style={styles.hero}>
        <Text style={[styles.brand, { color: colors.text }]}>
          <Text style={{ color: '#FF7A6B' }}>d</Text>
          ailyfold
        </Text>
        <Text style={[themeStyles.headline, styles.tagline, { color: colors.text }]}>
          Stories worth your time
        </Text>
        <Text style={[themeStyles.body, styles.description, { color: colors.textSecondary }]}>
          Scroll through curated articles from magazines and news sources. Like what resonates,
          and we'll learn your taste to find more you'll love.
        </Text>
      </View>

      <View style={styles.actions}>
        <Link href="/register" asChild>
          <Pressable style={themeStyles.button}>
            <Text style={themeStyles.buttonText}>Get started</Text>
          </Pressable>
        </Link>
        <Link href="/login" asChild>
          <Pressable style={themeStyles.buttonSecondary}>
            <Text style={themeStyles.buttonSecondaryText}>I have an account</Text>
          </Pressable>
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  brand: {
    fontFamily: 'LoraBold',
    fontSize: 42,
    letterSpacing: 1,
    marginBottom: 16,
  },
  tagline: {
    marginBottom: 16,
  },
  description: {
    lineHeight: 26,
    maxWidth: 340,
  },
  actions: {
    gap: 12,
  },
});
