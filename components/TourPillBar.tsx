import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { TourPill } from '@/services/tourDeFranceFeed';

const PILLS: { id: TourPill; label: string }[] = [
  { id: 'stage', label: 'Stage' },
  { id: 'gc', label: 'GC' },
  { id: 'jerseys', label: 'Jerseys' },
  { id: 'riders', label: 'Riders' },
];

interface TourPillBarProps {
  activePill: TourPill;
  stageLabel: string;
  onSelectPill: (pill: TourPill) => void;
}

export function TourPillBar({ activePill, stageLabel, onSelectPill }: TourPillBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        {PILLS.map((pill) => {
          const selected = activePill === pill.id;
          const label = pill.id === 'stage' ? stageLabel : pill.label;
          return (
            <Pressable
              key={pill.id}
              onPress={() => onSelectPill(pill.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              style={({ pressed }) => [
                styles.pill,
                {
                  backgroundColor: selected ? 'transparent' : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <Text
                style={[styles.pillText, { color: selected ? colors.accent : colors.textSecondary }]}
                numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 24,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  pillText: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
  },
});
