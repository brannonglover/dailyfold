import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TourStage } from '@/data/tourDeFrance2026';
import { useTheme } from '@/hooks/useTheme';
import { stageStatus } from '@/services/tourDeFranceFeed';

interface TourStageTimelineProps {
  stages: TourStage[];
  currentStageNumber: number;
  selectedStageNumber: number;
  onSelectStage: (stageNumber: number) => void;
}

export function TourStageTimeline({
  stages,
  currentStageNumber,
  selectedStageNumber,
  onSelectStage,
}: TourStageTimelineProps) {
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const didCenterRef = useRef(false);

  useEffect(() => {
    if (didCenterRef.current) return;
    const index = stages.findIndex((stage) => stage.number === selectedStageNumber);
    if (index < 0) return;
    didCenterRef.current = true;
    const x = Math.max(0, index * 84 - 40);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x, animated: false });
    });
  }, [stages, selectedStageNumber]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}>
      {stages.map((stage) => {
        const status = stageStatus(stage.number, currentStageNumber);
        const selected = stage.number === selectedStageNumber;
        const muted = status !== 'today' && !selected;
        return (
          <Pressable
            key={stage.number}
            onPress={() => onSelectStage(stage.number)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Stage ${stage.number}, ${stage.label}`}
            style={({ pressed }) => [
              styles.item,
              muted && styles.itemMuted,
              pressed && { opacity: 0.7 },
            ]}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor:
                    selected || status === 'today' ? colors.accent : colors.surface,
                },
              ]}>
              <Text
                style={[
                  styles.dotText,
                  {
                    color:
                      selected || status === 'today' ? '#FFFFFF' : colors.textSecondary,
                  },
                ]}>
                {stage.number}
              </Text>
            </View>
            <Text
              style={[
                styles.label,
                {
                  color: selected || status === 'today' ? colors.text : colors.textSecondary,
                  fontFamily: selected || status === 'today' ? 'InterSemiBold' : 'Inter',
                },
              ]}
              numberOfLines={1}>
              {stage.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: 10,
    paddingVertical: 4,
  },
  item: {
    width: 74,
    alignItems: 'center',
  },
  itemMuted: {
    opacity: 0.55,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  dotText: {
    fontFamily: 'InterBold',
    fontSize: 9,
  },
  label: {
    fontSize: 10,
    textAlign: 'center',
  },
});
