import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CURIOSITY_LABELS, CURIOSITY_ORDER } from '@/constants/curiosities';
import { useCenteredChipScroll } from '@/hooks/useCenteredChipScroll';
import { useTheme } from '@/hooks/useTheme';
import { Topic } from '@/types';

interface TopicFilterBarProps {
  enabledTopics: Topic[];
  onSelectAll: () => void;
  onToggleTopic: (topic: Topic) => void;
}

type ChipKey = 'all' | Topic;

export function TopicFilterBar({ enabledTopics, onSelectAll, onToggleTopic }: TopicFilterBarProps) {
  const { colors } = useTheme();
  const allSelected = enabledTopics.length === 0;
  const selectedKey: ChipKey = allSelected ? 'all' : (enabledTopics[0] ?? 'all');
  const { scrollRef, setChipRef, onChipLayout, onScroll } = useCenteredChipScroll(selectedKey);

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={styles.scrollContent}>
        <Pressable
          ref={(node) => setChipRef('all', node)}
          collapsable={false}
          onLayout={() => onChipLayout('all')}
          onPress={onSelectAll}
          accessibilityRole="button"
          accessibilityState={{ selected: allSelected }}
          accessibilityLabel="Show all topics"
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: allSelected ? colors.accentMuted : colors.surface,
              borderColor: allSelected ? colors.accent : colors.border,
            },
            pressed && { opacity: 0.7 },
          ]}>
          <Text style={[styles.chipText, { color: allSelected ? colors.accent : colors.text }]}>
            All
          </Text>
        </Pressable>

        {CURIOSITY_ORDER.map((topic) => {
          const selected = !allSelected && enabledTopics.includes(topic);
          return (
            <Pressable
              key={topic}
              ref={(node) => setChipRef(topic, node)}
              collapsable={false}
              onLayout={() => onChipLayout(topic)}
              onPress={() => onToggleTopic(topic)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Filter by ${CURIOSITY_LABELS[topic]}`}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.accentMuted : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <Text
                style={[styles.chipText, { color: selected ? colors.accent : colors.text }]}
                numberOfLines={1}>
                {CURIOSITY_LABELS[topic]}
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
    paddingTop: 12,
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
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: 'InterMedium',
    fontSize: 13,
  },
  scrollFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 28,
  },
});
