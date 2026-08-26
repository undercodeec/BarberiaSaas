/* eslint-disable react-hooks/refs -- React Native Animated and PanResponder expose stable imperative values that are intentionally read by animated styles and gesture handlers. */
/* eslint-disable react-hooks/set-state-in-effect -- Effects coordinate persisted prompts, permissions, focus, and modal state with external APIs. */
import { styles } from './dashboard.styles';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { KeyboardAwareScrollView as ScrollView } from '../../components/KeyboardAwareScrollView';

import { useNativeLayoutMetrics } from '../../components/BottomNavigation';

import {
  WELCOME_SURVEY_OPTIONS,
  type WelcomeSurveyOption,
  type ExtraQuickActionId,
  EXTRA_QUICK_ACTIONS,
  type DashboardProgressProps,
  type DashboardOperation,
} from './dashboard-model';

export const PRIMARY_WAVE_PATH =
  'M0 10 Q25 0 50 10 T100 10 T150 10 T200 10 V20 H0 Z';
export const SECONDARY_WAVE_PATH =
  'M0 10 Q25 20 50 10 T100 10 T150 10 T200 10 V20 H0 Z';

export function TankGradient() {
  return (
    <Svg
      height="100%"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      width="100%"
    >
      <Defs>
        <SvgLinearGradient id="dashboard-tank-fill" x1="0" x2="0" y1="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.72" stopColor="#FAF9F6" />
          <Stop offset="1" stopColor="#F8F0DD" />
        </SvgLinearGradient>
      </Defs>
      <Rect height="100" width="100" fill="url(#dashboard-tank-fill)" />
    </Svg>
  );
}
export function LiquidGradient() {
  return (
    <Svg
      height="100%"
      preserveAspectRatio="none"
      style={StyleSheet.absoluteFill}
      viewBox="0 0 100 100"
      width="100%"
    >
      <Defs>
        <SvgLinearGradient
          id="dashboard-liquid-fill"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <Stop offset="0" stopColor="#EBD8AA" />
          <Stop offset="0.42" stopColor="#EBD8AA" />
          <Stop offset="0.72" stopColor="#E1C47E" />
          <Stop offset="1" stopColor="#E1B85B" stopOpacity={0.84} />
        </SvgLinearGradient>
      </Defs>
      <Rect height="100" width="100" fill="url(#dashboard-liquid-fill)" />
    </Svg>
  );
}

export function LiquidWaveSurface({
  copy,
  secondary = false,
}: {
  readonly copy: 1 | 2;
  readonly secondary?: boolean;
}) {
  const path = secondary ? SECONDARY_WAVE_PATH : PRIMARY_WAVE_PATH;
  const fillId = `dashboard-${secondary ? 'secondary' : 'primary'}-wave-${copy}`;

  return (
    <Svg
      height="20"
      preserveAspectRatio="none"
      viewBox="0 0 200 20"
      width="100%"
    >
      <Defs>
        <SvgLinearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <Stop
            offset="0"
            stopColor={secondary ? '#C79532' : '#FAF9F6'}
            stopOpacity={secondary ? 0.72 : 1}
          />
          <Stop
            offset={secondary ? '0.52' : '0.5'}
            stopColor={secondary ? '#E1B85B' : '#F8F0DD'}
            stopOpacity={secondary ? 0.42 : 1}
          />
          <Stop
            offset="1"
            stopColor="#EBD8AA"
            stopOpacity={secondary ? 0 : 1}
          />
        </SvgLinearGradient>
      </Defs>
      <Path d={path} fill={`url(#${fillId})`} />
    </Svg>
  );
}

