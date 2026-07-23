import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useRef } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CURIOSITY_LABELS, CURIOSITY_ORDER } from '@/constants/curiosities';
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
  const scrollRef = useRef<ScrollView>(null);
  const scrollWidthRef = useRef(0);
  const chipLayoutsRef = useRef<Partial<Record<ChipKey, { x: number; width: number }>>>({});

  const centerChip = useCallback((key: ChipKey) => {
    const layout = chipLayoutsRef.current[key];
    const viewportWidth = scrollWidthRef.current;
    if (!layout || viewportWidth <= 0) return;

    const x = layout.x + layout.width / 2 - viewportWidth / 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, []);

  const recordChipLayout = useCallback((key: ChipKey, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    chipLayoutsRef.current[key] = { x, width };
  }, []);

  const handleSelectAll = useCallback(() => {
    centerChip('all');
    if (allSelected) return;
    onSelectAll();
  }, [allSelected, centerChip, onSelectAll]);

  const handleToggleTopic = useCallback(
    (topic: Topic) => {
      console.log('[chipDebug] chip pressed', { topic });
      centerChip(topic);
      onToggleTopic(topic);
    },
    [centerChip, onToggleTopic],
  );

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => {
          scrollWidthRef.current = event.nativeEvent.layout.width;
        }}
        contentContainerStyle={styles.scrollContent}>
        <View onLayout={(event) => recordChipLayout('all', event)}>
          <Pressable
            onPress={handleSelectAll}
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
            <Text
              style={[styles.chipText, { color: allSelected ? colors.accent : colors.text }]}>
              All
            </Text>
          </Pressable>
        </View>

        {CURIOSITY_ORDER.map((topic) => {
          const selected = !allSelected && enabledTopics.includes(topic);
          return (
            <View key={topic} onLayout={(event) => recordChipLayout(topic, event)}>
              <Pressable
                onPress={() => handleToggleTopic(topic)}
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
            </View>
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
