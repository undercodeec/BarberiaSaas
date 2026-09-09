import { fireEvent, render } from '@testing-library/react-native';

import TeamManagementScreen from '../../app/(onboarding)/team-management';

const mockPush = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ isPending: false, mutate: jest.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) => ({
    data: queryKey.includes('team')
      ? {
          assignmentCapabilities: {
            canEditAssignments: true,
            maxActiveLocations: 1,
            reason: null,
          },
          members: [
            {
              commissionPercentage: 50,
              id: 'barber-membership-1',
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
                email: 'diego@example.com',
                fullName: 'Diego Barber',
                id: 'barber-user-1',
              },
            },
          ],
          pendingInvitations: [],
          teamEnabled: true,
        }
      : { accountType: 'business' },
  }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  Redirect: () => null,
  useRouter: () => ({
    back: jest.fn(),
    canGoBack: () => true,
    push: mockPush,
    replace: jest.fn(),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SafeAreaView: require('react-native').View,
}));

jest.mock('../components/BottomNavigation', () => ({
  appStyles: { screen: {} },
  appTheme: {
    colors: {
      accent: '#287247',
      accentDark: '#1C5534',
      background: '#F7F6F2',
      border: '#E4E2DC',
      surface: '#FFFFFF',
      text: '#101C2D',
      textMuted: '#667080',
    },
  },
  goldButtonShadow: {},
  useNativeLayoutMetrics: () => ({ bottomInset: 0 }),
}));

jest.mock('../components/KeyboardAwareScrollView', () => ({
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  KeyboardAwareScrollView: require('react-native').ScrollView,
}));

jest.mock('../features/organization/useCurrentOrganization', () => ({
  useCurrentOrganization: () => ({
    data: {
      location: { id: 'location-1', name: 'Sucursal Centro' },
      membership: { id: 'owner-membership-1', role: 'owner' },
    },
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 'session' }, user: { id: 'owner-1' } }),
}));

jest.mock('../providers/TenantScopeProvider', () => ({
  useTenantScope: () => ({ key: (resource: string) => [resource] }),
}));

describe('TeamManagementScreen', () => {
  it('lleva al administrador al horario del profesional de la sucursal actual', async () => {
    const view = await render(<TeamManagementScreen />);

    fireEvent.press(view.getByLabelText('Editar horario de Diego Barber'));

    expect(mockPush).toHaveBeenCalledWith({
      params: {
        locationId: 'location-1',
        locationName: 'Sucursal Centro',
        membershipId: 'barber-membership-1',
        professionalName: 'Diego Barber',
      },
      pathname: '/professional-schedule',
    });
  });
});
