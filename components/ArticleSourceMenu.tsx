import { Ionicons } from '@expo/vector-icons';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { NotForMeModal } from '@/components/NotForMeModal';
import { FALLBACK_SOURCES } from '@/data/sources';
import { useTheme } from '@/hooks/useTheme';
import { warmNotForMeOptions } from '@/services/notForMeOptions';
import { Article } from '@/types';

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
  const [visible, setVisible] = useState(false);
  const accentColor = tone === 'onImage' ? '#FFFFFF' : colors.accent;
  const handleClose = useCallback(() => setVisible(false), []);
  const handleOpen = useCallback(() => setVisible(true), []);
  const handlePressIn = useCallback(() => {
    warmNotForMeOptions(article, FALLBACK_SOURCES);
  }, [article]);

  return (
    <>
      <Pressable
        onPress={handleOpen}
        onPressIn={handlePressIn}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        accessibilityRole="button"
        accessibilityLabel={`Source options for ${article.source}`}
        accessibilityHint="Hide this outlet or show fewer stories like this one">
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

      {visible ? (
        <NotForMeModal article={article} onClose={handleClose} />
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
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
