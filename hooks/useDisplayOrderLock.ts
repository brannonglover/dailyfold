import { useCallback, useEffect, useRef, useState } from 'react';

import { DISPLAY_ORDER_LOCK_MS, isFilterExpansion } from '@/utils/mergeDisplayFeed';

/**
 * Short post-paint window where feed tabs avoid reordering from silent refresh,
 * story-rep swaps, or preference auto-normalization.
 */
export function useDisplayOrderLock(isRefreshing: boolean) {
  const lockUntilRef = useRef(0);
  const userRebuildRef = useRef(false);
  const [lockEpoch, setLockEpoch] = useState(0);

  useEffect(() => {
    if (isRefreshing) userRebuildRef.current = true;
  }, [isRefreshing]);

  useEffect(() => {
    if (lockUntilRef.current === 0) return;
    const remaining = lockUntilRef.current - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setLockEpoch((value) => value + 1), remaining);
    return () => clearTimeout(timer);
  }, [lockEpoch]);

  const markInitialDisplay = useCallback(() => {
    if (lockUntilRef.current !== 0) return;
    lockUntilRef.current = Date.now() + DISPLAY_ORDER_LOCK_MS;
    setLockEpoch((value) => value + 1);
  }, []);

  const shouldAllowFullRebuild = useCallback(
    (filtersChanged: boolean, prevFilterKey: string, filterKey: string) => {
      if (userRebuildRef.current) {
        userRebuildRef.current = false;
        return true;
      }
      if (filtersChanged && !isFilterExpansion(prevFilterKey, filterKey)) return true;
      return Date.now() >= lockUntilRef.current;
    },
    [],
  );

  const shouldAllowSilentMerge = useCallback(() => {
    if (userRebuildRef.current) return true;
    return Date.now() >= lockUntilRef.current;
  }, []);

  return { markInitialDisplay, shouldAllowFullRebuild, shouldAllowSilentMerge, lockEpoch };
}
