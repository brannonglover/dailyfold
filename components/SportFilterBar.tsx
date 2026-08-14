import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { SPORT_TAG_LABELS, SPORT_CHIP_TAGS } from '@/catalog/sports';
import { useTheme } from '@/hooks/useTheme';
import { SportTag } from '@/types';

interface SportFilterBarProps {
  enabledSportTags: SportTag[];
  onSelectAll: () => void;
  onToggleSportTag: (tag: SportTag) => void;
}

export function SportFilterBar({
  enabledSportTags,
  onSelectAll,
  onToggleSportTag,
}: SportFilterBarProps) {
  const { colors } = useTheme();
  const allSelected = enabledSportTags.length === 0;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <Pressable
          onPress={onSelectAll}
          accessibilityRole="button"
          accessibilityState={{ selected: allSelected }}
          accessibilityLabel="Show all sports"
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: allSelected ? colors.accentMuted : colors.surface,
              borderColor: allSelected ? colors.accent : colors.border,
            },
            pressed && { opacity: 0.7 },
          ]}>
          <Text
            style={[styles.chipText, { color: allSelected ? colors.accent : colors.textSecondary }]}>
            All sports
          </Text>
        </Pressable>

        {SPORT_CHIP_TAGS.map((tag) => {
          const selected = !allSelected && enabledSportTags.includes(tag);
          return (
            <Pressable
              key={tag}
              onPress={() => onToggleSportTag(tag)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Filter by ${SPORT_TAG_LABELS[tag]}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.accentMuted : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <Text
                style={[styles.chipText, { color: selected ? colors.accent : colors.textSecondary }]}
                numberOfLines={1}>
                {SPORT_TAG_LABELS[tag]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <LinearGradient
        pointerEvents="none"
        colors={[`${colors.background}00`, colors.background]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.scrollFade}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    paddingBottom: 12,
    position: 'relative',
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'InterMedium',
    fontSize: 12,
  },
  scrollFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
  },
});