export function DashboardProgress({ caption, value }: DashboardProgressProps) {
  const normalizedValue = Math.min(100, Math.max(0, value));
  const [progress] = useState(() => new Animated.Value(0));
  const [firstWave] = useState(() => new Animated.Value(0));
  const [secondWave] = useState(() => new Animated.Value(0));
  const [displayValue, setDisplayValue] = useState(0);
  const [tankWidth, setTankWidth] = useState(0);
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((isEnabled) => {
      if (isMounted) setReduceMotion(isEnabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion,
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion === null) return;

    const listenerId = progress.addListener(({ value: animatedValue }) => {
      setDisplayValue(Math.round(animatedValue));
    });

    progress.stopAnimation();
    progress.setValue(0);

    const animation = Animated.timing(progress, {
      duration: reduceMotion ? 0 : 780,
      easing: Easing.out(Easing.cubic),
      toValue: normalizedValue,
      useNativeDriver: false,
    });

    animation.start();
    return () => {
      animation.stop();
      progress.removeListener(listenerId);
    };
  }, [normalizedValue, progress, reduceMotion]);

  useEffect(() => {
    if (reduceMotion === null || tankWidth === 0) return;

    firstWave.stopAnimation();
    secondWave.stopAnimation();
    firstWave.setValue(0);
    secondWave.setValue(0);

    if (reduceMotion) return;

    let isActive = true;

    const startWaveCycle = (
      animatedValue: Animated.Value,
      duration: number,
    ) => {
      if (!isActive) return;

      animatedValue.setValue(0);
      Animated.timing(animatedValue, {
        duration,
        easing: Easing.linear,
        isInteraction: false,
        toValue: 1,
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished) startWaveCycle(animatedValue, duration);
      });
    };

    startWaveCycle(firstWave, 4_000);
    startWaveCycle(secondWave, 6_000);

    return () => {
      isActive = false;
      firstWave.stopAnimation();
      secondWave.stopAnimation();
    };
  }, [firstWave, reduceMotion, secondWave, tankWidth]);

  const fillHeight = progress.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });
  const firstWaveTranslateX = firstWave.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -tankWidth],
  });
  const secondWaveTranslateX = secondWave.interpolate({
    inputRange: [0, 1],
    outputRange: [-tankWidth, 0],
  });

  return (
    <View
      accessibilityLabel={`${normalizedValue}% ${caption}`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: normalizedValue }}
      onLayout={(event) => setTankWidth(event.nativeEvent.layout.width)}
      pointerEvents="none"
      style={dashboardProgressStyles.tank}
    >
      <TankGradient />
      <View style={dashboardProgressStyles.ambientGlow} />

      <Animated.View
        style={[dashboardProgressStyles.liquid, { height: fillHeight }]}
      >
        <LiquidGradient />

        <Animated.View
          style={[
            dashboardProgressStyles.waveTrack,
            dashboardProgressStyles.primaryWave,
            {
              transform: [{ translateX: firstWaveTranslateX }],
              width: tankWidth * 2,
            },
          ]}
        >
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={1} />
          </View>
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={2} />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            dashboardProgressStyles.waveTrack,
            dashboardProgressStyles.secondaryWave,
            {
              transform: [{ translateX: secondWaveTranslateX }],
              width: tankWidth * 2,
            },
          ]}
        >
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={1} secondary />
          </View>
          <View style={{ width: tankWidth }}>
            <LiquidWaveSurface copy={2} secondary />
          </View>
        </Animated.View>
      </Animated.View>

      <View style={dashboardProgressStyles.label}>
        <Text style={dashboardProgressStyles.percentage}>{displayValue}%</Text>
        <Text style={dashboardProgressStyles.caption}>{caption}</Text>
      </View>
    </View>
  );
}

export const dashboardProgressStyles = StyleSheet.create({
  ambientGlow: {
    backgroundColor: 'rgba(225, 184, 91, 0.1)',
    borderRadius: 180,
    bottom: '-32%',
    height: '68%',
    left: '12%',
    position: 'absolute',
    right: '-14%',
  },
  caption: {
    color: '#555555',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  label: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    borderRadius: 20,
    bottom: 18,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    paddingHorizontal: 11,
    paddingVertical: 7,
    position: 'absolute',
    right: 18,
    shadowColor: '#B47D17',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    zIndex: 5,
  },
  liquid: {
    backgroundColor: '#EBD8AA',
    bottom: 0,
    left: 0,
    overflow: 'visible',
    position: 'absolute',
    right: 0,
  },
  percentage: {
    color: '#956816',
    fontSize: 20,
    fontVariant: ['tabular-nums'],
    fontWeight: '900',
  },
  primaryWave: {
    opacity: 0.9,
    top: -18,
    zIndex: 3,
  },
  secondaryWave: {
    opacity: 0.68,
    top: -14,
    zIndex: 2,
  },
  tank: {
    backgroundColor: '#FFFFFF',
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 0,
  },
  waveTrack: {
    flexDirection: 'row',
    height: 20,
    left: 0,
    position: 'absolute',
  },
});

