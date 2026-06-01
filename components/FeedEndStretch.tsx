import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks/useTheme';

interface FeedEndStretchProps {
  pullDistance: SharedValue<number>;
}

export function FeedEndStretch({ pullDistance }: FeedEndStretchProps) {
  const { colors } = useTheme();

  const containerStyle = useAnimatedStyle(() => {
    const pull = pullDistance.value;
    const stretch = Math.min(pull, 96);

    return {
      opacity: interpolate(pull, [0, 12, 48], [0, 0.55, 1], Extrapolation.CLAMP),
      transform: [{ translateY: -stretch * 0.45 }],
    };
  });

  const iconStyle = useAnimatedStyle(() => {
    const pull = pullDistance.value;

    return {
      transform: [
        {
          scale: interpolate(pull, [0, 24, 72], [0.85, 1, 1.08], Extrapolation.CLAMP),
        },
      ],
    };
  });

  return (
    <Animated.View style={[styles.container, containerStyle]} pointerEvents="none">
      <Animated.View style={iconStyle}>
        <Ionicons name="checkmark-circle-outline" size={22} color={colors.textSecondary} />
      </Animated.View>
      <Animated.Text style={[styles.label, { color: colors.textSecondary }]}>
        You're all caught up
      </Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    zIndex: 8,
    alignItems: 'center',
    gap: 6,
  },
  label: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
