import { render, userEvent } from '@testing-library/react-native';

import { CollaboratorFormSheet } from './CollaboratorFormSheet';

describe('CollaboratorFormSheet', () => {
  it('valida los campos obligatorios y permite crear un tipo personalizado', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <CollaboratorFormSheet onClose={onClose} onSave={onSave} visible />,
    );

    await user.press(
      view.getByRole('button', { name: 'Guardar colaborador' }),
    );
    expect(view.getByText('El nombre es obligatorio.')).toBeOnTheScreen();
    expect(
      view.getByText('Selecciona un tipo de colaborador.'),
    ).toBeOnTheScreen();

    await user.type(
      view.getByPlaceholderText('Nombre del colaborador'),
      'María',
    );
    await user.press(
      view.getByRole('button', { name: 'Selecciona un tipo' }),
    );
    await user.press(
      view.getByRole('button', { name: 'Crear un nuevo tipo' }),
    );

    expect(view.getByText('Nuevo tipo de colaborador')).toBeOnTheScreen();
    expect(view.getByText('Puede realizar servicios')).toBeOnTheScreen();

    await user.type(view.getByPlaceholderText('Ej. Estilista'), 'Colorista');
    await user.press(
      view.getByRole('checkbox', { name: 'Puede realizar servicios' }),
    );
    await user.press(
      view.getByRole('button', { name: 'Guardar colaborador' }),
    );

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        canPerformServices: true,
        customRoleName: 'Colorista',
        name: 'María',
        role: 'custom',
      }),
    );
  });
});
