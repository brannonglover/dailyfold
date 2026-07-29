import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import {
  FOLD_GRID_GAP,
  FOLD_GRID_IMAGE_ASPECT,
  FOLD_ROW_IMAGE_SIZE,
  STORY_CARD_LEAD_IMAGE_ASPECT,
} from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';

const CHIP_WIDTHS = [44, 108, 118, 72, 96] as const;

function Bone({
  style,
  opacity,
}: {
  style?: object | object[];
  opacity: Animated.Value;
}) {
  const { colors } = useTheme();
  return (
    <Animated.View
      style={[styles.bone, { backgroundColor: colors.surface, opacity }, style]}
    />
  );
}

/** Fold-shaped placeholder shown while Latest (and other feeds) stock on cold open. */
export function ArticleFeedSkeleton({
  showTopicChips = true,
}: {
  showTopicChips?: boolean;
}) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 750,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.root} accessibilityLabel="Loading stories" accessibilityRole="progressbar">
      {showTopicChips ? (
        <View style={styles.chipRow}>
          {CHIP_WIDTHS.map((width, index) => (
            <Bone key={index} opacity={pulse} style={[styles.chip, { width }]} />
          ))}
        </View>
      ) : null}

      <View style={styles.lead}>
        <Bone opacity={pulse} style={[styles.leadImage, { aspectRatio: STORY_CARD_LEAD_IMAGE_ASPECT }]} />
        <View style={styles.leadBody}>
          <Bone opacity={pulse} style={styles.kicker} />
          <Bone opacity={pulse} style={styles.meta} />
          <Bone opacity={pulse} style={styles.titleLine} />
          <Bone opacity={pulse} style={[styles.titleLine, styles.titleLineShort]} />
        </View>
      </View>

      <View style={styles.gridPair}>
        <View style={styles.gridCard}>
          <Bone opacity={pulse} style={[styles.gridImage, { aspectRatio: FOLD_GRID_IMAGE_ASPECT }]} />
          <Bone opacity={pulse} style={styles.gridKicker} />
          <Bone opacity={pulse} style={styles.gridTitle} />
          <Bone opacity={pulse} style={[styles.gridTitle, styles.gridTitleShort]} />
        </View>
        <View style={styles.gridGap} />
        <View style={styles.gridCard}>
          <Bone opacity={pulse} style={[styles.gridImage, { aspectRatio: FOLD_GRID_IMAGE_ASPECT }]} />
          <Bone opacity={pulse} style={styles.gridKicker} />
          <Bone opacity={pulse} style={styles.gridTitle} />
          <Bone opacity={pulse} style={[styles.gridTitle, styles.gridTitleShort]} />
        </View>
      </View>

      {[0, 1].map((row) => (
        <View key={row} style={styles.row}>
          <Bone opacity={pulse} style={styles.rowImage} />
          <View style={styles.rowBody}>
            <Bone opacity={pulse} style={styles.rowKicker} />
            <Bone opacity={pulse} style={styles.rowTitle} />
            <Bone opacity={pulse} style={[styles.rowTitle, styles.rowTitleShort]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bone: {
    borderRadius: 6,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
  },
  chip: {
    height: 34,
    borderRadius: 999,
  },
  lead: {
    paddingBottom: 4,
  },
  leadImage: {
    width: '100%',
    borderRadius: 0,
  },
  leadBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  kicker: {
    width: 72,
    height: 12,
  },
  meta: {
    width: 140,
    height: 12,
  },
  titleLine: {
    width: '100%',
    height: 18,
  },
  titleLineShort: {
    width: '68%',
  },
  gridPair: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  gridCard: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  gridGap: {
    width: FOLD_GRID_GAP,
  },
  gridImage: {
    width: '100%',
    borderRadius: 0,
  },
  gridKicker: {
    width: 56,
    height: 10,
  },
  gridTitle: {
    width: '100%',
    height: 14,
  },
  gridTitleShort: {
    width: '55%',
  },
  row: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowImage: {
    width: FOLD_ROW_IMAGE_SIZE,
    height: FOLD_ROW_IMAGE_SIZE,
    borderRadius: 0,
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 8,
  },
  rowKicker: {
    width: 64,
    height: 10,
  },
  rowTitle: {
    width: '100%',
    height: 15,
  },
  rowTitleShort: {
    width: '60%',
  },
});
