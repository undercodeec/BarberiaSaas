import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface MapCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export function BusinessLocationMap({
  coordinate,
  onCoordinateChange,
}: {
  readonly coordinate: MapCoordinate | null;
  readonly onCoordinateChange: (coordinate: MapCoordinate) => void;
}) {
  const center = coordinate ?? { latitude: -0.1807, longitude: -78.4678 };
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  // La clave nativa se inyecta directamente en AndroidManifest mediante Gradle.
  // Expo Constants no siempre conserva `extra` en un AAB local, por lo que no
  // debe decidir si MapView se muestra o no.
  const nativeMapsEnabled = true;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!mapLoaded) {
        setMapTimedOut(true);
        console.warn(
          '[Nava Maps] El mapa no terminó de cargar. Revisa Logcat para errores de Maps SDK o autorización de la clave Android.',
        );
      }
    }, 10_000);
    return () => clearTimeout(timer);
  }, [mapLoaded]);

  if (!nativeMapsEnabled) {
    return (
      <View style={[styles.container, styles.unavailableContainer]}>
        <Text style={styles.unavailableTitle}>Mapa no disponible</Text>
        <Text style={styles.unavailableCopy}>
          Busca una dirección o usa tu ubicación actual para continuar.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        accessibilityLabel="Mapa de ubicación del negocio"
        onMapLoaded={() => {
          setMapLoaded(true);
          setMapTimedOut(false);
          console.info('[Nava Maps] Mapa Google cargado correctamente.');
        }}
        onMapReady={() => console.info('[Nava Maps] Mapa Google listo.')}
        onPress={(event) => onCoordinateChange(event.nativeEvent.coordinate)}
        provider={PROVIDER_GOOGLE}
        region={{ ...center, latitudeDelta: 0.012, longitudeDelta: 0.012 }}
        style={styles.map}
      >
        {coordinate ? (
          <Marker
            coordinate={coordinate}
            draggable
            onDragEnd={(event) =>
              onCoordinateChange(event.nativeEvent.coordinate)
            }
          />
        ) : null}
      </MapView>
      {mapTimedOut ? (
        <View pointerEvents="none" style={styles.diagnostic}>
          <Text style={styles.diagnosticText}>
            No pudimos cargar el mapa. Revisa la configuración de Google Maps.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 18,
    height: 190,
    overflow: 'hidden',
    width: '100%',
  },
  diagnostic: {
    backgroundColor: 'rgba(255, 240, 238, 0.94)',
    borderColor: '#BD2D2D',
    borderRadius: 12,
    borderWidth: 1,
    bottom: 12,
    left: 12,
    padding: 10,
    position: 'absolute',
    right: 12,
  },
  diagnosticText: {
    color: '#A72D27',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  map: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  unavailableContainer: {
    alignItems: 'center',
    backgroundColor: '#F2F3F4',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  unavailableCopy: {
    color: '#69717D',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    textAlign: 'center',
  },
  unavailableTitle: { color: '#101C2D', fontSize: 16, fontWeight: '800' },
});
