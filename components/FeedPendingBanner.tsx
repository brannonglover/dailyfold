import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

interface FeedPendingBannerProps {
  count: number;
  /** How to apply pending stories, e.g. "pull down or tap Latest" */
  refreshHint?: string;
}

export function FeedPendingBanner({ count, refreshHint = 'pull to refresh' }: FeedPendingBannerProps) {
  const { colors } = useTheme();

  if (count <= 0) return null;

  const label =
    count === 1
      ? `1 new story ready — ${refreshHint}`
      : `${count} new stories ready — ${refreshHint}`;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
      accessibilityRole="text"
      accessibilityLabel={label}>
      <Ionicons name="newspaper-outline" size={16} color={colors.accent} />
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
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
});
