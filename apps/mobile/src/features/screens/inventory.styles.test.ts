import { StyleSheet } from 'react-native';

import { styles } from './inventory.styles';

describe('inventory responsive layout', () => {
  it('reserva una fila completa para el importe acumulado', () => {
    const fullWidthCard = StyleSheet.flatten(
      (styles as Record<string, unknown>).summaryCardFullWidth as never,
    );

    expect(fullWidthCard).toMatchObject({ flexBasis: '100%' });
  });

  it('permite que el detalle de un movimiento se reduzca antes de desplazar su cantidad', () => {
    const detail = StyleSheet.flatten(
      (styles as Record<string, unknown>).movementDetail as never,
    );
    const value = StyleSheet.flatten(styles.movementValue);

    expect(detail).toMatchObject({ flex: 1, flexShrink: 1, minWidth: 0 });
    expect(value).toMatchObject({ flexShrink: 0, minWidth: 56 });
  });
});
