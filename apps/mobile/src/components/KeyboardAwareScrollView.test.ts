import { shouldRevealFocusedInput } from './KeyboardAwareScrollView';

describe('shouldRevealFocusedInput', () => {
  it('omite un campo que dejó de tener foco antes de medirse', () => {
    const input = { isFocused: () => false };

    expect(shouldRevealFocusedInput(input, null)).toBe(false);
  });
});
