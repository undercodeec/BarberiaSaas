import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export async function ensureNativeNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync('appointments', {
      importance: Notifications.AndroidImportance.MAX,
      name: 'Citas y reservas',
      vibrationPattern: [0, 250, 250, 250],
    }),
    Notifications.setNotificationChannelAsync('cash-income', {
      importance: Notifications.AndroidImportance.MAX,
      name: 'Ingresos y comisiones',
      sound: 'cash_income.wav',
      vibrationPattern: [0, 180, 90, 180],
    }),
  ]);
}
