import { render, userEvent } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { CollaboratorFormSheet } from './CollaboratorFormSheet';

function TestSafeArea({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width: 390, x: 0, y: 0 },
        insets: { bottom: 24, left: 0, right: 0, top: 24 },
      }}
    >
      {children}
    </SafeAreaProvider>
  );
}

describe('CollaboratorFormSheet', () => {
  it('valida los campos obligatorios y permite crear un tipo personalizado', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <TestSafeArea>
        <CollaboratorFormSheet onClose={onClose} onSave={onSave} visible />
      </TestSafeArea>,
    );

    await user.press(view.getByRole('button', { name: 'Guardar colaborador' }));
    expect(view.getByText('El nombre es obligatorio.')).toBeOnTheScreen();
    expect(
      view.getByText('Selecciona un tipo de colaborador.'),
    ).toBeOnTheScreen();

    await user.type(
      view.getByPlaceholderText('Nombre del colaborador'),
      'María',
    );
    await user.press(view.getByRole('button', { name: 'Selecciona un tipo' }));
    await user.press(view.getByRole('button', { name: 'Crear un nuevo tipo' }));

    expect(view.getByText('Nuevo tipo de colaborador')).toBeOnTheScreen();
    expect(view.getByText('Puede realizar servicios')).toBeOnTheScreen();

    await user.type(view.getByPlaceholderText('Ej. Estilista'), 'Colorista');
    await user.press(
      view.getByRole('checkbox', { name: 'Puede realizar servicios' }),
    );
    await user.press(view.getByRole('button', { name: 'Guardar colaborador' }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaColor: '#111827',
        canPerformServices: true,
        customRoleName: 'Colorista',
        name: 'María',
        role: 'custom',
      }),
    );
  });

  it('guarda configuración adicional al editar', async () => {
    const onSave = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <TestSafeArea>
        <CollaboratorFormSheet
          initialValue={{
            agendaColor: '#2464E8',
            canPerformServices: true,
            customRoleDescription: '',
            customRoleName: '',
            description: '',
            identification: '0102030405',
            name: 'Carlos',
            phone: '0991234567',
            photoUri: null,
            role: 'barber',
          }}
          onClose={jest.fn()}
          onDelete={jest.fn().mockResolvedValue(undefined)}
          onSave={onSave}
          visible
        />
      </TestSafeArea>,
    );

    expect(view.getByText('Color en la agenda')).toBeOnTheScreen();
    expect(
      view.getAllByRole('button', { name: /Seleccionar color/ }),
    ).toHaveLength(40);

    await user.press(
      view.getByRole('button', { name: 'Seleccionar color #EF4444' }),
    );
    await user.press(view.getByRole('button', { name: 'Guardar colaborador' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        agendaColor: '#EF4444',
        identification: '0102030405',
        phone: '0991234567',
      }),
    );
  });

  it('permite eliminar un colaborador al editar', async () => {
    const onDelete = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const view = await render(
      <TestSafeArea>
        <CollaboratorFormSheet
          initialValue={{
            agendaColor: '#2464E8',
            canPerformServices: false,
            customRoleDescription: '',
            customRoleName: '',
            description: '',
            identification: '',
            name: 'Carlos',
            phone: '',
            photoUri: null,
            role: 'administrator',
          }}
          onClose={jest.fn()}
          onDelete={onDelete}
          onSave={jest.fn()}
          visible
        />
      </TestSafeArea>,
    );

    await user.press(
      view.getByRole('button', { name: 'Configuración adicional' }),
    );
    await user.press(
      view.getByRole('button', { name: 'Eliminar colaborador' }),
    );
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
