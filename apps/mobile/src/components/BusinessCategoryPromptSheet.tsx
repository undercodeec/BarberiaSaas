import Ionicons from '@expo/vector-icons/Ionicons';
import type { BusinessCategory } from '@barber-saas/api-client';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BUSINESS_CATEGORY_OPTIONS } from '../lib/business-category';
import { appTheme, goldButtonShadow } from './BottomNavigation';

export function BusinessCategoryPromptSheet({
  initialCategory,
  onDismiss,
  onSubmit,
  visible,
}: {
  readonly initialCategory: BusinessCategory;
  readonly onDismiss: () => void;
  readonly onSubmit: (category: BusinessCategory) => Promise<void>;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState(initialCategory);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(category);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'No pudimos guardar la categoría. Inténtalo nuevamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={isSubmitting ? undefined : onDismiss}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Cerrar selector de categoría"
          disabled={isSubmitting}
          onPress={onDismiss}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}
        >
          <View style={styles.handle} />
          <Text accessibilityRole="header" style={styles.title}>
            ¿Qué tipo de negocio atiendes?
          </Text>
          <Text style={styles.copy}>
            Usaremos esta selección para personalizar el lenguaje y las imágenes
            de Nava. Puedes cambiarla cuando quieras.
          </Text>
          <View style={styles.options}>
            {BUSINESS_CATEGORY_OPTIONS.map((option) => {
              const selected = option.value === category;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  disabled={isSubmitting}
                  key={option.value}
                  onPress={() => setCategory(option.value)}
                  style={[
                    styles.option,
                    selected ? styles.optionSelected : null,
                  ]}
                >
                  <Ionicons
                    color={selected ? '#FFFFFF' : appTheme.colors.accentDark}
                    name={option.icon}
                    size={19}
                  />
                  <Text
                    style={[
                      styles.optionLabel,
                      selected ? styles.optionLabelSelected : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected ? (
                    <Ionicons
                      color="#FFFFFF"
                      name="checkmark-circle"
                      size={20}
                    />
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => void submit()}
            style={[styles.submit, isSubmitting ? styles.submitDisabled : null]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitLabel}>Guardar categoría</Text>
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={onDismiss}
            style={styles.later}
          >
            <Text style={styles.laterLabel}>Ahora no</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  error: {
    color: appTheme.colors.danger,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#C8C9CB',
    borderRadius: 4,
    height: 5,
    width: 42,
  },
  later: { alignItems: 'center', marginTop: 14, minHeight: 30 },
  laterLabel: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    fontWeight: '800',
  },
  option: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 49,
    paddingHorizontal: 14,
  },
  optionLabel: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  optionLabelSelected: { color: '#FFFFFF' },
  optionSelected: {
    backgroundColor: appTheme.colors.accentDark,
    borderColor: appTheme.colors.accentDark,
  },
  options: { gap: 8, marginTop: 18 },
  overlay: {
    backgroundColor: 'rgba(16, 28, 45, 0.48)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: appTheme.colors.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 13,
  },
  submit: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accentDark,
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 52,
    ...goldButtonShadow,
  },
  submitDisabled: { opacity: 0.65 },
  submitLabel: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  title: {
    color: appTheme.colors.text,
    fontSize: 21,
    fontWeight: '900',
    marginTop: 15,
    textAlign: 'center',
  },
});
