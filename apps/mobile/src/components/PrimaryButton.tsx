import type { GestureResponderEvent } from 'react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { theme } from '../theme';

interface PrimaryButtonProps {
  readonly disabled?: boolean;
  readonly label: string;
  readonly loading?: boolean;
  readonly onPress: (event: GestureResponderEvent) => void;
  readonly variant?: 'primary' | 'secondary';
}

export function PrimaryButton({
  disabled = false,
  label,
  loading = false,
  onPress,
  variant = 'primary',
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' ? styles.secondary : styles.primary,
        pressed ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={
            variant === 'primary'
              ? theme.colors.background
              : theme.colors.accent
          }
        />
      ) : (
        <Text
          style={
            variant === 'primary' ? styles.primaryLabel : styles.secondaryLabel
          }
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 14,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 52,
    paddingHorizontal: 18,
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  primary: { backgroundColor: theme.colors.accent },
  primaryLabel: {
    color: theme.colors.background,
    fontSize: 16,
    fontWeight: '900',
  },
  secondary: { borderColor: theme.colors.border, borderWidth: 1 },
  secondaryLabel: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
});
