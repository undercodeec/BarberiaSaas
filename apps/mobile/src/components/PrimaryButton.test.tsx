import { fireEvent, render } from '@testing-library/react-native';

import { PrimaryButton } from './PrimaryButton';

describe('PrimaryButton', () => {
  it('ejecuta una acción accesible', async () => {
    const onPress = jest.fn();
    const view = await render(
      <PrimaryButton label="Continuar" onPress={onPress} />,
    );
    fireEvent.press(view.getByRole('button', { name: 'Continuar' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
