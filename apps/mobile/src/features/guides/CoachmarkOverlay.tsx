import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { appTheme, goldButtonShadow } from '../../components/BottomNavigation';

import type { GuideAnchorRect, GuideDefinition } from './guide-types';

const CUTOUT_PADDING = 8;
const BUBBLE_GAP = 18;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

export function CoachmarkOverlay({
  definition,
  onDismiss,
  rect,
}: {
  readonly definition: GuideDefinition;
  readonly onDismiss: () => void;
  readonly rect: GuideAnchorRect;
}) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const left = clamp(rect.x - CUTOUT_PADDING, 0, windowWidth);
  const top = clamp(rect.y - CUTOUT_PADDING, 0, windowHeight);
  const right = clamp(rect.x + rect.width + CUTOUT_PADDING, left, windowWidth);
  const bottom = clamp(
    rect.y + rect.height + CUTOUT_PADDING,
    top,
    windowHeight,
  );
  const bubbleTop =
    bottom + 170 < windowHeight ? bottom + BUBBLE_GAP : Math.max(16, top - 170);

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.overlay]}
    >
      <Pressable
        accessible={false}
        accessibilityLabel="Área fuera de la guía"
        onPress={() => undefined}
        style={[styles.scrim, { height: top, left: 0, right: 0, top: 0 }]}
      />
      <Pressable
        accessible={false}
        accessibilityLabel="Área fuera de la guía"
        onPress={() => undefined}
        style={[styles.scrim, { bottom: 0, left: 0, right: 0, top: bottom }]}
      />
      <Pressable
        accessible={false}
        accessibilityLabel="Área fuera de la guía"
        onPress={() => undefined}
        style={[
          styles.scrim,
          { height: bottom - top, left: 0, top, width: left },
        ]}
      />
      <Pressable
        accessible={false}
        accessibilityLabel="Área fuera de la guía"
        onPress={() => undefined}
        style={[
          styles.scrim,
          { height: bottom - top, left: right, right: 0, top },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.targetOutline,
          {
            height: bottom - top,
            left,
            top,
            width: right - left,
          },
        ]}
      />
      <View
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          styles.bubble,
          {
            left: clamp(left, 16, Math.max(16, windowWidth - 336)),
            top: bubbleTop,
          },
        ]}
      >
        <Text style={styles.eyebrow}>GUÍA RÁPIDA</Text>
        <Text style={styles.title}>{definition.title}</Text>
        <Text style={styles.body}>{definition.body}</Text>
        <Text style={styles.hint}>
          Toca el elemento resaltado para continuar.
        </Text>
        <Pressable
          accessibilityLabel="Saltar guía"
          accessibilityRole="button"
          onPress={onDismiss}
          style={styles.dismiss}
        >
          <Text style={styles.dismissLabel}>Saltar guía</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    color: appTheme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  bubble: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: 22,
    elevation: 12,
    maxWidth: 320,
    padding: 18,
    position: 'absolute',
    shadowColor: '#101C2D',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    width: '88%',
    ...goldButtonShadow,
  },
  dismiss: {
    alignSelf: 'flex-start',
    marginTop: 14,
    minHeight: 44,
    paddingVertical: 10,
  },
  dismissLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 14,
    fontWeight: '900',
  },
  eyebrow: {
    color: appTheme.colors.accentDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  hint: {
    color: appTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 12,
  },
  overlay: { elevation: 50, zIndex: 2_000 },
  scrim: {
    backgroundColor: 'rgba(16, 28, 45, 0.62)',
    position: 'absolute',
  },
  targetOutline: {
    borderColor: appTheme.colors.accentLight,
    borderRadius: 18,
    borderWidth: 3,
    position: 'absolute',
  },
  title: {
    color: appTheme.colors.text,
    fontSize: 19,
    fontWeight: '900',
    marginTop: 5,
  },
});
