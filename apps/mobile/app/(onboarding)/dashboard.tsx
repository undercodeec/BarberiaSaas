import Ionicons from '@expo/vector-icons/Ionicons';
import type { OnboardingAccountDetailsResponse } from '@barber-saas/api-client';
import { useQuery } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useRef, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { DashboardProgress } from '../../src/components/DashboardProgress';
import { BottomNavigation } from '../../src/components/BottomNavigation';
import { requireApiClient } from '../../src/lib/api';
import { BookingLinkSheet } from '../../src/components/BookingLinkSheet';
import { useAuth } from '../../src/providers/AuthProvider';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const communityImage = require('../../assets/Felicidadez.png') as number;
const MONTH_PROGRESS = 84;
const WELCOME_SURVEY_RESPONSE_KEY = 'barber-saas.welcome-survey-response';
const LOCATION_BANNER_KEY = 'barber-saas.location-banner';
let notificationPromptSessionKey: string | null = null;
const WELCOME_SURVEY_OPTIONS = [
  'Publicidad',
  'Redes sociales de Nava (Facebook o Instagram)',
  'Buscador',
  'Recomendaci\u00f3n de una comunidad, academia, clase u otro negocio',
  'Evento o feria',
] as const;

type WelcomeSurveyOption = (typeof WELCOME_SURVEY_OPTIONS)[number];

function welcomeSurveyStorageKey(userId: string) {
  return `${WELCOME_SURVEY_RESPONSE_KEY}.${userId}`;
}

