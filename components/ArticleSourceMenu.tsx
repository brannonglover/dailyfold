import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { NotForMeModal } from '@/components/NotForMeModal';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';

interface ArticleSourceMenuProps {
  article: Article;
  bottomOffset?: number;
  /** Light text for title-on-image newspaper overlays */
  tone?: 'default' | 'onImage';
}

export function ArticleSourceMenu({
  article,
  bottomOffset,
  tone = 'default',
}: ArticleSourceMenuProps) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const accentColor = tone === 'onImage' ? '#FFFFFF' : colors.accent;

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
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
          numberOfLines={1}>
          {article.source}
        </Text>
        <Ionicons name="chevron-down" size={13} color={accentColor} />
      </Pressable>

      <NotForMeModal
        visible={visible}
        article={article}
        bottomOffset={bottomOffset}
        onClose={() => setVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
    maxWidth: '100%',
    paddingVertical: 2,
    marginVertical: -2,
  },
  triggerPressed: {
    opacity: 0.72,
  },
  source: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  sourceOnImage: {
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
