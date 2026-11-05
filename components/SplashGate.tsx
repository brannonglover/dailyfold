import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

import { useArticles } from '@/contexts/ArticlesContext';
import { useAuth } from '@/contexts/AuthContext';
import { prefetchFeedImages } from '@/services/feedImagePrefetch';

/** Never keep the native splash up longer than this, whatever the feed is doing. */
export const SPLASH_MAX_HOLD_MS = 2_000;

/**
 * Keeps the native splash on screen until the first feed screen can paint complete:
 * the persisted snapshot is hydrated and its top images are in the cache. The reader
 * then lands on a finished page instead of a skeleton followed by images popping in.
 * Signed-out users, an empty feed, or a slow/cold start release the splash right away
 * or at the hard cap, so this can only ever delay launch by SPLASH_MAX_HOLD_MS.
 */
export function SplashGate() {
  const { user, isLoading: authLoading } = useAuth();
  const { articles, isLoading: feedLoading } = useArticles();
  const hiddenRef = useRef(false);

  const hide = useCallback(() => {
    if (hiddenRef.current) return;
    hiddenRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  useEffect(() => {
    const timer = setTimeout(hide, SPLASH_MAX_HOLD_MS);
    return () => clearTimeout(timer);
  }, [hide]);

  const hasArticles = articles.length > 0;

  useEffect(() => {
    if (hiddenRef.current || authLoading) return;
    if (!user) {
      hide();
      return;
    }

    if (!hasArticles) {
      // Hydration finished with nothing to show (first install / failed read): the feed
      // renders its own loading state, so don't hold the splash for the network.
      if (!feedLoading) hide();
      return;
    }

    let cancelled = false;
    let frame: number | null = null;
    void prefetchFeedImages(articles).then(() => {
      if (cancelled) return;
      // Let the list build its first rows (Latest defers display work past interactions)
      // and paint a frame behind the splash before revealing it.
      InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(hide);
        });
      });
    });

    return () => {
      cancelled = true;
      if (frame != null) cancelAnimationFrame(frame);
    };
    // articles identity changes on every merge; only the empty/non-empty transition and
    // the first batch matter here, and prefetchFeedImages dedupes repeat calls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, hasArticles, feedLoading, hide]);

  return null;
}
