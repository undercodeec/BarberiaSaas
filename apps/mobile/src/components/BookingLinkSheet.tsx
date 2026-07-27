import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

type BookingLinkSheetProps = {
  readonly onClose: () => void;
  readonly url: string;
  readonly visible: boolean;
};

export function BookingLinkSheet({
  onClose,
  url,
  visible,
}: BookingLinkSheetProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
  };

  if (!visible) return null;

  return (
    <View accessibilityViewIsModal style={styles.overlay}>
      <Pressable
        accessibilityLabel="Cerrar"
        accessibilityRole="button"
        onPress={onClose}
        style={styles.backdrop}
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text accessibilityRole="header" style={styles.title}>
          {'Tu enlace de reservas'}
        </Text>
        <Text numberOfLines={2} style={styles.url}>
          {url}
        </Text>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              'C\u00f3digo QR',
              'Podr\u00e1s descargar y compartir el c\u00f3digo QR cuando activemos las reservas p\u00fablicas.',
            )
          }
          style={styles.option}
        >
          <View style={styles.iconCircle}>
            <Ionicons color="#3478f6" name="qr-code-outline" size={24} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>{'C\u00f3digo QR'}</Text>
            <Text style={styles.optionDescription}>
              {'Comp\u00e1rtelo en tu local o redes'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => void copyLink()}
          style={styles.option}
        >
          <View style={styles.iconCircle}>
            <Ionicons color="#3478f6" name="copy-outline" size={23} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>
              {copied ? 'Enlace copiado' : 'Copiar enlace'}
            </Text>
            <Text style={styles.optionDescription}>
              {'P\u00e9galo donde quieras compartirlo'}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() =>
            Alert.alert(
              'Website en preparaci\u00f3n',
              'Tu p\u00e1gina p\u00fablica estar\u00e1 disponible cuando activemos las reservas.',
            )
          }
          style={styles.option}
        >
          <View style={styles.iconCircle}>
            <Ionicons color="#3478f6" name="globe-outline" size={24} />
          </View>
          <View style={styles.optionCopy}>
            <Text style={styles.optionTitle}>{'Ver mi website'}</Text>
            <Text style={styles.optionDescription}>{'Pr\u00f3ximamente'}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: 'rgba(16, 28, 45, 0.38)',
  },
  handle: {
    alignSelf: 'center',
    backgroundColor: '#cad5e7',
    borderRadius: 4,
    height: 5,
    marginBottom: 20,
    width: 46,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#e3edff',
    borderRadius: 20,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  option: {
    alignItems: 'center',
    borderTopColor: '#e3eaf6',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingVertical: 16,
  },
  optionCopy: { flex: 1 },
  optionDescription: { color: '#667080', fontSize: 13, marginTop: 3 },
  optionTitle: { color: '#101c2d', fontSize: 16, fontWeight: '800' },
  sheet: {
    backgroundColor: '#f9fbff',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingBottom: 34,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  overlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    elevation: 20,
    justifyContent: 'flex-end',
    zIndex: 1000,
  },
  title: {
    color: '#101c2d',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  url: {
    color: '#596b86',
    fontSize: 14,
    marginBottom: 18,
    marginTop: 9,
    textAlign: 'center',
  },
});
