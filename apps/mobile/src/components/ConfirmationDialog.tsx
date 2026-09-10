import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { appTheme } from './BottomNavigation';

type ConfirmationDialogProps = {
  readonly cancelLabel?: string;
  readonly confirmLabel: string;
  readonly description: string;
  readonly isPending?: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly visible: boolean;
};

/** Confirmaciones visuales consistentes en Android e iOS. */
export function ConfirmationDialog({
  cancelLabel = 'Cancelar',
  confirmLabel,
  description,
  isPending = false,
  onCancel,
  onConfirm,
  title,
  visible,
}: ConfirmationDialogProps) {
  return (
    <Modal
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.layer}>
        <Pressable onPress={onCancel} style={styles.backdrop} />
        <View accessibilityRole="alert" style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isPending}
              onPress={onCancel}
              style={[styles.cancelButton, isPending && styles.disabled]}
            >
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isPending}
              onPress={onConfirm}
              style={[styles.confirmButton, isPending && styles.disabled]}
            >
              <Text style={styles.confirmLabel}>
                {isPending ? 'Procesando...' : confirmLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: appTheme.colors.overlay,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radii.control,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  cancelLabel: { color: appTheme.colors.text, fontSize: 15, fontWeight: '800' },
  confirmButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentDark,
    borderRadius: appTheme.radii.control,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  confirmLabel: { color: appTheme.colors.white, fontSize: 15, fontWeight: '900' },
  description: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 21,
    marginTop: 8,
  },
  dialog: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radii.sheet,
    marginHorizontal: 24,
    maxWidth: 460,
    padding: 24,
    width: '100%',
  },
  disabled: { opacity: 0.55 },
  layer: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: appTheme.colors.text, fontSize: 21, fontWeight: '900' },
});