async function getWelcomeSurveyResponse(
  userId: string,
): Promise<string | null> {
  const key = welcomeSurveyStorageKey(userId);
  if (Platform.OS === 'web') return globalThis.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function storeWelcomeSurveyResponse(
  userId: string,
  selectedOptions: readonly WelcomeSurveyOption[],
) {
  const key = welcomeSurveyStorageKey(userId);
  const value = JSON.stringify({
    selectedOptions,
    submittedAt: new Date().toISOString(),
  });

  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function markWelcomeSurveyDismissed(userId: string) {
  const key = welcomeSurveyStorageKey(userId);
  const value = JSON.stringify({ dismissedAt: new Date().toISOString() });

  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

function locationBannerStorageKey(userId: string) {
  return `${LOCATION_BANNER_KEY}.${userId}`;
}

async function getLocationBannerStatus(userId: string): Promise<string | null> {
  const key = locationBannerStorageKey(userId);
  if (Platform.OS === 'web') return globalThis.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

async function markLocationBannerHandled(userId: string) {
  const key = locationBannerStorageKey(userId);
  const value = new Date().toISOString();
  if (Platform.OS === 'web') {
    globalThis.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return '\u00a1Buenos d\u00edas! Bienvenido';
  if (hour < 19) return '\u00a1Buenas tardes! Bienvenido';
  return '\u00a1Buenas noches! Bienvenido';
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  readonly icon: React.ComponentProps<typeof Ionicons>['name'];
  readonly label: string;
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
      accessibilityRole="button"
      onPress={onPress}
      style={styles.quickAction}
    >
      <View style={styles.quickIcon}>
        <Ionicons color="#101c2d" name={icon} size={27} />
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

function NotificationPermissionSheet({
  onAccept,
  onClose,
  visible,
}: {
  readonly onAccept: () => void;
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetTranslateY = useRef(new Animated.Value(48)).current;

  useEffect(() => {
    if (!visible) return;

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

  if (!visible) return null;

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.permissionOverlay}>
        <Animated.View
          pointerEvents="none"
          style={[styles.permissionBackdrop, { opacity: backdropOpacity }]}
        />
        <Animated.View
          style={[
            styles.permissionSheet,
            {
              paddingBottom: Math.max(insets.bottom, 20) + 16,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View style={styles.permissionHandle} />
          <Text accessibilityRole="header" style={styles.permissionTitle}>
            Activar notificaciones
          </Text>
          <Text style={styles.permissionDescription}>
            Activa el permiso para recibir notificaciones importantes de tus
            reservas y novedades sobre tu negocio.
          </Text>
          <View style={styles.permissionActions}>
            <Pressable
              accessibilityLabel={
                'Ahora no, activar notificaciones m\u00e1s tarde'
              }
              accessibilityRole="button"
              onPress={onClose}
              style={styles.permissionSecondaryButton}
            >
              <Text style={styles.permissionSecondaryLabel}>Ahora no</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onAccept}
              style={styles.permissionPrimaryButton}
            >
              <Text style={styles.permissionPrimaryLabel}>Aceptar</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function WelcomeSurveySheet({
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
              paddingBottom: Math.max(insets.bottom, 20) + 16,
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

function LocationBannerSheet({
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
        <Animated.View
          {...panResponder.panHandlers}
          style={[
            styles.locationSheet,
            {
              paddingBottom: Math.max(insets.bottom, 20) + 16,
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
                (isSubmitting || isSubmitted) && styles.locationButtonDisabled,
              ]}
            >
              <Text style={styles.locationPrimaryLabel}>
                {'Guardar ubicaci\u00f3n'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function DashboardScreen() {
  const { session, user } = useAuth();
  const router = useRouter();
  const currentNotificationSessionKey =
    session && user ? `${user.id}:${session.expiresAt}` : null;
  const accountQuery = useQuery({
    enabled: Boolean(session),
    queryFn: () =>
      requireApiClient().request<OnboardingAccountDetailsResponse>(
        '/v1/onboarding/account-details',
      ),
    queryKey: ['onboarding-account-details', user?.id],
  });

  const businessName = accountQuery.data?.businessName ?? 'Tu negocio';
  const [isBookingSheetOpen, setIsBookingSheetOpen] = useState(false);
  const [isNotificationSheetOpen, setIsNotificationSheetOpen] = useState(false);
  const [notificationFlowState, setNotificationFlowState] = useState<
    'checking' | 'visible' | 'completed'
  >('checking');
  const [needsWelcomeSurvey, setNeedsWelcomeSurvey] = useState<boolean | null>(
    null,
  );
  const [isWelcomeSurveyOpen, setIsWelcomeSurveyOpen] = useState(false);
  const [needsLocationBanner, setNeedsLocationBanner] = useState<
    boolean | null
  >(null);
  const [isLocationBannerOpen, setIsLocationBannerOpen] = useState(false);
  const bookingUrl = accountQuery.data?.bookingUrl ?? '';
  const unavailable = (title: string) =>
    Alert.alert(
      title,
      'Esta funcionalidad estar\u00e1 disponible pr\u00f3ximamente.',
    );

  useEffect(() => {
    let isMounted = true;
    setNotificationFlowState('checking');
    setIsNotificationSheetOpen(false);

    const checkNotificationPermission = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (isMounted) {
          const shouldRequestPermission =
            status !== Notifications.PermissionStatus.GRANTED &&
            currentNotificationSessionKey !== null &&
            notificationPromptSessionKey !== currentNotificationSessionKey;

          if (shouldRequestPermission) {
            notificationPromptSessionKey = currentNotificationSessionKey;
          }

          setIsNotificationSheetOpen(shouldRequestPermission);
          setNotificationFlowState(
            shouldRequestPermission ? 'visible' : 'completed',
          );
        }
      } catch {
        // Some development environments do not expose native notifications.
        if (isMounted) setNotificationFlowState('completed');
      }
    };

    if (session) void checkNotificationPermission();

    return () => {
      isMounted = false;
    };
  }, [currentNotificationSessionKey, session]);

  useEffect(() => {
    let isMounted = true;
    setNeedsWelcomeSurvey(null);
    setIsWelcomeSurveyOpen(false);

    const checkWelcomeSurvey = async () => {
      if (!user) return;
      try {
        const response = await getWelcomeSurveyResponse(user.id);
        if (isMounted) setNeedsWelcomeSurvey(response === null);
      } catch {
        if (isMounted) setNeedsWelcomeSurvey(true);
      }
    };

    if (session && user) void checkWelcomeSurvey();

    return () => {
      isMounted = false;
    };
  }, [session, user]);

  useEffect(() => {
    if (notificationFlowState === 'completed' && needsWelcomeSurvey) {
      setIsWelcomeSurveyOpen(true);
    }
  }, [needsWelcomeSurvey, notificationFlowState]);

  useEffect(() => {
    let isMounted = true;
    setNeedsLocationBanner(null);
    setIsLocationBannerOpen(false);

    const checkLocationBanner = async () => {
      if (!user) return;
      try {
        const status = await getLocationBannerStatus(user.id);
        if (isMounted) setNeedsLocationBanner(status === null);
      } catch {
        if (isMounted) setNeedsLocationBanner(true);
      }
    };

    if (session && user) void checkLocationBanner();

    return () => {
      isMounted = false;
    };
  }, [session, user]);

  useEffect(() => {
    if (
      notificationFlowState === 'completed' &&
      needsWelcomeSurvey === false &&
      !isWelcomeSurveyOpen &&
      needsLocationBanner
    ) {
      setIsLocationBannerOpen(true);
    }
  }, [
    isWelcomeSurveyOpen,
    needsLocationBanner,
    needsWelcomeSurvey,
    notificationFlowState,
  ]);

  const completeNotificationFlow = () => {
    setIsNotificationSheetOpen(false);
    setNotificationFlowState('completed');
  };

  const requestNotificationPermission = async () => {
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // The permission prompt is only shown once during each app session.
    } finally {
      completeNotificationFlow();
    }
  };

  const saveWelcomeSurveyResponse = async (
    selectedOptions: readonly WelcomeSurveyOption[],
  ) => {
    if (!user) return;
    await storeWelcomeSurveyResponse(user.id, selectedOptions);
    setNeedsWelcomeSurvey(false);
  };

  const dismissWelcomeSurvey = () => {
    setIsWelcomeSurveyOpen(false);
    setNeedsWelcomeSurvey(false);
    if (user) void markWelcomeSurveyDismissed(user.id);
  };

  const dismissLocationBanner = () => {
    setIsLocationBannerOpen(false);
    setNeedsLocationBanner(false);
    if (user) void markLocationBannerHandled(user.id);
  };

  const saveLocation = async (addressLine: string) => {
    const account = accountQuery.data;
    if (
      !user ||
      !account ||
      !account.businessName ||
      !account.city ||
      !account.countryCode ||
      !account.phone
    ) {
      throw new Error(
        'No encontramos la informaci\u00f3n necesaria del negocio.',
      );
    }

    await requireApiClient().request<OnboardingAccountDetailsResponse>(
      '/v1/onboarding/account-details',
      {
        body: {
          addressLine,
          businessName: account.businessName,
          city: account.city,
          countryCode: account.countryCode,
          coverImageUri: account.coverImageUri,
          description: account.description,
          facebookUrl: account.facebookUrl,
          instagramUrl: account.instagramUrl,
          phone: account.phone,
        },
        method: 'PATCH',
      },
    );
    await accountQuery.refetch();
    await markLocationBannerHandled(user.id);
    setNeedsLocationBanner(false);
  };

  if (!session) return <Redirect href="/(auth)/login" />;
  return (
    <SafeAreaView
      edges={['bottom', 'left', 'right', 'top']}
      style={styles.screen}
    >
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          <View>
            <Text style={styles.greeting}>{greeting()}</Text>
            <Text accessibilityRole="header" style={styles.businessName}>
              {businessName}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Notificaciones"
            accessibilityRole="button"
            onPress={() => unavailable('Notificaciones')}
            style={styles.notificationButton}
          >
            <Ionicons color="#101c2d" name="notifications-outline" size={29} />
          </Pressable>
        </View>

        <View style={styles.salesCard}>
          <View style={styles.salesHeader}>
            <Text style={styles.salesTitle}>
              {'Tus ventas \u00b7 Julio 2026'}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => unavailable('Resumen')}
              style={styles.summaryButton}
            >
              <Text style={styles.summaryLabel}>Resumen</Text>
              <Ionicons color="#101c2d" name="bar-chart-outline" size={22} />
            </Pressable>
          </View>
          <Text style={styles.salesValue}>$0</Text>
          <View style={styles.salesMeta}>
            <Text style={styles.salesMetaText}>{'D\u00eda 26 de 31'}</Text>
          </View>
          <DashboardProgress value={MONTH_PROGRESS} />
        </View>

        <View style={styles.quickActions}>
          <QuickAction
            icon="people-outline"
            label="Referidos"
            onPress={() => unavailable('Referidos')}
          />
          <QuickAction
            icon="flash-outline"
            label="Crece"
            onPress={() => unavailable('Crece')}
          />
          <QuickAction
            icon="sparkles-outline"
            label={'Suscripci\u00f3n'}
            onPress={() => unavailable('Suscripci\u00f3n')}
          />
          <QuickAction
            icon="grid-outline"
            label="Ver todas"
            onPress={() => unavailable('Funciones')}
          />
        </View>

        <View style={styles.welcome}>
          <Text style={styles.welcomeTitle}>{'\u00a1Bienvenido a Nava!'}</Text>
          <Text style={styles.welcomeCopy}>
            Descubre todo lo que podemos hacer juntos
          </Text>
        </View>

        <View style={styles.reservationCard}>
          <View style={styles.cardHeading}>
            <Text style={styles.cardTitle}>Recibe reservas</Text>
            <View style={styles.qrBadge}>
              <Ionicons color="#f4f4f5" name="qr-code-outline" size={29} />
            </View>
          </View>
          <Text style={styles.cardCopy}>
            Comparte el enlace de reservas de tu negocio en tus redes sociales y
            aumenta tus citas.
          </Text>
          <View style={styles.linkBox}>
            <View style={styles.linkCopy}>
              <Text style={styles.linkLabel}>Enlace de tu negocio</Text>
              <Text numberOfLines={2} style={styles.linkValue}>
                {bookingUrl || 'Preparando tu enlace de reservas'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsBookingSheetOpen(true)}
              style={styles.openButton}
            >
              <Text style={styles.openLabel}>Abrir</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.communityCard}>
          <View style={styles.communityCopy}>
            <Text style={styles.cardTitle}>
              {'\u00a1\u00danete a nuestra comunidad!'}
            </Text>
            <Text style={styles.cardCopy}>
              {
                'Consejos, novedades e inspiraci\u00f3n para hacer crecer tu negocio.'
              }
            </Text>
          </View>
          <Image
            accessibilityLabel="Comunidad Nava"
            resizeMode="contain"
            source={communityImage}
            style={styles.communityImage}
          />
        </View>
      </ScrollView>

      <BottomNavigation active="dashboard" />
      <BookingLinkSheet
        onClose={() => setIsBookingSheetOpen(false)}
        url={bookingUrl}
        visible={isBookingSheetOpen}
      />
      <NotificationPermissionSheet
        onAccept={() => void requestNotificationPermission()}
        onClose={completeNotificationFlow}
        visible={isNotificationSheetOpen}
      />
      <WelcomeSurveySheet
        key={`welcome-survey-${user?.id ?? 'anonymous'}`}
        onComplete={() => setIsWelcomeSurveyOpen(false)}
        onDismiss={dismissWelcomeSurvey}
        onSubmit={saveWelcomeSurveyResponse}
        visible={isWelcomeSurveyOpen}
      />
      <LocationBannerSheet
        initialAddress={accountQuery.data?.addressLine ?? ''}
        key={`location-banner-${user?.id ?? 'anonymous'}`}
        onComplete={() => setIsLocationBannerOpen(false)}
        onDismiss={dismissLocationBanner}
        onSubmit={saveLocation}
        visible={isLocationBannerOpen}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  businessName: {
    color: '#101c2d',
    fontSize: 33,
    fontWeight: '900',
    letterSpacing: -1.1,
    marginTop: 4,
  },
  cardCopy: { color: '#555a63', fontSize: 16, lineHeight: 23, marginTop: 12 },
  cardHeading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardTitle: {
    color: '#101c2d',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  communityCard: {
    backgroundColor: '#eeeff1',
    borderColor: '#d2d4d8',
    borderRadius: 30,
    borderWidth: 1,
    height: 236,
    marginTop: 20,
    overflow: 'hidden',
    padding: 24,
  },
  communityCopy: { maxWidth: '61%', zIndex: 1 },
  communityImage: {
    bottom: -72,
    height: 245,
    position: 'absolute',
    right: -30,
    width: 275,
  },
  content: { paddingBottom: 128, paddingHorizontal: 24, paddingTop: 20 },
  greeting: { color: '#555a63', fontSize: 20, lineHeight: 28 },
  linkBox: {
    alignItems: 'center',
    backgroundColor: '#dcdee1',
    borderRadius: 19,
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
    minHeight: 84,
    padding: 13,
  },
  linkCopy: { flex: 1 },
  linkLabel: { color: '#555a63', fontSize: 13, marginBottom: 6 },
  linkValue: {
    color: '#101c2d',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 21,
  },
  locationActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  locationBackdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  locationBuildingFour: {
    backgroundColor: '#cfd1d4',
    borderRadius: 5,
    bottom: 12,
    height: 29,
    position: 'absolute',
    right: 18,
    width: 51,
  },
  locationBuildingOne: {
    backgroundColor: '#d6d8dc',
    borderRadius: 5,
    height: 42,
    left: 23,
    position: 'absolute',
    top: 17,
    width: 62,
  },
  locationBuildingThree: {
    backgroundColor: '#c7cacf',
    borderRadius: 5,
    height: 44,
    left: 28,
    position: 'absolute',
    top: 87,
    width: 74,
  },
  locationBuildingTwo: {
    backgroundColor: '#c2c5ca',
    borderRadius: 5,
    height: 35,
    position: 'absolute',
    right: 27,
    top: 26,
    width: 76,
  },
  locationButtonDisabled: { opacity: 0.65 },
  locationDescription: {
    color: '#555a63',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 12,
  },
  locationError: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 13,
    textAlign: 'center',
  },
  locationHandle: {
    alignSelf: 'center',
    backgroundColor: '#a4a7ad',
    borderRadius: 4,
    height: 5,
    marginBottom: 22,
    width: 46,
  },
  locationInput: {
    color: '#101c2d',
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 10,
    paddingBottom: 8,
    paddingTop: 8,
  },
  locationInputLabel: {
    backgroundColor: '#f4f4f3',
    color: '#555a63',
    fontSize: 12,
    left: 13,
    paddingHorizontal: 4,
    position: 'absolute',
    top: -8,
    zIndex: 1,
  },
  locationInputWrap: {
    alignItems: 'center',
    borderColor: '#aeb2b7',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 24,
    minHeight: 58,
    paddingHorizontal: 15,
  },
  locationMap: {
    backgroundColor: '#e9eaec',
    borderColor: '#d2d4d8',
    borderRadius: 20,
    borderWidth: 1,
    height: 145,
    marginTop: 18,
    overflow: 'hidden',
    position: 'relative',
  },
  locationMapHint: {
    color: '#555a63',
    fontSize: 13,
    marginTop: 9,
    textAlign: 'center',
  },
  locationMarker: {
    alignItems: 'center',
    backgroundColor: '#1c1f24',
    borderColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 3,
    elevation: 4,
    height: 36,
    justifyContent: 'center',
    position: 'absolute',
    shadowColor: '#111318',
    shadowOpacity: 0.24,
    shadowRadius: 5,
    width: 36,
  },
  locationOverlay: { flex: 1, justifyContent: 'flex-end' },
  locationPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#1c1f24',
    borderRadius: 28,
    flex: 1.25,
    justifyContent: 'center',
    minHeight: 56,
  },
  locationPrimaryLabel: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  locationRoad: {
    backgroundColor: '#f9f9f8',
    position: 'absolute',
  },
  locationRoadOne: {
    height: 21,
    left: -8,
    right: -8,
    top: 67,
    transform: [{ rotate: '-9deg' }],
  },
  locationRoadTwo: {
    bottom: -12,
    top: -12,
    transform: [{ rotate: '27deg' }],
    width: 19,
    left: '52%',
  },
  locationSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f4f4f3',
    borderColor: '#101c2d',
    borderRadius: 28,
    borderWidth: 1,
    flex: 0.75,
    justifyContent: 'center',
    minHeight: 56,
  },
  locationSecondaryLabel: { color: '#101c2d', fontSize: 15, fontWeight: '900' },
  locationSheet: {
    backgroundColor: '#f4f4f3',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    elevation: 14,
    paddingHorizontal: 24,
    paddingTop: 14,
    shadowColor: '#111318',
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  locationSuccess: {
    color: '#277a48',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 13,
    textAlign: 'center',
  },
  locationTitle: {
    color: '#101c2d',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  navActive: { backgroundColor: '#17191d' },
  navActiveLabel: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  navItem: {
    alignItems: 'center',
    borderRadius: 26,
    flex: 1,
    gap: 3,
    height: 64,
    justifyContent: 'center',
  },
  navigation: {
    backgroundColor: 'rgba(250, 250, 250, 0.97)',
    borderColor: '#ced1d5',
    borderRadius: 33,
    borderWidth: 1,
    bottom: 18,
    elevation: 8,
    flexDirection: 'row',
    left: 24,
    padding: 5,
    position: 'absolute',
    right: 24,
    shadowColor: '#111318',
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  notificationButton: {
    alignItems: 'center',
    backgroundColor: '#e3e4e6',
    borderRadius: 28,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  permissionActions: { flexDirection: 'row', gap: 12, marginTop: 30 },
  permissionBackdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  permissionDescription: {
    color: '#555a63',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 13,
    textAlign: 'center',
  },
  permissionHandle: {
    alignSelf: 'center',
    backgroundColor: '#a4a7ad',
    borderRadius: 4,
    height: 5,
    marginBottom: 24,
    width: 46,
  },
  permissionOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  permissionPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#1c1f24',
    borderRadius: 28,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  permissionPrimaryLabel: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  permissionSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f4f4f3',
    borderColor: '#101c2d',
    borderRadius: 28,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56,
  },
  permissionSecondaryLabel: {
    color: '#101c2d',
    fontSize: 16,
    fontWeight: '900',
  },
  permissionSheet: {
    backgroundColor: '#f4f4f3',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  permissionTitle: {
    color: '#101c2d',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: '#1c1f24',
    borderRadius: 15,
    justifyContent: 'center',
    minHeight: 49,
    paddingHorizontal: 15,
  },
  openLabel: { color: '#ffffff', fontSize: 16, fontWeight: '900' },
  qrBadge: {
    alignItems: 'center',
    backgroundColor: '#1c1f24',
    borderRadius: 22,
    height: 55,
    justifyContent: 'center',
    width: 55,
  },
  quickAction: { alignItems: 'center', flex: 1, gap: 9 },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
  },
  quickIcon: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderColor: '#cfd1d4',
    borderRadius: 26,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 60,
  },
  quickIconShimmer: {
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    bottom: -20,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    left: 21,
    position: 'absolute',
    shadowColor: '#ffffff',
    shadowOpacity: 0.8,
    shadowRadius: 8,
    top: -20,
    width: 13,
  },
  quickLabel: {
    color: '#101c2d',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  reservationCard: {
    backgroundColor: '#eeeff1',
    borderColor: '#d2d4d8',
    borderRadius: 30,
    borderWidth: 1,
    marginTop: 38,
    padding: 24,
  },
  salesCard: {
    backgroundColor: '#111318',
    borderColor: '#343943',
    borderRadius: 30,
    borderWidth: 1,
    marginTop: 48,
    overflow: 'hidden',
    padding: 21,
    position: 'relative',
    shadowColor: '#111318',
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  salesHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    zIndex: 1,
  },
  salesMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    position: 'relative',
    zIndex: 1,
  },
  salesMetaText: { color: '#f4f4f5', fontSize: 15 },
  salesTitle: { color: '#f4f4f5', fontSize: 18, fontWeight: '600' },
  salesValue: {
    color: '#ffffff',
    fontSize: 47,
    fontWeight: '900',
    marginTop: 24,
    position: 'relative',
    zIndex: 1,
  },
  screen: { backgroundColor: '#ffffff', flex: 1 },
  summaryButton: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderColor: '#cfd1d4',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 48,
    paddingHorizontal: 15,
  },
  summaryLabel: { color: '#101c2d', fontSize: 16, fontWeight: '800' },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  welcome: { alignItems: 'center', marginTop: 52 },
  welcomeCopy: {
    color: '#555a63',
    fontSize: 19,
    marginTop: 10,
    textAlign: 'center',
  },
  welcomeTitle: {
    color: '#101c2d',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -0.8,
  },
  welcomeSurveyBackdrop: {
    backgroundColor: 'rgba(16, 28, 45, 0.58)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  welcomeSurveyCheckbox: {
    alignItems: 'center',
    borderColor: '#8e939b',
    borderRadius: 9,
    borderWidth: 1.5,
    height: 24,
    justifyContent: 'center',
    marginRight: 13,
    width: 24,
  },
  welcomeSurveyCheckboxSelected: {
    backgroundColor: '#1c1f24',
    borderColor: '#1c1f24',
  },
  welcomeSurveyError: {
    color: '#b42318',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
  welcomeSurveyHand: {
    alignItems: 'center',
    backgroundColor: '#e1e2e4',
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  welcomeSurveyHandle: {
    alignSelf: 'center',
    backgroundColor: '#a4a7ad',
    borderRadius: 4,
    height: 5,
    marginBottom: 22,
    width: 46,
  },
  welcomeSurveyHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 13,
  },
  welcomeSurveyIntro: {
    color: '#555a63',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 16,
  },
  welcomeSurveyOption: {
    alignItems: 'center',
    borderColor: '#d2d4d8',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 53,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  welcomeSurveyOptionLabel: {
    color: '#101c2d',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  welcomeSurveyOptionSelected: {
    backgroundColor: '#e8e9eb',
    borderColor: '#aeb2b7',
  },
  welcomeSurveyOptions: { gap: 9, marginTop: 18 },
  welcomeSurveyOverlay: { flex: 1, justifyContent: 'flex-end' },
  welcomeSurveyQuestion: {
    color: '#101c2d',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 24,
    marginTop: 22,
  },
  welcomeSurveySheet: {
    backgroundColor: '#f4f4f3',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    elevation: 14,
    paddingHorizontal: 24,
    paddingTop: 14,
    shadowColor: '#111318',
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  welcomeSurveySubmit: {
    alignItems: 'center',
    backgroundColor: '#1c1f24',
    borderRadius: 28,
    justifyContent: 'center',
    marginTop: 22,
    minHeight: 56,
  },
  welcomeSurveySubmitDisabled: { opacity: 0.65 },
  welcomeSurveySubmitLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
  },
  welcomeSurveySuccess: {
    color: '#277a48',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 14,
    textAlign: 'center',
  },
  welcomeSurveyTitle: {
    color: '#101c2d',
    fontSize: 25,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
});
