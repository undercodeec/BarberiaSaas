import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { appTheme } from './BottomNavigation';
import { generateLocalQrMatrix } from '../lib/qr-code';

const QUIET_ZONE = 4;

export function LocalQrCode({
  size,
  value,
}: {
  readonly size: number;
  readonly value: string;
}) {
  const matrix = useMemo(() => generateLocalQrMatrix(value), [value]);
  if (!matrix) {
    return (
      <View style={styles.unavailable}>
        <Text accessibilityRole="alert" style={styles.unavailableText}>
          El enlace es demasiado largo para mostrar un QR seguro. Puedes
          copiarlo y compartirlo directamente.
        </Text>
      </View>
    );
  }

  const dimension = matrix.length + QUIET_ZONE * 2;
  const path = matrix
    .flatMap((row, y) =>
      row.flatMap((dark, x) =>
        dark ? `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z` : [],
      ),
    )
    .join('');

  return (
    <Svg
      accessibilityLabel="Código QR del enlace de reservas"
      height={size}
      role="img"
      viewBox={`0 0 ${dimension} ${dimension}`}
      width={size}
    >
      <Rect fill="#FFFFFF" height={dimension} width={dimension} />
      <Path d={path} fill="#101C2D" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    backgroundColor: appTheme.colors.dangerSurface,
    borderRadius: 16,
    padding: 16,
  },
  unavailableText: {
    color: appTheme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
