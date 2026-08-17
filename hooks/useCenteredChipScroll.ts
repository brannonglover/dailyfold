import { useCallback, useEffect, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
} from 'react-native';

import { chipCenterScrollOffset } from '@/utils/chipCenterScroll';

type Measurable = Pick<View, 'measureInWindow'>;

export function useCenteredChipScroll<K extends string>(selectedKey: K) {
  const scrollRef = useRef<ScrollView>(null);
  const chipRefs = useRef<Partial<Record<K, View | null>>>({});
  const contentOffsetRef = useRef(0);
  const pendingKeyRef = useRef<K | null>(selectedKey);
  const pendingAnimatedRef = useRef(false);
  const hasMountedRef = useRef(false);

  const setChipRef = useCallback((key: K, node: View | null) => {
    chipRefs.current[key] = node;
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    contentOffsetRef.current = event.nativeEvent.contentOffset.x;
  }, []);

  const centerChip = useCallback((key: K, animated: boolean) => {
    const chip = chipRefs.current[key];
    const scroll = scrollRef.current as (ScrollView & Measurable) | null;
    if (!chip || !scroll) {
      pendingKeyRef.current = key;
      pendingAnimatedRef.current = animated;
      return;
    }

    chip.measureInWindow((chipX, _chipY, chipWidth) => {
      if (chipWidth <= 0) {
        pendingKeyRef.current = key;
        pendingAnimatedRef.current = animated;
        return;
      }
      scroll.measureInWindow((scrollX, _scrollY, viewportWidth) => {
        if (viewportWidth <= 0) {
          pendingKeyRef.current = key;
          pendingAnimatedRef.current = animated;
          return;
        }
        pendingKeyRef.current = null;
        const nextX = chipCenterScrollOffset(
          contentOffsetRef.current,
          chipX,
          chipWidth,
          scrollX,
          viewportWidth,
        );
        contentOffsetRef.current = nextX;
        scroll.scrollTo({ x: nextX, animated });
      });
    });
  }, []);

  const onChipLayout = useCallback(
    (key: K) => {
      if (pendingKeyRef.current === key) {
        centerChip(key, pendingAnimatedRef.current);
      }
    },
    [centerChip],
  );

  useEffect(() => {
    const animated = hasMountedRef.current;
    hasMountedRef.current = true;
    const frame = requestAnimationFrame(() => {
      centerChip(selectedKey, animated);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedKey, centerChip]);

  return {
    scrollRef,
    setChipRef,
    onChipLayout,
    onScroll,
  };
}
