import { render, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ServiceFormSheet } from './ServiceFormSheet';

describe('ServiceFormSheet', () => {
  it('valida y guarda un servicio', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 844, width: 390, x: 0, y: 0 },
          insets: { bottom: 24, left: 0, right: 0, top: 24 },
        }}
      >
        <ServiceFormSheet onClose={onClose} onSave={onSave} visible />
      </SafeAreaProvider>,
    );

    await user.press(view.getByRole('button', { name: 'Guardar servicio' }));
    expect(
      view.getByText('El nombre del servicio es obligatorio.'),
    ).toBeOnTheScreen();
    expect(view.getByText('Ingresa una duración válida.')).toBeOnTheScreen();
    expect(view.getByText('Ingresa un precio válido.')).toBeOnTheScreen();

    await user.type(view.getByPlaceholderText('Ej. Corte clásico'), 'Corte');
    await user.type(view.getByLabelText('Duración en minutos'), '30');
    await user.type(view.getByLabelText('Precio del servicio'), '15');
    await user.press(view.getByRole('button', { name: 'Guardar servicio' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        description: '',
        durationMinutes: 30,
        name: 'Corte',
        price: 15,
      }),
    );
  });
});
