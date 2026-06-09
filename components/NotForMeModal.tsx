import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { tabBarModalBottomOffset } from '@/constants/Layout';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { articleSportTags } from '@/services/sportPreferences';
import { Article, SportTag, Topic } from '@/types';

export type NotForMeAction =
  | { type: 'source' }
  | { type: 'topic'; topic: Topic }
  | { type: 'sportTag'; tag: SportTag }
  | { type: 'similar' };

interface NotForMeModalProps {
  visible: boolean;
  article: Article;
  onClose: () => void;
  bottomOffset?: number;
}

export function NotForMeModal({
  visible,
  article,
  onClose,
  bottomOffset = 0,
}: NotForMeModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    sources,
    hideSourceFromArticle,
    hideTopicFromArticle,
    hideSportTagFromArticle,
    hideSimilarToArticle,
  } = usePreferences();

  const sourceId = useMemo(
    () => sources.find((source) => source.name === article.source)?.id ?? null,
    [sources, article.source],
  );

  const sportTags = useMemo(() => articleSportTags(article), [article]);

  const sheetAnchorBottom =
    bottomOffset > 0 ? tabBarModalBottomOffset(bottomOffset, insets.bottom) : 0;

  async function runAction(action: NotForMeAction) {
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    switch (action.type) {
      case 'source':
        await hideSourceFromArticle(article);
        break;
      case 'topic':
        await hideTopicFromArticle(article, action.topic);
        break;
      case 'sportTag':
        await hideSportTagFromArticle(article, action.tag);
        break;
      case 'similar':
        await hideSimilarToArticle(article);
        break;
    }

    onClose();
  }

  const options: { key: string; label: string; detail?: string; action: NotForMeAction }[] = [];

  if (sourceId) {
    options.push({
      key: 'source',
      label: `Hide stories from ${article.source}`,
      detail: 'You can re-enable this outlet in Profile → Sources',
      action: { type: 'source' },
    });
  }

  for (const topic of article.topics) {
    options.push({
      key: `topic-${topic}`,
      label: `Show less ${CURIOSITY_LABELS[topic]}`,
      action: { type: 'topic', topic },
    });
  }

  for (const tag of sportTags) {
    options.push({
      key: `sport-${tag}`,
      label: `Show less ${SPORT_TAG_LABELS[tag]}`,
      action: { type: 'sportTag', tag },
    });
  }

  options.push({
    key: 'similar',
    label: 'Show less like this story',
    detail: 'Hides articles with similar headline keywords',
    action: { type: 'similar' },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={[styles.sheetAnchor, { bottom: sheetAnchorBottom }]}>
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: bottomOffset > 0 ? 16 : insets.bottom + 16,
              },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text }]}>{article.source}</Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Hide this outlet or show fewer stories like this one.
            </Text>

            <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
              {options.map((option) => (
                <Pressable
                  key={option.key}
                  onPress={() => void runAction(option.action)}
                  style={({ pressed }) => [
                    styles.row,
                    { borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Ionicons name="close-circle-outline" size={22} color={colors.textSecondary} />
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, { color: colors.text }]}>{option.label}</Text>
                    {option.detail ? (
                      <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>
                        {option.detail}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </ScrollView>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancelButton,
                { borderColor: colors.border },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: '80%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'LoraBold',
    fontSize: 22,
  },
  subtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
    marginBottom: 16,
  },
  body: {
    maxHeight: 360,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    lineHeight: 21,
  },
  rowDetail: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  cancelButton: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
  },
});
