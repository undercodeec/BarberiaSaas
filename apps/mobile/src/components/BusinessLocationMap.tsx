import { StyleSheet, Text, View } from 'react-native';

export interface MapCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export function BusinessLocationMap({
  coordinate,
}: {
  readonly coordinate: MapCoordinate | null;
  readonly onCoordinateChange: (coordinate: MapCoordinate) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>
        {coordinate
          ? `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`
          : 'Selecciona una ubicación para mostrar el mapa.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#ECE8DF',
    borderRadius: 18,
    height: 190,
    justifyContent: 'center',
    padding: 24,
    width: '100%',
  },
  text: { color: '#59616D', textAlign: 'center' },
});
