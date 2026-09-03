import { render } from '@testing-library/react-native';

import AccountTypeScreen from '../../app/(onboarding)/account-type';

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ error: null, isPending: false, mutate: jest.fn() }),
  useQuery: () => ({ data: { accountType: 'business' } }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaView: require('react-native').View,
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 'session' }, user: { id: 'user-1' } }),
}));

describe('AccountTypeScreen', () => {
  it('mantiene la tarjeta seleccionada con el indicador sutil de configuración', async () => {
    const view = await render(<AccountTypeScreen />);

    const selectedOption = view
      .getAllByRole('radio')
      .find((option) => option.props.accessibilityState?.checked);

    expect(selectedOption).toHaveStyle({
      backgroundColor: '#FFFFFF',
      borderColor: '#D9E7DE',
      borderWidth: 1,
    });
  });
});
