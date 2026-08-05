import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { StyleSheet, Text, View } from 'react-native';

export interface MapCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

const webApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

export function BusinessLocationMap({
  coordinate,
  onCoordinateChange,
}: {
  readonly coordinate: MapCoordinate | null;
  readonly onCoordinateChange: (coordinate: MapCoordinate) => void;
}) {
  const center = coordinate ?? { latitude: -0.1807, longitude: -78.4678 };
  if (!webApiKey)
    return (
      <View style={[styles.container, styles.fallback]}>
        <Text style={styles.fallbackText}>
          Configura EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY para mostrar el mapa
          web.
        </Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <APIProvider apiKey={webApiKey} language="es">
        <Map
          center={{ lat: center.latitude, lng: center.longitude }}
          clickableIcons={false}
          disableDefaultUI
          gestureHandling="greedy"
          onClick={(event) => {
            const selected = event.detail.latLng;
            if (selected)
              onCoordinateChange({
                latitude: selected.lat,
                longitude: selected.lng,
              });
          }}
          zoom={15}
        >
          {coordinate ? (
            <Marker
              position={{ lat: coordinate.latitude, lng: coordinate.longitude }}
            />
          ) : null}
        </Map>
      </APIProvider>
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
  fallback: {
    alignItems: 'center',
    backgroundColor: '#ECE8DF',
    justifyContent: 'center',
    padding: 24,
  },
  fallbackText: { color: '#59616D', textAlign: 'center' },
});
