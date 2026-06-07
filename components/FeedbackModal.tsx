import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import {
  Alert,
  Keyboard,
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

import { useTheme } from '@/hooks/useTheme';

const FEEDBACK_EMAIL = 'support@gloverlabsstudio.com';

interface FeedbackModalProps {
  visible: boolean;
  onClose: () => void;
  userName?: string;
  userEmail?: string;
}

export function FeedbackModal({ visible, onClose, userName, userEmail }: FeedbackModalProps) {
  const { colors, styles: themeStyles } = useTheme();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  function handleClose() {
    Keyboard.dismiss();
    setMessage('');
    onClose();
  }

  async function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || isSending) return;

    const contextLines = [
      userName ? `From: ${userName}` : null,
      userEmail ? `Email: ${userEmail}` : null,
      Platform.OS !== 'web' ? `Platform: ${Platform.OS}` : null,
    ].filter(Boolean);

    const body = [trimmed, '', '---', ...contextLines].join('\n');
    const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('DailyFold app feedback')}&body=${encodeURIComponent(body)}`;

    setIsSending(true);
    try {
      const canOpen = await Linking.canOpenURL(mailto);
      if (!canOpen) {
        Alert.alert(
          'Email unavailable',
          `Please email us at ${FEEDBACK_EMAIL} with your feedback.`,
        );
        return;
      }

      await Linking.openURL(mailto);
      setMessage('');
      onClose();
    } catch {
      Alert.alert(
        'Could not open email',
        `Please email us at ${FEEDBACK_EMAIL} with your feedback.`,
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss feedback"
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centered}
          pointerEvents="box-none">
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              showsVerticalScrollIndicator={false}>
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>Send feedback</Text>
                <Pressable
                  onPress={handleClose}
                  hitSlop={8}
                  accessibilityLabel="Close feedback"
                  style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}>
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
              </View>
              <Text style={[styles.helper, { color: colors.textSecondary }]}>
                Tell us what you think of the app and what you would like to see next.
              </Text>
              <Text style={[themeStyles.label, styles.label]} nativeID="feedback-message-label">
                Your feedback
              </Text>
              <TextInput
                style={[themeStyles.input, styles.input]}
                value={message}
                onChangeText={setMessage}
                placeholder="Ideas, bugs, or features you want..."
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Feedback message"
                accessibilityLabelledBy="feedback-message-label"
                autoFocus
                multiline
                textAlignVertical="top"
                maxLength={2000}
              />
              <View style={styles.actions}>
                <Pressable
                  onPress={handleClose}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    { borderColor: colors.border },
                    pressed && { opacity: 0.7 },
                  ]}>
                  <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleSend()}
                  disabled={!message.trim() || isSending}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.text },
                    (!message.trim() || isSending) && { opacity: 0.5 },
                    pressed && message.trim() && !isSending && { opacity: 0.85 },
                  ]}>
                  <Text style={[styles.primaryButtonText, { color: colors.background }]}>
                    Send email
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  centered: {
    width: '100%',
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  title: {
    flex: 1,
    fontFamily: 'LoraBold',
    fontSize: 22,
  },
  closeButton: {
    padding: 2,
  },
  helper: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
  },
  input: {
    minHeight: 120,
    paddingTop: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  secondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
  },
  primaryButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
  },
});
