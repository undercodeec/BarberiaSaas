import { fireEvent, render } from '@testing-library/react-native';

import { AccountSetupWelcomeScreen } from './AccountSetupWelcomeScreen';

describe('AccountSetupWelcomeScreen', () => {
  it('personaliza la bienvenida y permite comenzar la configuración', async () => {
    const onContinue = jest.fn();
    const view = await render(
      <AccountSetupWelcomeScreen
        fullName="Ana Torres"
        onContinue={onContinue}
      />,
    );

    expect(view.getByText('¡Hola, Ana!')).toBeOnTheScreen();
    expect(view.getByRole('header')).toHaveTextContent('Configura tu cuenta');

    fireEvent.press(
      view.getByRole('button', { name: 'Comenzar configuración' }),
    );
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
