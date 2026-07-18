import { render } from '@testing-library/react-native';

import HomeScreen from './index';

describe('HomeScreen', () => {
  it('muestra el estado inicial de la aplicación', async () => {
    const view = await render(<HomeScreen />);
    expect(view.getByRole('header')).toHaveTextContent(
      'Tu barbería en la palma de tu mano.',
    );
    expect(view.getByText('Infraestructura operativa')).toBeVisible();
  });
});
