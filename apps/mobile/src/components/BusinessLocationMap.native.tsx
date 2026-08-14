import Constants from 'expo-constants';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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
  const nativeMapsEnabled =
    Constants.expoConfig?.extra?.googleMaps?.nativeEnabled === true;

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
