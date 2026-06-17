import * as Haptics from 'expo-haptics';
import { useCallback, useState } from 'react';
import { Platform } from 'react-native';

import { hasOpenablePublisherUrl, openPublisherArticle } from '@/utils/openPublisherBrowser';

export function useOpenPublisherArticle(url: string | undefined) {
  const [isOpening, setIsOpening] = useState(false);
  const canOpen = hasOpenablePublisherUrl(url);

  const open = useCallback(() => {
    if (!url || !canOpen || isOpening) return;

    setIsOpening(true);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    void openPublisherArticle(url).finally(() => {
      setIsOpening(false);
    });
  }, [url, canOpen, isOpening]);

  return { open, isOpening, canOpen };
}
