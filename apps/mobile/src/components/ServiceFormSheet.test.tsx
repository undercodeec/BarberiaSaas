import { render, userEvent } from '@testing-library/react-native';

import { ServiceFormSheet } from './ServiceFormSheet';

describe('ServiceFormSheet', () => {
  it('valida y guarda un servicio', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <ServiceFormSheet onClose={onClose} onSave={onSave} visible />,
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

    expect(onSave).toHaveBeenCalledWith({
      description: '',
      durationMinutes: 30,
      name: 'Corte',
      price: 15,
    });
  });
});
