import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface FeedPendingBannerProps {
  count: number;
  /** How to apply pending stories, e.g. "pull down or tap Latest" */
  refreshHint?: string;
  onPress?: () => void;
}

export function FeedPendingBanner({
  count,
  refreshHint = 'pull to refresh',
  onPress,
}: FeedPendingBannerProps) {
  const { colors } = useTheme();

  if (count <= 0) return null;

  const label =
    count === 1
      ? `1 new story ready — ${refreshHint}`
      : `${count} new stories ready — ${refreshHint}`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && onPress ? styles.bannerPressed : null,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Shows new stories in your feed">
      <Ionicons name="newspaper-outline" size={16} color={colors.accent} />
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontFamily: 'InterMedium',
    fontSize: 13,
    lineHeight: 18,
  },
  bannerPressed: {
    opacity: 0.85,
  },
});
