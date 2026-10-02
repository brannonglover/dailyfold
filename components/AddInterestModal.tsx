import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CURIOSITY_LABELS, CURIOSITY_ORDER } from '@/constants/curiosities';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { Topic } from '@/types';
import { normalizeForYouKeyword } from '@/utils/forYouTopics';

interface AddInterestModalProps {
  visible: boolean;
  onClose: () => void;
}

const EXAMPLE_INTERESTS = [
  'Vintage Mountain Bikes',
  'AI Development Tools',
  'Fantasy & Science Fiction Books',
  'React Native Performance',
  'Atlanta Restaurants',
  'Downhill Racing',
  'Bike Repair',
  'Space Exploration',
];

const TOPIC_SUGGESTIONS: { topic: Topic; label: string }[] = CURIOSITY_ORDER.map((topic) => ({
  topic,
  label: CURIOSITY_LABELS[topic],
}));

export function AddInterestModal({ visible, onClose }: AddInterestModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const {
    preferences,
    addForYouKeyword,
    addForYouTopic,
  } = usePreferences();

  useEffect(() => {
    if (visible) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [visible]);

  const existingKeywords = useMemo(
    () => new Set((preferences?.forYouKeywords ?? []).map(normalizeForYouKeyword)),
    [preferences?.forYouKeywords],
  );
  const existingTopics = useMemo(
    () => new Set(preferences?.forYouTopics ?? []),
    [preferences?.forYouTopics],
  );

  const trimmed = query.trim();
  const normalized = normalizeForYouKeyword(trimmed);
  const alreadyAdded = existingKeywords.has(normalized);
  const canAdd = normalized.length >= 2 && !alreadyAdded;

  const handleAddCustom = useCallback(async () => {
    if (!canAdd) return;
    await addForYouKeyword(trimmed);
    setQuery('');
    onClose();
  }, [canAdd, trimmed, addForYouKeyword, onClose]);

  const handleAddTopic = useCallback(
    async (topic: Topic) => {
      await addForYouTopic(topic);
      setQuery('');
      onClose();
    },
    [addForYouTopic, onClose],
  );

  const handleAddExample = useCallback(
    async (example: string) => {
      await addForYouKeyword(example);
      setQuery('');
      onClose();
    },
    [addForYouKeyword, onClose],
  );

  const filteredTopics = useMemo(() => {
    if (normalized.length < 2) return [];
    return TOPIC_SUGGESTIONS.filter(
      (s) =>
        !existingTopics.has(s.topic) &&
        (s.label.toLowerCase().includes(normalized) || s.topic.includes(normalized)),
    );
  }, [normalized, existingTopics]);

  const filteredExamples = useMemo(() => {
    if (normalized.length > 0) {
      return EXAMPLE_INTERESTS.filter(
        (e) =>
          e.toLowerCase().includes(normalized) && !existingKeywords.has(normalizeForYouKeyword(e)),
      );
    }
    return EXAMPLE_INTERESTS.filter((e) => !existingKeywords.has(normalizeForYouKeyword(e)));
  }, [normalized, existingKeywords]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Add an interest</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <View style={styles.promptSection}>
            <Text style={[styles.promptTitle, { color: colors.text }]}>
              What are you interested in?
            </Text>
            <Text style={[styles.promptSubtitle, { color: colors.textSecondary }]}>
              Follow anything from broad topics to very specific interests.
            </Text>
          </View>

          <View
            style={[
              styles.inputField,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}>
            <Ionicons name="search" size={18} color={colors.textSecondary} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="e.g. vintage mountain bikes"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleAddCustom}
              style={[styles.input, { color: colors.text }]}
              accessibilityLabel="Interest name"
            />
            {query.length > 0 ? (
              <Pressable
                onPress={() => setQuery('')}
                accessibilityRole="button"
                accessibilityLabel="Clear"
                hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          {canAdd ? (
            <Pressable
              onPress={handleAddCustom}
              accessibilityRole="button"
              accessibilityLabel={`Follow ${trimmed}`}
              style={({ pressed }) => [
                styles.addCustomRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}>
              <View style={[styles.addCustomIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="add" size={16} color={colors.accent} />
              </View>
              <View style={styles.addCustomText}>
                <Text style={[styles.addCustomLabel, { color: colors.text }]} numberOfLines={1}>
                  Follow "{trimmed}"
                </Text>
                <Text style={[styles.addCustomHint, { color: colors.textSecondary }]}>
                  Add as a custom interest
                </Text>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            </Pressable>
          ) : alreadyAdded && normalized.length >= 2 ? (
            <View style={[styles.addCustomRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.addCustomIcon, { backgroundColor: colors.accentMuted }]}>
                <Ionicons name="checkmark" size={16} color={colors.accent} />
              </View>
              <Text style={[styles.addCustomLabel, { color: colors.textSecondary }]}>
                Already following "{trimmed}"
              </Text>
            </View>
          ) : null}

          {filteredTopics.length > 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                Matching topics
              </Text>
              {filteredTopics.map(({ topic, label }) => (
                <Pressable
                  key={topic}
                  onPress={() => handleAddTopic(topic)}
                  accessibilityRole="button"
                  accessibilityLabel={`Follow ${label}`}
                  style={({ pressed }) => [
                    styles.suggestionRow,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.suggestionIcon, { backgroundColor: colors.accentMuted }]}>
                    <Ionicons name="grid-outline" size={14} color={colors.accent} />
                  </View>
                  <Text style={[styles.suggestionLabel, { color: colors.text }]}>{label}</Text>
                  <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
                </Pressable>
              ))}
            </View>
          ) : null}

          {filteredExamples.length > 0 && trimmed.length === 0 ? (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                Ideas to get started
              </Text>
              <View style={styles.exampleChips}>
                {filteredExamples.map((example) => (
                  <Pressable
                    key={example}
                    onPress={() => handleAddExample(example)}
                    accessibilityRole="button"
                    accessibilityLabel={`Follow ${example}`}
                    style={({ pressed }) => [
                      styles.exampleChip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons name="add" size={14} color={colors.accent} />
                    <Text style={[styles.exampleChipText, { color: colors.text }]}>{example}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontFamily: 'LoraBold',
    fontSize: 22,
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingTop: 24,
    gap: 16,
  },
  promptSection: {
    paddingHorizontal: 24,
    gap: 6,
  },
  promptTitle: {
    fontFamily: 'LoraSemiBold',
    fontSize: 20,
    lineHeight: 26,
  },
  promptSubtitle: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
  },
  inputField: {
    marginHorizontal: 24,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    paddingVertical: 0,
  },
  addCustomRow: {
    marginHorizontal: 24,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addCustomIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCustomText: {
    flex: 1,
    minWidth: 0,
  },
  addCustomLabel: {
    fontFamily: 'InterMedium',
    fontSize: 15,
  },
  addCustomHint: {
    fontFamily: 'Inter',
    fontSize: 12,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: 24,
    gap: 8,
  },
  sectionLabel: {
    fontFamily: 'InterMedium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  suggestionRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionLabel: {
    flex: 1,
    fontFamily: 'InterMedium',
    fontSize: 15,
  },
  exampleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exampleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  exampleChipText: {
    fontFamily: 'InterMedium',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
