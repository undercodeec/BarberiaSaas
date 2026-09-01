import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';

import { appTheme, goldButtonShadow } from '../../components/BottomNavigation';

import { coachmarkLayout } from './coachmark-layout';
import type { GuideAnchorRect, GuideDefinition } from './guide-types';

const CUTOUT_PADDING = 8;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(value, maximum));
}

export function CoachmarkOverlay({
  definition,
  onDismiss,
  onNext,
  onPrevious,
  rect,
  step,
  totalSteps,
}: {
  readonly definition: GuideDefinition;
  readonly onDismiss: () => void;
  readonly onNext: (() => void) | undefined;
  readonly onPrevious: (() => void) | undefined;
  readonly rect: GuideAnchorRect;
  readonly step: number | null;
  readonly totalSteps: number | null;
}) {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const left = clamp(rect.x - CUTOUT_PADDING, 0, windowWidth);
  const top = clamp(rect.y - CUTOUT_PADDING, 0, windowHeight);
  const right = clamp(rect.x + rect.width + CUTOUT_PADDING, left, windowWidth);
  const bottom = clamp(
    rect.y + rect.height + CUTOUT_PADDING,
    top,
    windowHeight,
  );
  const bubbleLayout = coachmarkLayout({
    insets,
    rect,
    window: { height: windowHeight, width: windowWidth },
  });
  const bubbleWidth = Math.min(320, Math.max(0, windowWidth - 32));

  if (rect.y >= windowHeight || rect.y + rect.height <= 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[StyleSheet.absoluteFill, styles.overlay]}
    >
      <Pressable
        accessible={false}
        accessibilityLabel="Area fuera de la guia"
        onPress={() => undefined}
        style={[styles.scrim, { height: top, left: 0, right: 0, top: 0 }]}
      />
      <Svg
        height={windowHeight}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width={windowWidth}
      >
        <Defs>
          <Mask id="coachmark-rounded-cutout">
            <Rect fill="#FFFFFF" height={windowHeight} width={windowWidth} />
            <Rect
              fill="#000000"
              height={bottom - top}
              rx={18}
              ry={18}
              width={right - left}
              x={left}
              y={top}
            />
          </Mask>
        </Defs>
        <Rect
          fill="rgba(16, 28, 45, 0.62)"
          height={windowHeight}
          mask="url(#coachmark-rounded-cutout)"
          width={windowWidth}
        />
      </Svg>
      <Pressable
        accessible={false}
        accessibilityLabel="Area fuera de la guia"
        onPress={() => undefined}
        style={[styles.scrim, { bottom: 0, left: 0, right: 0, top: bottom }]}
      />
      <Pressable
        accessible={false}
        accessibilityLabel="Area fuera de la guia"
        onPress={() => undefined}
        style={[
          styles.scrim,
          { height: bottom - top, left: 0, top, width: left },
        ]}
      />
      <Pressable
        accessible={false}
        accessibilityLabel="Area fuera de la guia"
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
      <ScrollView
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        bounces={false}
        contentContainerStyle={styles.bubbleContent}
        showsVerticalScrollIndicator={false}
        style={[
          styles.bubble,
          {
            left: clamp(left, 16, Math.max(16, windowWidth - bubbleWidth - 16)),
            maxHeight: bubbleLayout.maxHeight,
            top: bubbleLayout.top,
            width: bubbleWidth,
          },
        ]}
      >
        <Text style={styles.eyebrow}>
          {step && totalSteps
            ? `GUIA RAPIDA - ${step}/${totalSteps}`
            : 'GUIA RAPIDA'}
        </Text>
        <Text style={styles.title}>{definition.title}</Text>
        <Text style={styles.body}>{definition.body}</Text>
        <Text style={styles.hint}>
          Tambien puedes usar el control resaltado.
        </Text>
        <View style={styles.actions}>
          {onPrevious ? (
            <Pressable
              accessibilityLabel="Paso anterior"
              accessibilityRole="button"
              onPress={onPrevious}
              style={styles.previous}
            >
              <Text style={styles.previousLabel}>Anterior</Text>
            </Pressable>
          ) : null}
          {onNext ? (
            <Pressable
              accessibilityLabel="Siguiente paso"
              accessibilityRole="button"
              onPress={onNext}
              style={styles.next}
            >
              <Text style={styles.nextLabel}>Siguiente</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Saltar guia"
            accessibilityRole="button"
            onPress={onDismiss}
            style={styles.dismiss}
          >
            <Text style={styles.dismissLabel}>Saltar</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
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
    position: 'absolute',
    shadowColor: '#101C2D',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    ...goldButtonShadow,
  },
  bubbleContent: { padding: 18 },
  dismiss: { minHeight: 44, paddingHorizontal: 4, paddingVertical: 10 },
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
  next: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.accent,
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  nextLabel: { color: appTheme.colors.white, fontSize: 14, fontWeight: '900' },
  overlay: { elevation: 50, zIndex: 2_000 },
  previous: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  previousLabel: {
    color: appTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  scrim: {
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
