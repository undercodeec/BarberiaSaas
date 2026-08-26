import { act, render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { NotificationBorderOrbit } from './GlobalNotificationsBanner';

describe('NotificationBorderOrbit', () => {
  it('inicia la órbita continua del punto al montarse', async () => {
    const start = jest.fn();
    const stop = jest.fn();
    const animation = { start, stop } as unknown as Animated.CompositeAnimation;
    const loop = jest.spyOn(Animated, 'loop').mockReturnValue(animation);
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue(animation);

    await act(async () => {
      render(<NotificationBorderOrbit />);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(loop).toHaveBeenCalledTimes(1);
      expect(start).toHaveBeenCalledTimes(1);
      expect(timing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ duration: 24_000 }),
      );
    });

    loop.mockRestore();
    timing.mockRestore();
  });
});
