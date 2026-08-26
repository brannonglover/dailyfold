import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export type ReadingSegment = 'continue' | 'readLater';

interface ReadingSegmentBarProps {
  selected: ReadingSegment;
  continueCount: number;
  readLaterCount: number;
  onSelect: (segment: ReadingSegment) => void;
}

export function ReadingSegmentBar({
  selected,
  continueCount,
  readLaterCount,
  onSelect,
}: ReadingSegmentBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.bar, { borderBottomColor: colors.border }]}>
      <Pressable
        onPress={() => onSelect('continue')}
        style={({ pressed }) => [
          styles.segment,
          selected === 'continue' && { borderBottomColor: colors.accent },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: selected === 'continue' }}>
        <Text
          style={[
            styles.segmentLabel,
            { color: selected === 'continue' ? colors.text : colors.textSecondary },
          ]}>
          Continue
        </Text>
        {continueCount > 0 ? (
          <Text style={[styles.segmentCount, { color: colors.textSecondary }]}>
            {continueCount}
          </Text>
        ) : null}
      </Pressable>

      <Pressable
        onPress={() => onSelect('readLater')}
        style={({ pressed }) => [
          styles.segment,
          selected === 'readLater' && { borderBottomColor: colors.accent },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="tab"
        accessibilityState={{ selected: selected === 'readLater' }}>
        <Text
          style={[
            styles.segmentLabel,
            { color: selected === 'readLater' ? colors.text : colors.textSecondary },
          ]}>
          Read Later
        </Text>
        {readLaterCount > 0 ? (
          <Text style={[styles.segmentCount, { color: colors.textSecondary }]}>
            {readLaterCount}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  segmentLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 14,
  },
  segmentCount: {
    fontFamily: 'Inter',
    fontSize: 12,
  },
});
