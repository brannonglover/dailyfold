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
  isSourceMenuOpen,
  markSourceMenuClosed,
  markSourceMenuOpen,
  openSourceMenu,
  resetSourceMenuGesture,
} from '@/utils/sourceMenuOpen';
import { isSourceMenuDismissCooldownActive, markSourceMenuDismissed } from '@/utils/sourceMenuDismiss';

export type ArticleSourceMenuPresentation = 'sourceLabel' | 'icon';

interface ArticleSourceMenuProps {
  article: Article;
  /** Light text for title-on-image newspaper overlays */
  tone?: 'default' | 'onImage';
  /**
   * Feed cards use a quiet ⋯ so the headline stays primary; reader keeps the
   * labeled source trigger for attribution at the top of the article.
   */
  presentation?: ArticleSourceMenuPresentation;
}

export function ArticleSourceMenu({
  article,
  tone = 'default',
  presentation = 'sourceLabel',
}: ArticleSourceMenuProps) {
  const { colors } = useTheme();
  const { sources } = usePreferences();
  const sourceMenu = useSourceMenu();
  const [localOpen, setLocalOpen] = useState(false);
  const gestureStateRef = useRef(createSourceMenuGestureState());
  const isHosted = sourceMenu != null;
  const accentColor = tone === 'onImage' ? '#FFFFFF' : colors.accent;
  const iconColor = tone === 'onImage' ? '#FFFFFF' : colors.textSecondary;

  const openLocal = useCallback(() => {
    if (isSourceMenuDismissCooldownActive()) return;
    markSourceMenuOpen();
    setLocalOpen(true);
  }, []);

  const openSheet = useCallback(() => {
    if (isSourceMenuOpen()) return;
    openSourceMenu(article, sourceMenu?.openSourceMenu ?? null, openLocal);
  }, [article, sourceMenu, openLocal]);

  const handlePress = useCallback(() => {
    handleSourceMenuPress(gestureStateRef.current, openSheet);
  }, [openSheet]);

  const handlePressOut = useCallback(() => {
    resetSourceMenuGesture(gestureStateRef.current);
  }, []);

  const handleClose = useCallback(() => {
    markSourceMenuDismissed();
    markSourceMenuClosed();
    setLocalOpen(false);
  }, []);

  useEffect(() => {
    if (isHosted || !localOpen) return;
    return scheduleWarmNotForMeOptions(article, sources);
  }, [isHosted, localOpen, article, sources]);

  useEffect(() => {
    if (isHosted || !localOpen) return;
    return acquireFeedInteractionLock();
  }, [isHosted, localOpen]);

  const accessibilityLabel =
    presentation === 'icon'
      ? `Story options for ${article.title}`
      : `Source options for ${article.source}`;

  return (
    <>
      <Pressable
        onPress={handlePress}
        onPressOut={handlePressOut}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={({ pressed }) => [
          presentation === 'icon' ? styles.iconTrigger : styles.trigger,
          pressed && styles.triggerPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Hide this outlet or show fewer stories like this one">
        {presentation === 'icon' ? (
          <Ionicons name="ellipsis-horizontal" size={18} color={iconColor} />
        ) : (
          <>
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
          </>
        )}
      </Pressable>

      {!isHosted && localOpen ? (
        <NotForMeModal article={article} visible onClose={handleClose} />
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
  iconTrigger: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    marginVertical: -4,
    marginHorizontal: -2,
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
