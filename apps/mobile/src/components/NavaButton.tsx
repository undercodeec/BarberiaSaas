import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

const NAVY = '#101C2D';

interface NavaButtonProps {
  readonly compact?: boolean;
  readonly disabled?: boolean;
  readonly icon: ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly loading?: boolean;
  readonly onPress: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly variant: 'outline' | 'primary';
}

export function NavaButton({
  compact = false,
  disabled = false,
  icon,
  label,
  loading = false,
  onPress,
  style,
  variant,
}: NavaButtonProps) {
  const isDisabled = disabled || loading;
  const foreground = variant === 'primary' ? '#FFFFFF' : NAVY;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact ? styles.compactButton : null,
        variant === 'primary' ? styles.primary : styles.outline,
        style,
        pressed ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          <Ionicons color={foreground} name={icon} size={compact ? 23 : 27} />
          <Text
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            numberOfLines={1}
            style={[
              styles.label,
              compact ? styles.compactLabel : null,
              variant === 'primary' ? styles.primaryLabel : styles.outlineLabel,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 26,
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    height: 72,
    justifyContent: 'center',
    paddingHorizontal: 18,
    shadowColor: NAVY,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  compactButton: {
    gap: 7,
    paddingHorizontal: 9,
  },
  compactLabel: {
    fontSize: 15,
  },
  disabled: { opacity: 0.55 },
  label: {
    fontFamily: 'sans-serif',
    fontSize: 17,
    fontWeight: '700',
  },
  outline: {
    backgroundColor: '#FFFFFF',
    borderColor: NAVY,
    borderWidth: 2,
  },
  outlineLabel: { color: NAVY },
  pressed: { transform: [{ scale: 0.98 }] },
  primary: {
    backgroundColor: NAVY,
    borderColor: NAVY,
    borderWidth: 2,
  },
  primaryLabel: { color: '#FFFFFF' },
});
