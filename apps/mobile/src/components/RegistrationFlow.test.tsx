import { render, userEvent } from '@testing-library/react-native';
import { RegistrationFlow } from './RegistrationFlow';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaView: require('react-native').View,
  useSafeAreaInsets: () => ({ bottom: 0, top: 0 }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({
    resendVerification: jest.fn(),
    signUp: jest.fn(),
    verifyEmail: jest.fn(),
  }),
}));

jest.mock('../lib/api', () => ({
  requireApiClient: () => ({
    request: jest
      .fn()
      .mockResolvedValue({ conflicts: { email: null, phone: null } }),
  }),
}));

jest.mock('./RegistrationSelectors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TextInput } = require('react-native');
  return {
    COUNTRIES: [{ code: 'EC', dial: '+593', name: 'Ecuador' }],
    CountryCityFields: ({
      city,
      onCity,
    }: {
      city: string;
      onCity: (value: string) => void;
    }) => (
      <TextInput
        accessibilityLabel="Ciudad"
        onChangeText={onCity}
        value={city}
      />
    ),
    detectCountryCode: () => 'EC',
    PhoneCountryField: ({
      onChangeText,
      value,
    }: {
      onChangeText: (value: string) => void;
      value: string;
    }) => (
      <TextInput
        accessibilityLabel="Número telefónico"
        onChangeText={onChangeText}
        value={value}
      />
    ),
    TimeField: ({
      label,
      onChange,
      value,
    }: {
      label: string;
      onChange: (value: string) => void;
      value: string;
    }) => (
      <TextInput
        accessibilityLabel={label}
        onChangeText={onChange}
        value={value}
      />
    ),
  };
});

describe('RegistrationFlow', () => {
  it('permite mostrar cada contraseña de registro de forma independiente', async () => {
    const user = userEvent.setup();
    const view = await render(<RegistrationFlow />);

    await user.press(view.getByRole('button', { name: 'Tengo un negocio' }));
    await user.press(
      view.getByRole('button', { name: 'Seleccionar tipo de negocio' }),
    );
    await user.press(view.getAllByRole('radio')[0]!);
    await user.type(view.getByLabelText('Nombre'), 'Ana Torres');
    await user.type(view.getByLabelText('Nombre del negocio'), 'Nava Studio');
    await user.type(view.getByLabelText('Número telefónico'), '0991234567');
    await user.press(view.getByRole('button', { name: 'Siguiente' }));
    await user.type(view.getByLabelText('Ciudad'), 'Quito');
    await user.press(view.getByRole('button', { name: 'Siguiente' }));
    await user.type(view.getByLabelText('Horario de apertura'), '09:00');
    await user.type(view.getByLabelText('Horario de cierre'), '18:00');
    await user.press(view.getByRole('button', { name: 'Siguiente' }));

    const password = view.getByLabelText('Contraseña');
    const confirmation = view.getByLabelText('Confirmar contraseña');

    expect(password.props.secureTextEntry).toBe(true);
    expect(confirmation.props.secureTextEntry).toBe(true);

    await user.press(view.getByRole('button', { name: 'Mostrar contraseña' }));

    expect(password.props.secureTextEntry).toBe(false);
    expect(confirmation.props.secureTextEntry).toBe(true);

    await user.press(
      view.getByRole('button', { name: 'Mostrar confirmación de contraseña' }),
    );

    expect(password.props.secureTextEntry).toBe(false);
    expect(confirmation.props.secureTextEntry).toBe(false);

    await user.type(
      view.getByLabelText('Correo electrónico'),
      'ana@example.com',
    );
    await user.type(password, 'Clave-segura-123');
    await user.type(confirmation, 'Clave-segura-123');
    await user.press(view.getByRole('button', { name: 'Siguiente' }));

    expect(view.queryByRole('checkbox')).toBeNull();
  });
});
