import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Component,
  Fragment,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { appStyles, appTheme, goldButtonShadow } from './BottomNavigation';
import { reportMobileRenderError } from '../lib/error-reporting';

interface MobileErrorBoundaryProps extends PropsWithChildren {
  readonly scope: string;
}

interface MobileErrorBoundaryState {
  readonly failed: boolean;
  readonly resetKey: number;
}

export class MobileErrorBoundary extends Component<
  MobileErrorBoundaryProps,
  MobileErrorBoundaryState
> {
  public override state: MobileErrorBoundaryState = {
    failed: false,
    resetKey: 0,
  };

  public static getDerivedStateFromError(): Partial<MobileErrorBoundaryState> {
    return { failed: true };
  }

  public override componentDidCatch(error: Error): void {
    reportMobileRenderError(error, this.props.scope);
  }

  private readonly reset = () => {
    this.setState(({ resetKey }) => ({
      failed: false,
      resetKey: resetKey + 1,
    }));
  };

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <View accessibilityRole="alert" style={styles.fallback}>
          <Ionicons
            color={appTheme.colors.accentDark}
            name="warning-outline"
            size={48}
          />
          <Text accessibilityRole="header" style={styles.title}>
            Algo no salió bien
          </Text>
          <Text style={styles.message}>
            Protegimos la pantalla para evitar mostrar datos incompletos. Puedes
            volver a intentarlo.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={this.reset}
            style={styles.button}
          >
            <Text style={styles.buttonLabel}>Reintentar</Text>
          </Pressable>
        </View>
      );
    }
    return <Fragment key={this.state.resetKey}>{this.props.children}</Fragment>;
  }
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 18,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 28,
    paddingVertical: 14,
    ...goldButtonShadow,
  },
  buttonLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 16,
    fontWeight: '800',
  },
  fallback: {
    alignItems: 'center',
    ...appStyles.screen,
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  message: {
    color: appTheme.colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
    maxWidth: 360,
    textAlign: 'center',
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 16,
    textAlign: 'center',
  },
});
