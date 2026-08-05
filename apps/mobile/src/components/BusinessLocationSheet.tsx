import Ionicons from '@expo/vector-icons/Ionicons';
import type {
  BusinessLocation,
  GoogleMapsLocationCandidate,
  GoogleMapsSuggestion,
} from '@barber-saas/api-client';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { requireApiClient } from '../lib/api';
import { BusinessLocationMap, type MapCoordinate } from './BusinessLocationMap';
import { appTheme, goldButtonShadow } from './BottomNavigation';

function sessionToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function initialCandidate(
  location: BusinessLocation | null,
): GoogleMapsLocationCandidate | null {
  if (
    !location?.formattedAddress ||
    location.latitude === null ||
    location.longitude === null
  )
    return null;
  return {
    city: location.city,
    countryCode: location.countryCode,
    displayName: null,
    formattedAddress: location.formattedAddress,
    latitude: location.latitude,
    longitude: location.longitude,
    placeId: location.googlePlaceId ?? '',
  };
}

export function BusinessLocationSheet({
  countryCode,
  initialLocation,
  onComplete,
  onDismiss,
  onSubmit,
  visible,
}: {
  readonly countryCode: string;
  readonly initialLocation: BusinessLocation | null;
  readonly onComplete: () => void;
  readonly onDismiss: () => void;
  readonly onSubmit: (location: GoogleMapsLocationCandidate) => Promise<void>;
  readonly visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const initial = initialCandidate(initialLocation);
  const [address, setAddress] = useState(
    initial?.formattedAddress ?? initialLocation?.addressLine ?? '',
  );
  const [candidate, setCandidate] =
    useState<GoogleMapsLocationCandidate | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [suggestions, setSuggestions] = useState<
    readonly GoogleMapsSuggestion[]
  >([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchToken = useRef(sessionToken());
  const [sheetTranslateY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible || isSubmitted) return;
    const query = address.trim();
    if (
      query.length < 3 ||
      query === candidate?.formattedAddress ||
      query === candidate?.displayName
    )
      return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await requireApiClient().request<{
          readonly suggestions: readonly GoogleMapsSuggestion[];
        }>('/v1/maps/autocomplete', {
          body: {
            countryCode,
            ...(candidate
              ? {
                  latitude: candidate.latitude,
                  longitude: candidate.longitude,
                }
              : {}),
            query,
            sessionToken: searchToken.current,
          },
          method: 'POST',
          signal: controller.signal,
        });
        setSuggestions(response.suggestions);
      } catch (requestError) {
        if (!controller.signal.aborted)
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No pudimos buscar esa dirección.',
          );
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 320);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [address, candidate, countryCode, isSubmitted, visible]);

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
      toValue: 720,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDismiss();
    });
  };

  const [panResponder] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) sheetTranslateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100 || gesture.vy > 0.75) {
          dismissWithAnimation();
          return;
        }
        Animated.spring(sheetTranslateY, {
          bounciness: 0,
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  );

  const resolveCoordinates = async (coordinate: MapCoordinate) => {
    setIsLocating(true);
    setError(null);
    try {
      const response = await requireApiClient().request<{
        readonly location: GoogleMapsLocationCandidate;
      }>('/v1/maps/reverse-geocode', {
        body: coordinate,
        method: 'POST',
      });
      setCandidate(response.location);
      setAddress(response.location.formattedAddress);
      setSuggestions([]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos identificar esa dirección.',
      );
    } finally {
      setIsLocating(false);
    }
  };

  const requestCurrentLocation = async () => {
    setIsLocating(true);
    setError(null);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setError(
          'No se concedió el permiso. Puedes buscar el negocio o las calles manualmente.',
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      await resolveCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos obtener tu ubicación actual.',
      );
    } finally {
      setIsLocating(false);
    }
  };

  const selectSuggestion = async (suggestion: GoogleMapsSuggestion) => {
    setIsLocating(true);
    setError(null);
    try {
      const response = await requireApiClient().request<{
        readonly location: GoogleMapsLocationCandidate;
      }>('/v1/maps/place-details', {
        body: {
          placeId: suggestion.placeId,
          sessionToken: searchToken.current,
        },
        method: 'POST',
      });
      setCandidate(response.location);
      setAddress(response.location.formattedAddress);
      setSuggestions([]);
      searchToken.current = sessionToken();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos cargar ese lugar.',
      );
    } finally {
      setIsLocating(false);
    }
  };

  const submit = async () => {
    if (!candidate) {
      setError('Selecciona una sugerencia o usa tu ubicación actual.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit(candidate);
      setIsSubmitted(true);
      closeTimer.current = setTimeout(onComplete, 900);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No pudimos guardar la ubicación. Inténtalo de nuevo.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!visible) return null;
  const coordinate = candidate
    ? { latitude: candidate.latitude, longitude: candidate.longitude }
    : null;

  return (
    <Modal
      animationType="slide"
      onRequestClose={dismissWithAnimation}
      statusBarTranslucent
      transparent
      visible
    >
      <View accessibilityViewIsModal style={styles.overlay}>
        <Pressable
          accessibilityLabel="Cerrar ubicación"
          accessibilityRole="button"
          onPress={dismissWithAnimation}
          style={styles.backdrop}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 20) + 16,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.dragArea}>
            <View style={styles.handle} />
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text accessibilityRole="header" style={styles.title}>
              Ubicación del negocio
            </Text>
            <Text style={styles.description}>
              Busca el nombre del negocio o las calles, o carga tu ubicación
              actual y confirma el punto antes de guardarlo.
            </Text>

            <View style={styles.inputWrap}>
              <Ionicons color="#555a63" name="search-outline" size={21} />
              <TextInput
                accessibilityLabel="Buscar negocio o dirección"
                editable={!isSubmitted}
                onChangeText={(value) => {
                  setAddress(value);
                  setCandidate(null);
                  setError(null);
                  setSuggestions([]);
                }}
                placeholder="Nombre del negocio, avenida o calles"
                placeholderTextColor="#8e939b"
                style={styles.input}
                value={address}
              />
              {isSearching ? <ActivityIndicator color="#101C2D" /> : null}
            </View>

            {suggestions.length > 0 ? (
              <View style={styles.suggestions}>
                {suggestions.map((suggestion) => (
                  <Pressable
                    accessibilityRole="button"
                    key={suggestion.placeId}
                    onPress={() => void selectSuggestion(suggestion)}
                    style={styles.suggestion}
                  >
                    <Ionicons
                      color="#101C2D"
                      name="location-outline"
                      size={19}
                    />
                    <View style={styles.suggestionCopy}>
                      <Text style={styles.suggestionMain}>
                        {suggestion.mainText}
                      </Text>
                      {suggestion.secondaryText ? (
                        <Text style={styles.suggestionSecondary}>
                          {suggestion.secondaryText}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={isLocating || isSubmitted}
              onPress={() => void requestCurrentLocation()}
              style={styles.locateButton}
            >
              {isLocating ? (
                <ActivityIndicator color="#101C2D" size="small" />
              ) : (
                <Ionicons color="#101C2D" name="navigate-outline" size={20} />
              )}
              <Text style={styles.locateLabel}>Usar mi ubicación actual</Text>
            </Pressable>

            <BusinessLocationMap
              coordinate={coordinate}
              onCoordinateChange={(next) => void resolveCoordinates(next)}
            />
            <Text style={styles.mapHint}>
              Toca el mapa para ajustar el marcador y actualizar la dirección.
            </Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {isSubmitted ? (
              <Text accessibilityLiveRegion="polite" style={styles.success}>
                Ubicación guardada
              </Text>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={isSubmitting || isSubmitted}
              onPress={dismissWithAnimation}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryLabel}>Ahora no</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={isLocating || isSubmitting || isSubmitted || !candidate}
              onPress={() => void submit()}
              style={[
                styles.primaryButton,
                (isLocating || isSubmitting || isSubmitted || !candidate) &&
                  styles.disabled,
              ]}
            >
              <Text style={styles.primaryLabel}>
                {isSubmitting ? 'Guardando…' : 'Guardar ubicación'}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  backdrop: {
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  content: { paddingBottom: 8, paddingHorizontal: 22 },
  description: {
    color: '#646A73',
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  disabled: { opacity: 0.55 },
  dragArea: { alignItems: 'center', paddingBottom: 8, paddingTop: 10 },
  error: { color: '#B42318', fontSize: 13, marginTop: 10 },
  handle: { backgroundColor: '#D1D5DB', borderRadius: 3, height: 5, width: 44 },
  input: { color: '#15171A', flex: 1, fontSize: 15, paddingVertical: 13 },
  inputWrap: {
    alignItems: 'center',
    backgroundColor: '#F7F5F0',
    borderColor: '#D8D4CB',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    paddingHorizontal: 14,
  },
  locateButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    marginTop: 14,
    paddingVertical: 4,
  },
  locateLabel: { color: '#101C2D', fontSize: 14, fontWeight: '800' },
  mapHint: {
    color: '#717784',
    fontSize: 12,
    marginTop: 7,
    textAlign: 'center',
  },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#D4AF37',
    borderRadius: 15,
    flex: 1.45,
    justifyContent: 'center',
    minHeight: 50,
    ...goldButtonShadow,
  },
  primaryLabel: {
    color: appTheme.colors.accentDark,
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#CBC6BC',
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  secondaryLabel: { color: '#101C2D', fontSize: 15, fontWeight: '800' },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '91%',
    paddingTop: 0,
  },
  success: { color: '#067647', fontSize: 13, fontWeight: '800', marginTop: 10 },
  suggestion: {
    alignItems: 'flex-start',
    borderBottomColor: '#ECE8DF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  suggestionCopy: { flex: 1 },
  suggestionMain: { color: '#17191D', fontSize: 14, fontWeight: '800' },
  suggestionSecondary: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  suggestions: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D8D4CB',
    borderRadius: 14,
    borderWidth: 1,
    marginTop: 6,
    overflow: 'hidden',
  },
  title: { color: '#111318', fontSize: 24, fontWeight: '900', marginBottom: 7 },
});
