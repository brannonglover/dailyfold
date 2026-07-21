import { useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { ArticleImage } from '@/components/ArticleImage';
import { FoldTicks } from '@/components/FoldTicks';
import { useTheme } from '@/hooks/useTheme';

interface FoldedImageProps {
  uri: string;
  recyclingKey?: string;
  source?: string;
  sourceLogo?: string;
  style?: StyleProp<ViewStyle>;
}

const CORNER_RADIUS = 16;

/** Tick-strip height at full size (lead card); scales with image height. */
const BASE_TICK_HEIGHT = 14;
/** Height of a full-size (lead card) image — the scale reference point. */
const REFERENCE_HEIGHT = 200;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1;

/**
 * ArticleImage with parallelogram fold-ticks overlaying the bottom edge —
 * echoes the fold-lines in the dailyfold wordmark.
 */
export function FoldedImage({ uri, recyclingKey, source, sourceLogo, style }: FoldedImageProps) {
  const { colors } = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });

  function onLayout(e: LayoutChangeEvent) {
    setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });
  }

  const scale =
    size.height > 0 ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, size.height / REFERENCE_HEIGHT)) : 0;

  return (
    <View style={[styles.wrap, style]} onLayout={onLayout}>
      <ArticleImage
        uri={uri}
        recyclingKey={recyclingKey}
        source={source}
        sourceLogo={sourceLogo}
        style={styles.image}
      />
      {size.width > 0 && scale > 0 ? (
        <View style={styles.ticksWrap} pointerEvents="none">
          <FoldTicks
            width={size.width}
            height={BASE_TICK_HEIGHT * scale}
            color={colors.accent}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: CORNER_RADIUS,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  ticksWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
});
