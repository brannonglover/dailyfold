import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { hasOpenablePublisherUrl, openPublisherArticle } from '@/utils/openPublisherBrowser';

export function useOpenPublisherArticle(
  url: string | undefined,
  options?: { title?: string; source?: string },
) {
  const [isOpening, setIsOpening] = useState(false);
  const canOpen = hasOpenablePublisherUrl(url);
  const title = options?.title;
  const source = options?.source;

  const open = useCallback(() => {
    if (!url || !canOpen || isOpening) return;

    setIsOpening(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    void openPublisherArticle(url, { title, source }).finally(() => {
      setIsOpening(false);
    });
  }, [url, canOpen, isOpening, title, source]);

  return { open, isOpening, canOpen };
}
