import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { appTheme } from '../../components/BottomNavigation';

export function FirstStepsCard({
  onDismiss,
  onStartBooking,
  onStartShareLink,
}: {
  readonly onDismiss: () => void;
  readonly onStartBooking: () => void;
  readonly onStartShareLink: () => void;
}) {
  return (
    <View accessibilityRole="summary" style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.iconShell}>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="sparkles"
            size={20}
          />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>Primeros pasos</Text>
          <Text style={styles.description}>
            Conoce las dos acciones que te ayudarán a empezar.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Recordar los primeros pasos más tarde"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onDismiss}
          style={styles.close}
        >
          <Ionicons color={appTheme.colors.textMuted} name="close" size={19} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onStartBooking}
          style={styles.action}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="calendar-outline"
            size={18}
          />
          <Text style={styles.actionLabel}>Crear una cita</Text>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-forward"
            size={17}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onStartShareLink}
          style={styles.action}
        >
          <Ionicons
            color={appTheme.colors.accentDark}
            name="share-social-outline"
            size={18}
          />
          <Text style={styles.actionLabel}>Compartir mi enlace</Text>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="arrow-forward"
            size={17}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    minHeight: 46,
    paddingHorizontal: 13,
  },
  actionLabel: {
    color: appTheme.colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '800',
  },
  actions: { gap: 9, marginTop: 15 },
  card: {
    backgroundColor: appTheme.colors.accentWash,
    borderColor: 'rgba(199, 149, 50, 0.34)',
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  close: { minHeight: 32, minWidth: 32, padding: 6 },
  copy: { flex: 1 },
  description: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  heading: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  iconShell: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderRadius: 12,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  title: { color: appTheme.colors.text, fontSize: 16, fontWeight: '900' },
});
