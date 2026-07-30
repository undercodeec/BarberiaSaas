import { render, userEvent } from '@testing-library/react-native';

import { AccountSetupWelcomeScreen } from './AccountSetupWelcomeScreen';

describe('AccountSetupWelcomeScreen', () => {
  it('personaliza la bienvenida y permite comenzar la configuración', async () => {
    const onBack = jest.fn();
    const onContinue = jest.fn();
    const user = userEvent.setup();
    const view = await render(
      <AccountSetupWelcomeScreen
        accountType="professional"
        fullName="Ana Torres"
        onBack={onBack}
        onContinue={onContinue}
      />,
    );

    expect(view.getByText('¡Hola, Ana!')).toBeOnTheScreen();
    expect(view.getByRole('header')).toHaveTextContent('Configura tu cuenta');
    expect(view.getByText('Tu actividad')).toBeOnTheScreen();

    await user.press(
      view.getByRole('button', { name: 'Comenzar configuración' }),
    );
    expect(onContinue).toHaveBeenCalledTimes(1);

    await user.press(view.getByRole('button', { name: 'Regresar al inicio' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
