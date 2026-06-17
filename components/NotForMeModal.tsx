import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { buildNotForMeOptions, NotForMeAction, NotForMeOption } from '@/services/notForMeOptions';
import { Article } from '@/types';

export type { NotForMeAction } from '@/services/notForMeOptions';

interface NotForMeModalProps {
  article: Article;
  onClose: () => void;
}

export function NotForMeModal({ article, onClose }: NotForMeModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    sources,
    hideSourceFromArticle,
    hideTopicFromArticle,
    hideSportTagFromArticle,
    hideKeywordFromArticle,
    hideSimilarToArticle,
  } = usePreferences();

  const [options, setOptions] = useState<NotForMeOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!cancelled) {
        setOptions(buildNotForMeOptions(article, sources));
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [article, sources]);

  async function runAction(action: NotForMeAction) {
    onClose();

    if (Platform.OS !== 'web') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
      case 'keyword':
        await hideKeywordFromArticle(article, action.keyword);
        break;
      case 'similar':
        await hideSimilarToArticle(article);
        break;
    }
  }

  function handleCancel() {
    onClose();
  }

  return (
    <Modal visible animationType="slide" transparent onRequestClose={handleCancel}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={handleCancel} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              borderColor: colors.border,
              paddingBottom: insets.bottom + 16,
            },
          ]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text style={[styles.title, { color: colors.text }]}>{article.source}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Hide this outlet or show fewer stories like this one.
          </Text>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled>
            {options ? (
              options.map((option) => (
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
              ))
            ) : (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.textSecondary} />
              </View>
            )}
          </ScrollView>

          <Pressable
            onPress={handleCancel}
            style={({ pressed }) => [
              styles.cancelButton,
              { borderColor: colors.border },
              pressed && { opacity: 0.7 },
            ]}>
            <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: Platform.OS === 'web' ? '80%' : '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
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
    flexGrow: 0,
    maxHeight: 360,
  },
  bodyContent: {
    gap: 0,
  },
  loading: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
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
