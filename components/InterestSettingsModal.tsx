import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { ForYouInterestKind } from '@/services/recommendations';
import { SportTag, Topic } from '@/types';
import { formatInterestLabel } from '@/utils/interestKeywords';

interface InterestSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  kind: ForYouInterestKind;
  value: string;
}

function interestLabel(kind: ForYouInterestKind, value: string): string {
  switch (kind) {
    case 'topic':
      return CURIOSITY_LABELS[value as Topic] ?? formatInterestLabel(value);
    case 'keyword':
      return formatInterestLabel(value);
    case 'sportTag':
      return SPORT_TAG_LABELS[value as SportTag] ?? formatInterestLabel(value);
  }
}

interface SettingsOption {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export function InterestSettingsModal({
  visible,
  onClose,
  kind,
  value,
}: InterestSettingsModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    removeForYouTopic,
    removeForYouKeyword,
    removeForYouSportTag,
  } = usePreferences();

  const label = interestLabel(kind, value);

  const handleRemove = useCallback(() => {
    onClose();
    Alert.alert(
      `Remove "${label}"?`,
      'This interest will be removed from your For You feed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (Platform.OS !== 'web') {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
            switch (kind) {
              case 'topic':
                void removeForYouTopic(value as Topic);
                break;
              case 'keyword':
                void removeForYouKeyword(value);
                break;
              case 'sportTag':
                void removeForYouSportTag(value as SportTag);
                break;
            }
            router.back();
          },
        },
      ],
    );
  }, [kind, value, label, onClose, router, removeForYouTopic, removeForYouKeyword, removeForYouSportTag]);

  const options: SettingsOption[] = [
    {
      icon: 'trash-outline',
      label: 'Remove interest',
      destructive: true,
      onPress: handleRemove,
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View />
      </Pressable>
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.background,
            paddingBottom: insets.bottom + 16,
          },
        ]}>
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
        </View>

        <Text style={[styles.sheetTitle, { color: colors.text }]}>{label}</Text>

        <View style={styles.optionList}>
          {options.map((option) => (
            <Pressable
              key={option.label}
              onPress={option.onPress}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              style={({ pressed }) => [
                styles.optionRow,
                { borderBottomColor: colors.border },
                pressed && styles.pressed,
              ]}>
              <Ionicons
                name={option.icon}
                size={20}
                color={option.destructive ? '#FF453A' : colors.text}
              />
              <Text
                style={[
                  styles.optionLabel,
                  { color: option.destructive ? '#FF453A' : colors.text },
                ]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => [
            styles.cancelButton,
            { backgroundColor: colors.surface },
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
  },
  handle: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  optionList: {
    gap: 0,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  optionLabel: {
    fontFamily: 'Inter',
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: 'InterSemiBold',
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
