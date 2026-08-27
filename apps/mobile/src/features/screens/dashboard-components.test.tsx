import { render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  OpenButtonFlare,
  SubscriptionActivationCelebration,
} from './dashboard-components';

describe('OpenButtonFlare', () => {
  it('inicia su ciclo de destello al montarse', async () => {
    const start = jest.fn();
    const stop = jest.fn();
    const animation = { start, stop } as unknown as Animated.CompositeAnimation;
    const loop = jest.spyOn(Animated, 'loop').mockReturnValue(animation);

    render(<OpenButtonFlare />);

    await waitFor(() => {
      expect(loop).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
    });

    loop.mockRestore();
  });
});

describe('SubscriptionActivationCelebration', () => {
  it('muestra el mensaje y el plan activado durante la celebración', async () => {
    const animation = {
      start: jest.fn(),
      stop: jest.fn(),
    } as unknown as Animated.CompositeAnimation;
    const sequence = jest
      .spyOn(Animated, 'sequence')
      .mockReturnValue(animation);
    const view = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { height: 844, width: 390, x: 0, y: 0 },
          insets: { bottom: 34, left: 0, right: 0, top: 47 },
        }}
      >
        <SubscriptionActivationCelebration planName="Nava Local" visible />
      </SafeAreaProvider>,
    );

    expect(view.getByText('Ahora eres miembro de Nava Premium')).toBeTruthy();
    expect(view.getByText('Tu plan Nava Local ya está activo.')).toBeTruthy();

    view.unmount();
    sequence.mockRestore();
  });
});
