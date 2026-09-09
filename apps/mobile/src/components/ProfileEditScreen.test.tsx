import { render } from '@testing-library/react-native';

import ProfileEditScreen from '../../app/(onboarding)/profile-edit';

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, mutate: jest.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) => ({
    data: queryKey.includes('user-profile')
      ? {
          profile: {
            bio: 'Especialista en cortes clásicos',
            email: 'barbero@example.com',
            fullName: 'Diego Barber',
            phone: '0999999999',
            photoData: null,
          },
        }
      : queryKey.includes('team')
        ? {
            members: [
              {
                commissionPercentage: null,
                id: 'membership-1',
                locations: [
                  {
                    id: 'location-1',
                    name: 'Sucursal Centro',
                    onlineBookingEnabled: true,
                  },
                ],
                planAvailable: true,
                role: 'barber',
                status: 'active',
                user: {
                  email: 'barbero@example.com',
                  fullName: 'Diego Barber',
                  id: 'user-1',
                },
              },
            ],
          }
      : {
          accountType: 'business',
          addressLine: 'Av. del Negocio',
          businessCategory: 'BARBERSHOP',
          businessName: 'Barbería del dueño',
          city: 'Quito',
          countryCode: 'EC',
          coverImageUri: null,
          facebookUrl: 'https://facebook.com/barberia',
          instagramUrl: 'https://instagram.com/barberia',
          timezone: 'America/Guayaquil',
        },
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(),
}));

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({ replace: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaView: require('react-native').View,
}));

jest.mock('../components/BottomNavigation', () => ({
  BottomNavigation: () => null,
  appStyles: { screen: {} },
  appTheme: {
    colors: {
      accent: '#287247',
      accentDark: '#1C5534',
      danger: '#B42318',
      surface: '#FFFFFF',
      surfaceMuted: '#F3F5F7',
    },
  },
  goldButtonShadow: {},
  useNativeLayoutMetrics: () => ({ bottomNavigationContentPadding: 100 }),
}));

jest.mock('../components/KeyboardAwareScrollView', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  KeyboardAwareScrollView: require('react-native').ScrollView,
}));

jest.mock('../components/RegistrationSelectors', () => ({
  CountryCityFields: () => null,
}));

jest.mock('../features/organization/useCurrentOrganization', () => ({
  useCurrentOrganization: () => ({
    data: {
      location: { id: 'location-1', name: 'Sucursal Centro' },
      membership: { id: 'membership-1', role: 'barber' },
    },
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 'session' }, user: { id: 'user-1' } }),
}));

describe('ProfileEditScreen', () => {
  it('muestra al barbero únicamente los campos de su perfil personal', async () => {
    const view = await render(<ProfileEditScreen />);

    expect(view.getByText('Datos personales')).toBeOnTheScreen();
    expect(view.getByText('Sobre mí')).toBeOnTheScreen();
    expect(view.queryByText('Información del negocio')).toBeNull();
    expect(
      view.getByLabelText('Cambiar mi disponibilidad para reservas'),
    ).toBeOnTheScreen();
    expect(view.queryByLabelText('Cambiar portada del negocio')).toBeNull();
  });
});
