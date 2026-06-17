import { useEffect } from 'react';
import { InteractionManager } from 'react-native';

export type DeferAfterFocusMode = 'paint' | 'interaction';

/**
 * Runs work after focus without blocking tab chrome.
 * - paint: rAF + setTimeout(0) — first frame paints, then callback runs
 * - interaction: InteractionManager — after transition animations finish
 */
export function useDeferAfterFocus(
  isFocused: boolean,
  callback: () => void | (() => void),
  deps: readonly unknown[],
  mode: DeferAfterFocusMode = 'interaction',
): void {
  useEffect(() => {
    if (!isFocused) return;

    let cancelled = false;
    let cleanup: (() => void) | void;
    let cancelDefer: (() => void) | undefined;

    const run = () => {
      if (cancelled) return;
      cleanup = callback();
    };

    if (mode === 'paint') {
      const frame = requestAnimationFrame(() => {
        const timer = setTimeout(run, 0);
        cancelDefer = () => clearTimeout(timer);
      });
      cancelDefer = () => cancelAnimationFrame(frame);
    } else {
      const task = InteractionManager.runAfterInteractions(run);
      cancelDefer = () => task.cancel();
    }

    return () => {
      cancelled = true;
      cancelDefer?.();
      cleanup?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns deps
  }, [isFocused, mode, ...deps]);
}