export function QuickAction({
  icon,
  label,
  locked = false,
  lockedPlan = 'Nava Local',
  onPress,
}: {
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
  readonly locked?: boolean;
  readonly lockedPlan?: 'Nava Esencial' | 'Nava Local';
  readonly onPress: () => void;
}) {
  const shimmerTranslateX = useRef(new Animated.Value(-82)).current;

  useEffect(() => {
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerTranslateX, {
          duration: 860,
          easing: Easing.out(Easing.cubic),
          toValue: 82,
          useNativeDriver: true,
        }),
        Animated.delay(1650),
        Animated.timing(shimmerTranslateX, {
          duration: 0,
          toValue: -82,
          useNativeDriver: true,
        }),
      ]),
    );

    shimmerAnimation.start();
    return () => shimmerAnimation.stop();
  }, [shimmerTranslateX]);

  return (
    <Pressable
      accessibilityHint={locked ? `Disponible con ${lockedPlan}.` : undefined}
      accessibilityRole="button"
      accessibilityState={{ disabled: locked }}
      onPress={onPress}
      style={[styles.quickAction, locked && { opacity: 0.46 }]}
    >
      <View style={styles.quickIcon}>
        <Ionicons color="#B47D17" name={icon} size={30} />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.quickIconShimmer,
            {
              transform: [
                { translateX: shimmerTranslateX },
                { rotate: '22deg' },
              ],
            },
          ]}
        />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

export function DashboardOperationCard({
  operation,
  onPress,
}: {
  readonly operation: DashboardOperation;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityHint={`Abre ${operation.actionLabel.toLocaleLowerCase('es-EC')}`}
      accessibilityLabel={operation.title}
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.operationCard,
        operation.id === 'inventory' && styles.operationCardAlert,
      ]}
    >
      <View
        style={[
          styles.operationIcon,
          operation.id === 'inventory' && styles.operationIconAlert,
        ]}
      >
        <Ionicons
          color={operation.id === 'inventory' ? '#A86612' : '#B47D17'}
          name={operation.icon}
          size={22}
        />
      </View>
      <View style={styles.operationCopy}>
        <Text numberOfLines={1} style={styles.operationTitle}>
          {operation.title}
        </Text>
        <Text numberOfLines={1} style={styles.operationDescription}>
          {operation.description}
        </Text>
        <View style={styles.operationActionRow}>
          <Text style={styles.operationAction}>{operation.actionLabel}</Text>
          <Ionicons color="#B47D17" name="arrow-forward" size={15} />
        </View>
      </View>
    </Pressable>
  );
}

