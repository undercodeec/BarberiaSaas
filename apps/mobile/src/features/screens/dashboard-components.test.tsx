import { render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { OpenButtonFlare } from './dashboard-components';

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
