/* eslint-disable react-hooks/refs -- React Native Animated exposes a stable imperative value that is intentionally read by the animated style. */
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { appTheme, goldButtonShadow } from './BottomNavigation';

type BookingLinkSheetProps = {
  readonly onClose: () => void;
  readonly url: string;
  readonly visible: boolean;
};

function qrCodeUrl(url: string) {
  return `https://quickchart.io/qr?size=768&text=${encodeURIComponent(url)}`;
}

export function BookingLinkSheet({
  onClose,
  url,
  visible,
}: BookingLinkSheetProps) {
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const translateY = useRef(new Animated.Value(540)).current;

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(540);
    Animated.timing(translateY, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  const close = () => {
    Animated.timing(translateY, {
      duration: 190,
      easing: Easing.in(Easing.cubic),
      toValue: 540,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  };

  const openUrl = async (nextUrl: string, title: string) => {
    const canOpen = await Linking.canOpenURL(nextUrl);
    if (!canOpen) {
      Alert.alert('No se pudo abrir', `No encontramos una app para ${title}.`);
      return;
    }
    await Linking.openURL(nextUrl);
  };

  if (!visible) return null;
  const isBookingUrlReady = Boolean(url);
  const qrUrl = isBookingUrlReady ? qrCodeUrl(url) : '';

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={close}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={styles.overlay}>
        <Pressable
          accessibilityLabel="Cerrar opciones de reservas"
          accessibilityRole="button"
          onPress={close}
          style={styles.backdrop}
        />
        <Animated.View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY }],
            },
          ]}
        >
          <View style={styles.handle} />
          <Text accessibilityRole="header" style={styles.title}>
            Tu enlace de reservas
          </Text>
          <Text numberOfLines={2} style={styles.url}>
            {url || 'Estamos preparando tu enlace de reservas.'}
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={!isBookingUrlReady}
            onPress={() => void openUrl(qrUrl, 'mostrar el código QR')}
            style={[styles.option, !isBookingUrlReady && styles.optionDisabled]}
          >
            <View style={styles.iconCircle}>
              <Ionicons
                color={appTheme.colors.white}
                name="qr-code-outline"
                size={24}
              />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>Código QR</Text>
              <Text style={styles.optionDescription}>
                Ábrelo para descargarlo o compartirlo en tu local y redes.
              </Text>
            </View>
            <Ionicons
              color={appTheme.colors.accentDark}
              name="open-outline"
              size={20}
            />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!isBookingUrlReady}
            onPress={() => void copyLink()}
            style={[styles.option, !isBookingUrlReady && styles.optionDisabled]}
          >
            <View style={styles.iconCircle}>
              <Ionicons
                color={appTheme.colors.white}
                name="copy-outline"
                size={23}
              />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>
                {copied ? 'Enlace copiado' : 'Copiar enlace'}
              </Text>
              <Text style={styles.optionDescription}>
                Pégalo donde quieras compartirlo.
              </Text>
            </View>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            disabled={!isBookingUrlReady}
            onPress={() => void openUrl(url, 'ver tu website')}
            style={[styles.option, !isBookingUrlReady && styles.optionDisabled]}
          >
            <View style={styles.iconCircle}>
              <Ionicons
                color={appTheme.colors.white}
                name="globe-outline"
                size={24}
              />
            </View>
            <View style={styles.optionCopy}>
              <Text style={styles.optionTitle}>Ver mi website</Text>
              <Text style={styles.optionDescription}>
                Abre la página pública de tus reservas.
              </Text>
            </View>
            <Ionicons
              color={appTheme.colors.accentDark}
              name="open-outline"
              size={20}
            />
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: appTheme.colors.overlay,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#D8C18A',
    borderRadius: 4,
    height: 5,
    marginBottom: 20,
    width: 46,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 18,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  option: {
    alignItems: 'center',
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 77,
    paddingVertical: 13,
  },
  optionCopy: { flex: 1 },
  optionDescription: {
    color: appTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  optionDisabled: { opacity: 0.5 },
  optionTitle: { color: appTheme.colors.text, fontSize: 16, fontWeight: '800' },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: appTheme.colors.surfaceElevated,
    borderTopLeftRadius: appTheme.radii.sheet,
    borderTopRightRadius: appTheme.radii.sheet,
    paddingHorizontal: 24,
    paddingTop: 12,
    ...goldButtonShadow,
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  url: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    marginBottom: 18,
    marginTop: 9,
    textAlign: 'center',
  },
});
