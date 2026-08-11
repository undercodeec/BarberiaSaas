import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { StyleSheet, Text, View } from 'react-native';

export interface MapCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

const webApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_WEB_API_KEY ?? '';

function openStreetMapEmbedUrl({ latitude, longitude }: MapCoordinate) {
  const latitudeOffset = 0.008;
  const longitudeOffset = 0.012;
  const bounds = [
    longitude - longitudeOffset,
    latitude - latitudeOffset,
    longitude + longitudeOffset,
    latitude + latitudeOffset,
  ].join(',');
  const marker = `${latitude},${longitude}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bounds)}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
}

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
        <iframe
          aria-label="Vista previa de la ubicación del negocio"
          scrolling="no"
          src={openStreetMapEmbedUrl(center)}
          style={{ border: 0, height: '100%', width: '100%' }}
          title="Vista previa de la ubicación del negocio"
        />
        <View pointerEvents="none" style={styles.previewNotice}>
          <Text style={styles.fallbackText}>
            Busca una dirección o usa tu ubicación para seleccionar el punto.
          </Text>
        </View>
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
  fallback: { backgroundColor: '#ECE8DF' },
  fallbackText: { color: '#273243', fontSize: 12, textAlign: 'center' },
  previewNotice: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    bottom: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'absolute',
    right: 8,
  },
});
