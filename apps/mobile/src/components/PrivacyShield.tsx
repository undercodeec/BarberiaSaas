import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AppState, Image, StyleSheet, View } from 'react-native';

import { appTheme } from './BottomNavigation';
import { shouldProtectAppContent } from '../lib/privacy-state';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const navaLogo = require('../../assets/nava-logo.png') as number;

export function PrivacyShield() {
  const [protectedContent, setProtectedContent] = useState(() =>
    shouldProtectAppContent(AppState.currentState),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setProtectedContent(shouldProtectAppContent(state));
    });
    return () => subscription.remove();
  }, []);

  if (!protectedContent) return null;

  return (
    <View
      accessibilityLabel="Nava está protegida mientras permanece en segundo plano"
      accessibilityRole="summary"
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={styles.shield}
    >
      <Ionicons
        color={appTheme.colors.accentLight}
        name="shield-checkmark-outline"
        size={54}
      />
      <Image
        accessibilityLabel="Nava"
        resizeMode="contain"
        source={navaLogo}
        style={styles.logo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 114,
    width: 260,
  },
  shield: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    bottom: 0,
    gap: 18,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100_000,
  },
});
