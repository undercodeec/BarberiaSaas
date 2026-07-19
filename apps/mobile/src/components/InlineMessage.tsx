import { StyleSheet, Text, View } from 'react-native';

import { theme } from '../theme';

export function InlineMessage({
  message,
  tone = 'error',
}: {
  readonly message: string;
  readonly tone?: 'error' | 'success';
}) {
  return (
    <View accessibilityRole="alert" style={styles.container}>
      <Text
        style={[
          styles.text,
          tone === 'success' ? styles.success : styles.error,
        ]}
      >
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    marginBottom: 18,
    padding: 14,
  },
  error: { color: theme.colors.danger },
  success: { color: theme.colors.accent },
  text: { fontSize: 14, lineHeight: 20 },
});
