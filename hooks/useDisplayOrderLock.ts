import { useCallback, useLayoutEffect, useRef } from 'react';

import {
  readTabDisplayCache,
  type TabDisplayCacheKey,
  writeTabDisplayCache,
} from '@/utils/tabDisplayCache';
import { isFilterExpansion } from '@/utils/mergeDisplayFeed';

/**
 * Keeps feed tab display order stable until the user explicitly refreshes
 * (pull-to-refresh or apply-pending banner). Filter narrowing still rebuilds.
 */
export function useDisplayOrderLock(isRefreshing: boolean, tabKey?: TabDisplayCacheKey) {
  const lockedRef = useRef(tabKey ? (readTabDisplayCache(tabKey)?.orderLocked ?? false) : false);
  const userRebuildRef = useRef(false);

  const persistLock = useCallback(
    (locked: boolean) => {
      if (!tabKey) return;
      const cached = readTabDisplayCache(tabKey);
      if (!cached) return;
      writeTabDisplayCache(tabKey, { ...cached, orderLocked: locked });
    },
    [tabKey],
  );

  useLayoutEffect(() => {
    if (isRefreshing) userRebuildRef.current = true;
  }, [isRefreshing]);

  const markInitialDisplay = useCallback(() => {
    lockedRef.current = true;
    persistLock(true);
  }, [persistLock]);

  /** Call before apply-pending so display sync runs even when refresh toggles in one tick. */
  const markUserRebuild = useCallback(() => {
    userRebuildRef.current = true;
  }, []);

  const shouldAllowFullRebuild = useCallback(
    (
      filtersChanged: boolean,
      prevFilterKey: string,
      filterKey: string,
      options?: { displayEmpty?: boolean; generationChanged?: boolean },
    ) => {
      if (userRebuildRef.current) {
        userRebuildRef.current = false;
        lockedRef.current = true;
        persistLock(true);
        return true;
      }
      // Empty display must always be allowed to seed — order lock preserves an
      // already-painted list, not a blank heart after resume/cache loss.
      if (options?.displayEmpty) return true;
      // Generation bumps (refresh / apply-pending) replace the feed; re-rank.
      if (options?.generationChanged) return true;
      if (filtersChanged && !isFilterExpansion(prevFilterKey, filterKey)) return true;
      return !lockedRef.current;
    },
    [persistLock],
  );

  const shouldAllowSilentMerge = useCallback(() => {
    if (userRebuildRef.current) return true;
    return !lockedRef.current;
  }, []);

  return { markInitialDisplay, markUserRebuild, shouldAllowFullRebuild, shouldAllowSilentMerge };
}
