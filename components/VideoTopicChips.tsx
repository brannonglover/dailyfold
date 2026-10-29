import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { Topic } from '@/types';

interface VideoTopicChipsProps {
  topics: Topic[];
  selected: Topic | null;
  onSelect: (topic: Topic | null) => void;
}

/** Translucent chip row that floats over the video feed. */
export function VideoTopicChips({ topics, selected, onSelect }: VideoTopicChipsProps) {
  const chips: { key: string; label: string; topic: Topic | null }[] = [
    { key: 'all', label: 'All', topic: null },
    ...topics
      .filter((topic) => CURIOSITY_LABELS[topic])
      .map((topic) => ({ key: topic, label: CURIOSITY_LABELS[topic], topic })),
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}>
      {chips.map((chip) => {
        const isSelected = chip.topic === selected;
        return (
          <Pressable
            key={chip.key}
            onPress={() => onSelect(chip.topic)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={chip.topic ? `Show ${chip.label} videos` : 'Show all videos'}
            style={({ pressed }) => [
              styles.chip,
              isSelected ? styles.chipSelected : styles.chipDefault,
              pressed && styles.pressed,
            ]}>
            <Text
              style={[styles.chipText, isSelected ? styles.chipTextSelected : styles.chipTextDefault]}
              numberOfLines={1}>
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDefault: {
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  chipSelected: {
    backgroundColor: '#FFFFFF',
  },
  chipText: {
    fontFamily: 'InterMedium',
    fontSize: 13,
  },
  chipTextDefault: {
    color: '#FFFFFF',
  },
  chipTextSelected: {
    color: '#121212',
  },
  pressed: {
    opacity: 0.7,
  },
});
