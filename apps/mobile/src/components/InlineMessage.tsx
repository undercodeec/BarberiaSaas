import { StyleSheet, Text, View } from 'react-native';

export function InlineMessage({
  message,
  tone = 'error',
}: {
  readonly message: string;
  readonly tone?: 'error' | 'success';
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.container,
        tone === 'success' ? styles.successContainer : styles.errorContainer,
      ]}
    >
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
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 18,
    padding: 14,
  },
  error: { color: '#a72d27' },
  errorContainer: {
    backgroundColor: '#fff0ee',
    borderColor: '#f0cbc6',
  },
  success: { color: '#277249' },
  successContainer: {
    backgroundColor: '#eaf7ef',
    borderColor: '#c7e8d4',
  },
  text: { fontSize: 14, lineHeight: 20 },
});
