import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { NotForMeModal } from '@/components/NotForMeModal';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSourceMenu } from '@/contexts/SourceMenuContext';
import { useTheme } from '@/hooks/useTheme';
import { scheduleWarmNotForMeOptions } from '@/services/notForMeOptionsSchedule';
import { Article } from '@/types';
import { acquireFeedInteractionLock } from '@/utils/feedInteractionLock';
import {
  createSourceMenuGestureState,
  handleSourceMenuPress,
  handleSourceMenuPressIn,
  openSourceMenu,
  resetSourceMenuGesture,
} from '@/utils/sourceMenuOpen';
import { isSourceMenuDismissCooldownActive, markSourceMenuDismissed } from '@/utils/sourceMenuDismiss';

interface ArticleSourceMenuProps {
  article: Article;
  /** Light text for title-on-image newspaper overlays */
  tone?: 'default' | 'onImage';
}

export function ArticleSourceMenu({
  article,
  tone = 'default',
}: ArticleSourceMenuProps) {
  const { colors } = useTheme();
  const { sources } = usePreferences();
  const sourceMenu = useSourceMenu();
  const [visible, setVisible] = useState(false);
  const [sheetMounted, setSheetMounted] = useState(false);
  const gestureStateRef = useRef(createSourceMenuGestureState());
  const isHosted = sourceMenu != null;
  const isMenuOpenForThisArticle = isHosted && sourceMenu.openArticleId === article.id;
  const accentColor = tone === 'onImage' ? '#FFFFFF' : colors.accent;

  const openLocal = useCallback(() => {
    if (isSourceMenuDismissCooldownActive()) return;
    setSheetMounted(true);
    setVisible(true);
  }, []);

  const openSheet = useCallback(() => {
    if (isHosted && sourceMenu.isOpen) return;
    openSourceMenu(article, sourceMenu?.openSourceMenu ?? null, openLocal);
  }, [article, sourceMenu, openLocal, isHosted]);

  const handlePressIn = useCallback(() => {
    handleSourceMenuPressIn(gestureStateRef.current, openSheet);
  }, [openSheet]);

  const handlePress = useCallback(() => {
    handleSourceMenuPress(gestureStateRef.current, openSheet);
  }, [openSheet]);

  const handlePressOut = useCallback(() => {
    resetSourceMenuGesture(gestureStateRef.current);
  }, []);

  const handleClose = useCallback(() => {
    markSourceMenuDismissed();
    setVisible(false);
  }, []);

  useEffect(() => {
    if (isHosted || !visible) return;
    return scheduleWarmNotForMeOptions(article, sources);
  }, [isHosted, visible, article, sources]);

  useEffect(() => {
    if (isHosted || !visible) return;
    return acquireFeedInteractionLock();
  }, [isHosted, visible]);

  return (
    <>
      <Pressable
        onPressIn={handlePressIn}
        onPress={handlePress}
        onPressOut={handlePressOut}
        delayPressIn={0}
        disabled={isMenuOpenForThisArticle}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Source options for ${article.source}`}
        accessibilityHint="Hide this outlet or show fewer stories like this one"
        accessibilityState={{ disabled: isMenuOpenForThisArticle }}>
        <Text
          style={[
            styles.source,
            tone === 'onImage' && styles.sourceOnImage,
            { color: accentColor },
          ]}
          numberOfLines={1}
          ellipsizeMode="tail">
          {article.source}
        </Text>
        <Ionicons
          name="chevron-down"
          size={13}
          color={accentColor}
          style={styles.chevron}
        />
      </Pressable>

      {!isHosted && sheetMounted ? (
        <NotForMeModal article={article} visible={visible} onClose={handleClose} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    gap: 3,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginVertical: -6,
    marginHorizontal: -4,
  },
  triggerPressed: {
    opacity: 0.72,
  },
  source: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  chevron: {
    flexShrink: 0,
  },
  sourceOnImage: {
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
