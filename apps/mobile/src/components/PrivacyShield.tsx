import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { appTheme } from './BottomNavigation';
import { shouldProtectAppContent } from '../lib/privacy-state';

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
      <Text style={styles.brand}>Nava</Text>
      <Text style={styles.message}>Tu información está protegida</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  brand: {
    color: appTheme.colors.white,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1,
  },
  message: {
    color: appTheme.colors.whiteMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  shield: {
    alignItems: 'center',
    backgroundColor: '#101C2D',
    bottom: 0,
    gap: 12,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 100_000,
  },
});
