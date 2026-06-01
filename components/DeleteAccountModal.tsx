import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useTheme } from '@/hooks/useTheme';

const CONFIRM_PHRASE = 'DELETE';

interface DeleteAccountModalProps {
  visible: boolean;
  userEmail: string;
  onClose: () => void;
  onConfirm: (password: string) => Promise<void>;
}

export function DeleteAccountModal({
  visible,
  userEmail,
  onClose,
  onConfirm,
}: DeleteAccountModalProps) {
  const { colors, styles: themeStyles } = useTheme();
  const [confirmText, setConfirmText] = useState('');
  const [password, setPassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canDelete =
    confirmText.trim() === CONFIRM_PHRASE && password.length > 0 && !isDeleting;

  function resetForm() {
    setConfirmText('');
    setPassword('');
    setErrorMessage(null);
  }

  function handleClose() {
    if (isDeleting) return;
    resetForm();
    onClose();
  }

  async function handleDelete() {
    if (!canDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      await onConfirm(password);
      resetForm();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not delete account.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.centered}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Delete account</Text>
              <Pressable
                onPress={handleClose}
                disabled={isDeleting}
                hitSlop={8}
                accessibilityLabel="Close delete account"
                style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.7 }]}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.helper, { color: colors.textSecondary }]}>
              This permanently removes your account and clears your likes, folders, and reading
              preferences on this device. This cannot be undone.
            </Text>

            <Text style={[themeStyles.label, styles.fieldLabel]} nativeID="delete-confirm-label">
              Type {CONFIRM_PHRASE} to confirm
            </Text>
            <TextInput
              style={[themeStyles.input, styles.input]}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder={CONFIRM_PHRASE}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isDeleting}
              accessibilityLabelledBy="delete-confirm-label"
            />

            <Text style={[themeStyles.label, styles.fieldLabel]} nativeID="delete-password-label">
              Password
            </Text>
            <TextInput
              style={[themeStyles.input, styles.input]}
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!isDeleting}
              accessibilityLabelledBy="delete-password-label"
            />

            <Text style={[styles.emailHint, { color: colors.textSecondary }]}>
              Account: {userEmail}
            </Text>

            {errorMessage ? (
              <Text style={[styles.error, { color: colors.accent }]}>{errorMessage}</Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                onPress={handleClose}
                disabled={isDeleting}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  { borderColor: colors.border },
                  pressed && !isDeleting && { opacity: 0.7 },
                  isDeleting && { opacity: 0.5 },
                ]}>
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleDelete()}
                disabled={!canDelete}
                style={({ pressed }) => [
                  styles.destructiveButton,
                  { backgroundColor: colors.accent },
                  !canDelete && { opacity: 0.5 },
                  pressed && canDelete && { opacity: 0.85 },
                ]}>
                {isDeleting ? (
                  <ActivityIndicator color={colors.background} />
                ) : (
                  <Text style={[styles.destructiveButtonText, { color: colors.background }]}>
                    Delete account
                  </Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
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
  fieldLabel: {
    marginBottom: 8,
  },
  input: {
    marginBottom: 12,
  },
  emailHint: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginBottom: 8,
  },
  error: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
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
  destructiveButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  destructiveButtonText: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
  },
});
