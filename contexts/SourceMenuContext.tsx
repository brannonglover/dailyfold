import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { NotForMeModal } from '@/components/NotForMeModal';
import { usePreferences } from '@/contexts/PreferencesContext';
import { scheduleWarmNotForMeOptions } from '@/services/notForMeOptionsSchedule';
import { Article } from '@/types';
import { acquireFeedInteractionLock } from '@/utils/feedInteractionLock';
import {
  isSourceMenuDismissCooldownActive,
  markSourceMenuDismissed,
} from '@/utils/sourceMenuDismiss';

type SourceMenuContextValue = {
  openSourceMenu: (article: Article) => void;
  isOpen: boolean;
  openArticleId: string | null;
};

const SourceMenuContext = createContext<SourceMenuContextValue | null>(null);

export function useSourceMenu() {
  return useContext(SourceMenuContext);
}

export function SourceMenuHost({ children }: { children: ReactNode }) {
  const { sources } = usePreferences();
  const [article, setArticle] = useState<Article | null>(null);
  const isOpen = article != null;

  const openSourceMenu = useCallback((next: Article) => {
    if (isSourceMenuDismissCooldownActive()) return;
    setArticle(next);
  }, []);

  const handleClose = useCallback(() => {
    markSourceMenuDismissed();
    setArticle(null);
  }, []);

  useEffect(() => {
    if (!article) return;
    return acquireFeedInteractionLock();
  }, [article]);

  useEffect(() => {
    if (!article) return;
    return scheduleWarmNotForMeOptions(article, sources);
  }, [article, sources]);

  const value = useMemo(
    () => ({
      openSourceMenu,
      isOpen,
      openArticleId: article?.id ?? null,
    }),
    [openSourceMenu, isOpen, article?.id],
  );

  return (
    <SourceMenuContext.Provider value={value}>
      <View
        style={styles.host}
        pointerEvents={isOpen ? 'none' : 'box-none'}
        importantForAccessibility={isOpen ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {article ? (
        <NotForMeModal article={article} visible onClose={handleClose} />
      ) : null}
    </SourceMenuContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
});