export function ExtraQuickActionsSheet({
  isSolo,
  selectedIds,
  onClose,
  onSelect,
  visible,
}: {
  readonly isSolo: boolean;
  readonly selectedIds: readonly ExtraQuickActionId[];
  readonly onClose: () => void;
  readonly onSelect: (id: ExtraQuickActionId) => void;
  readonly visible: boolean;
}) {
  const layout = useNativeLayoutMetrics(0.72);
  const availableActions = EXTRA_QUICK_ACTIONS.filter(
    (action) =>
      !selectedIds.includes(action.id) &&
      (!isSolo || action.id !== 'collaborators'),
  );

  return (
    <Modal
      animationType="fade"
      navigationBarTranslucent
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <View style={styles.quickActionsPickerOverlay}>
        <Pressable
          accessibilityLabel="Cerrar accesos rápidos"
          accessibilityRole="button"
          onPress={onClose}
          style={styles.quickActionsPickerBackdrop}
        />
        <View
          accessibilityViewIsModal
          style={[
            styles.quickActionsPicker,
            {
              maxHeight: layout.sheetMaxHeight,
              paddingBottom: layout.bottomInset + 8,
            },
          ]}
        >
          <View style={styles.quickActionsPickerHandle} />
          <Text
            accessibilityRole="header"
            style={styles.quickActionsPickerTitle}
          >
            Agrega un acceso rápido
          </Text>
          <Text style={styles.quickActionsPickerCopy}>
            Elige una herramienta para tenerla siempre a la vista.
          </Text>
          <ScrollView
            contentContainerStyle={styles.quickActionsPickerList}
            showsVerticalScrollIndicator={false}
          >
            {availableActions.map((action) => (
              <Pressable
                accessibilityRole="button"
                key={action.id}
                onPress={() => onSelect(action.id)}
                style={styles.quickActionsPickerOption}
              >
                <View style={styles.quickActionsPickerIcon}>
                  <Ionicons color="#B47D17" name={action.icon} size={21} />
                </View>
                <Text style={styles.quickActionsPickerLabel}>
                  {action.label}
                </Text>
                <Ionicons color="#69717d" name="add" size={23} />
              </Pressable>
            ))}
            {!availableActions.length ? (
              <Text style={styles.quickActionsPickerEmpty}>
                Ya agregaste todos los accesos disponibles.
              </Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function OpenButtonFlare() {
  const flareProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Traslación, opacidad y escala se ejecutan en el driver nativo de Android.
    const flareAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(flareProgress, {
          duration: 2_200,
          easing: Easing.inOut(Easing.sin),
          isInteraction: false,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(flareProgress, {
          duration: 2_200,
          easing: Easing.inOut(Easing.sin),
          isInteraction: false,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );

    flareAnimation.start();
    return () => flareAnimation.stop();
  }, [flareProgress]);

  const translateX = flareProgress.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, 1],
    outputRange: [-32, 32],
  });
  const opacity = flareProgress.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, 0.32, 0.5, 0.68, 1],
    outputRange: [0.5, 0.68, 1, 0.68, 0.5],
  });
  const auraOpacity = flareProgress.interpolate({
    extrapolate: 'clamp',
    inputRange: [0, 0.32, 0.5, 0.68, 1],
    outputRange: [0.04, 0.12, 0.48, 0.12, 0.04],
  });

  return (
    <View pointerEvents="none" style={styles.openButtonFlareTrack}>
      <Animated.View
        style={[styles.openButtonFlare, { transform: [{ translateX }] }]}
      >
        <Animated.View
          style={[styles.openButtonFlareAura, { opacity: auraOpacity }]}
        >
          <Svg height={31} viewBox="0 0 31 31" width={31}>
            <Path
              d="M15.5 0L18.1 12.9L31 15.5L18.1 18.1L15.5 31L12.9 18.1L0 15.5L12.9 12.9L15.5 0Z"
              fill="#FFF0B5"
            />
          </Svg>
        </Animated.View>
        <Animated.View style={{ opacity }}>
          <Svg height={17} viewBox="0 0 17 17" width={17}>
            <Path
              d="M8.5 0L10.6 6.4L17 8.5L10.6 10.6L8.5 17L6.4 10.6L0 8.5L6.4 6.4L8.5 0Z"
              fill="#FFFDF2"
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export function NotificationPermissionSheet({
  canAskAgain,
  onAccept,
  onClose,
  visible,
}: {
  readonly canAskAgain: boolean;
  readonly onAccept: () => void;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(48)).current;

  useEffect(() => {
    if (!visible) return;

    backdropOpacity.setValue(0);
    sheetTranslateY.setValue(48);

    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 260,
        easing: Easing.out(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, sheetTranslateY, visible]);

  const dismissWithAnimation = () => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        duration: 160,
        easing: Easing.in(Easing.cubic),
        toValue: 0,
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        duration: 180,
        easing: Easing.in(Easing.cubic),
        toValue: 520,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onClose();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sheetTranslateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          dismissWithAnimation();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  if (!visible) return null;

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={dismissWithAnimation}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.permissionOverlay}>
        <Animated.View
          pointerEvents="none"
          style={[styles.permissionBackdrop, { opacity: backdropOpacity }]}
        />
        <Pressable
          accessibilityLabel="Cerrar notificaciones"
          accessibilityRole="button"
          onPress={dismissWithAnimation}
          style={styles.permissionBackdrop}
        />
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.permissionSheet,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={styles.permissionHandle} />
          <Text accessibilityRole="header" style={styles.permissionTitle}>
            Activar notificaciones
          </Text>
          <Text style={styles.permissionDescription}>
            {canAskAgain
              ? 'Activa el permiso para recibir notificaciones importantes de tus reservas y novedades sobre tu negocio.'
              : 'Las notificaciones están desactivadas para Nava. Ábrelas en Ajustes para recibir avisos importantes de tus reservas y novedades.'}
          </Text>
          <View style={styles.permissionActions}>
            <Pressable
              accessibilityLabel={
                'Ahora no, activar notificaciones m\u00e1s tarde'
              }
              accessibilityRole="button"
              onPress={dismissWithAnimation}
              style={styles.permissionSecondaryButton}
            >
              <Text style={styles.permissionSecondaryLabel}>Ahora no</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onAccept}
              style={styles.permissionPrimaryButton}
            >
              <Text style={styles.permissionPrimaryLabel}>
                {canAskAgain ? 'Aceptar' : 'Abrir ajustes'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function WelcomeSurveySheet({
  onComplete,
  onDismiss,
  onSubmit,
  visible,
}: {
  readonly onComplete: () => void;
  readonly onDismiss: () => void;
  readonly onSubmit: (
    selectedOptions: readonly WelcomeSurveyOption[],
  ) => Promise<void>;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [selectedOptions, setSelectedOptions] = useState<WelcomeSurveyOption[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const dismissWithAnimation = () => {
    Animated.timing(sheetTranslateY, {
      duration: 180,
      easing: Easing.in(Easing.cubic),
      toValue: 520,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sheetTranslateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          dismissWithAnimation();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  if (!visible) return null;

  const toggleOption = (option: WelcomeSurveyOption) => {
    setError(null);
    setSelectedOptions((current) =>
      current.includes(option)
        ? current.filter((currentOption) => currentOption !== option)
        : [...current, option],
    );
  };

  const submit = async () => {
    if (selectedOptions.length === 0) {
      setError('Selecciona al menos una opci\u00f3n');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(selectedOptions);
      setIsSubmitted(true);
      closeTimer.current = setTimeout(onComplete, 900);
    } catch {
      setError('No pudimos guardar tu respuesta. Int\u00e9ntalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={dismissWithAnimation}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.welcomeSurveyOverlay}>
        <Pressable
          accessibilityLabel="Cerrar encuesta"
          accessibilityRole="button"
          onPress={dismissWithAnimation}
          style={styles.welcomeSurveyBackdrop}
        />
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.welcomeSurveySheet,
            {
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={styles.welcomeSurveyHandle} />
          <View style={styles.welcomeSurveyHeading}>
            <View style={styles.welcomeSurveyHand}>
              <Ionicons color="#101c2d" name="hand-left-outline" size={24} />
            </View>
            <Text accessibilityRole="header" style={styles.welcomeSurveyTitle}>
              Bienvenidos
            </Text>
          </View>
          <Text style={styles.welcomeSurveyIntro}>
            {
              '\u00bfPodr\u00edas dedicar 5 segundos a responder esta \u00fanica pregunta?'
            }
          </Text>
          <Text style={styles.welcomeSurveyQuestion}>
            {'Por favor, dinos: \u00bfd\u00f3nde conociste nuestro servicio?'}
          </Text>

          <View style={styles.welcomeSurveyOptions}>
            {WELCOME_SURVEY_OPTIONS.map((option) => {
              const isSelected = selectedOptions.includes(option);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  disabled={isSubmitted}
                  key={option}
                  onPress={() => toggleOption(option)}
                  style={[
                    styles.welcomeSurveyOption,
                    isSelected && styles.welcomeSurveyOptionSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.welcomeSurveyCheckbox,
                      isSelected && styles.welcomeSurveyCheckboxSelected,
                    ]}
                  >
                    {isSelected ? (
                      <Ionicons color="#ffffff" name="checkmark" size={17} />
                    ) : null}
                  </View>
                  <Text style={styles.welcomeSurveyOptionLabel}>{option}</Text>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <Text style={styles.welcomeSurveyError}>{error}</Text>
          ) : null}
          {isSubmitted ? (
            <Text
              accessibilityLiveRegion="polite"
              style={styles.welcomeSurveySuccess}
            >
              Respuesta guardada
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || isSubmitted}
            onPress={() => void submit()}
            style={[
              styles.welcomeSurveySubmit,
              (isSubmitting || isSubmitted) &&
                styles.welcomeSurveySubmitDisabled,
            ]}
          >
            <Text style={styles.welcomeSurveySubmitLabel}>
              Guardar respuesta
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

export function LegacyLocationBannerSheet({
  initialAddress,
  onComplete,
  onDismiss,
  onSubmit,
  visible,
}: {
  readonly initialAddress: string;
  readonly onComplete: () => void;
  readonly onDismiss: () => void;
  readonly onSubmit: (address: string) => Promise<void>;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState(initialAddress);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [markerPosition, setMarkerPosition] = useState({ left: 146, top: 54 });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    setAddress(initialAddress);
    setError(null);
    setIsSubmitted(false);
    sheetTranslateY.setValue(0);
  }, [initialAddress, sheetTranslateY, visible]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const dismissWithAnimation = () => {
    Animated.timing(sheetTranslateY, {
      duration: 180,
      easing: Easing.in(Easing.cubic),
      toValue: 520,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) sheetTranslateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.75) {
          dismissWithAnimation();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const submit = async () => {
    if (!address.trim()) {
      setError('Ingresa la direcci\u00f3n de tu negocio');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(address.trim());
      setIsSubmitted(true);
      closeTimer.current = setTimeout(onComplete, 900);
    } catch {
      setError(
        'No pudimos guardar la ubicaci\u00f3n. Int\u00e9ntalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      animationType="slide"
      navigationBarTranslucent
      onRequestClose={dismissWithAnimation}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.locationOverlay}>
        <Pressable
          accessibilityLabel="Cerrar ubicaci\u00f3n"
          accessibilityRole="button"
          onPress={dismissWithAnimation}
          style={styles.locationBackdrop}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          pointerEvents="box-none"
          style={styles.locationKeyboardArea}
        >
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.locationSheet,
              {
                paddingBottom: Math.max(insets.bottom, 12),
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}
          >
            <View style={styles.locationHandle} />
            <Text accessibilityRole="header" style={styles.locationTitle}>
              {'Ubicaci\u00f3n del negocio'}
            </Text>
            <Text style={styles.locationDescription}>
              {
                'Una direcci\u00f3n precisa ayuda a que m\u00e1s clientes encuentren tu negocio y reserven contigo.'
              }
            </Text>

            <View style={styles.locationInputWrap}>
              <Text style={styles.locationInputLabel}>{'Direcci\u00f3n'}</Text>
              <Ionicons color="#555a63" name="location-outline" size={21} />
              <TextInput
                accessibilityLabel="Direcci\u00f3n del negocio"
                editable={!isSubmitted}
                onChangeText={(value) => {
                  setAddress(value);
                  setError(null);
                }}
                placeholder="Ej. Av. Naciones Unidas y Av. Shyris"
                placeholderTextColor="#8e939b"
                style={styles.locationInput}
                value={address}
              />
            </View>

            <Pressable
              accessibilityHint="Toca para ajustar el marcador"
              accessibilityLabel="Mapa de ubicaci\u00f3n"
              accessibilityRole="button"
              disabled={isSubmitted}
              onPress={({ nativeEvent }) =>
                setMarkerPosition({
                  left: Math.max(12, Math.min(nativeEvent.locationX - 15, 278)),
                  top: Math.max(12, Math.min(nativeEvent.locationY - 34, 94)),
                })
              }
              style={styles.locationMap}
            >
              <View style={[styles.locationRoad, styles.locationRoadOne]} />
              <View style={[styles.locationRoad, styles.locationRoadTwo]} />
              <View style={styles.locationBuildingOne} />
              <View style={styles.locationBuildingTwo} />
              <View style={styles.locationBuildingThree} />
              <View style={styles.locationBuildingFour} />
              <View
                style={[
                  styles.locationMarker,
                  { left: markerPosition.left, top: markerPosition.top },
                ]}
              >
                <Ionicons color="#ffffff" name="location" size={19} />
              </View>
            </Pressable>
            <Text style={styles.locationMapHint}>
              Toca el mapa para ajustar el marcador
            </Text>

            {error ? <Text style={styles.locationError}>{error}</Text> : null}
            {isSubmitted ? (
              <Text
                accessibilityLiveRegion="polite"
                style={styles.locationSuccess}
              >
                {'Ubicaci\u00f3n guardada'}
              </Text>
            ) : null}
            <View style={styles.locationActions}>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting || isSubmitted}
                onPress={dismissWithAnimation}
                style={styles.locationSecondaryButton}
              >
                <Text style={styles.locationSecondaryLabel}>Ahora no</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSubmitting || isSubmitted}
                onPress={() => void submit()}
                style={[
                  styles.locationPrimaryButton,
                  (isSubmitting || isSubmitted) &&
                    styles.locationButtonDisabled,
                ]}
              >
                <Text style={styles.locationPrimaryLabel}>
                  {'Guardar ubicaci\u00f3n'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
