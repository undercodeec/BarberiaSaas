import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { StyleSheet, View } from 'react-native';

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
});
