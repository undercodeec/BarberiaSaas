import { fireEvent, render } from '@testing-library/react-native';

import CollaboratorPermissionsScreen from '../../app/(onboarding)/collaborator-permissions';

jest.mock('@tanstack/react-query', () => ({
  useMutation: () => ({ error: null, isPending: false, mutate: jest.fn() }),
  useQuery: ({ queryKey }: { queryKey: readonly string[] }) => {
    if (queryKey.includes('team-locations')) {
      return {
        data: { locations: [{ id: 'location-1', name: 'Sucursal Centro' }] },
      };
    }
    if (queryKey.includes('team')) {
      return {
        data: {
          assignmentCapabilities: {
            canEditAssignments: true,
            maxActiveLocations: 1,
            reason: null,
          },
          members: [
            {
              commissionPercentage: null,
              id: 'member-1',
              locations: [],
              planAvailable: true,
              role: 'manager',
              status: 'active',
              user: {
                email: 'maria@example.com',
                fullName: 'María Equipo',
                id: 'user-1',
              },
            },
          ],
          pendingInvitations: [],
          teamEnabled: true,
        },
        isLoading: false,
      };
    }
    return { data: { current: { featureFlags: { team: true } } } };
  },
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

jest.mock('../components/BottomNavigation', () => ({
  appStyles: { screen: {} },
  appTheme: {
    colors: {
      accentDark: '#1C5534',
      accentWash: '#E8F1E9',
      background: '#F7F6F2',
      border: '#E4E2DC',
      surface: '#FFFFFF',
      surfaceMuted: '#F0F0EC',
      text: '#101C2D',
      textMuted: '#667080',
    },
  },
  goldButtonShadow: {},
}));

jest.mock('../features/organization/useCurrentOrganization', () => ({
  useCurrentOrganization: () => ({
    data: { membership: { id: 'owner-member-1', role: 'owner' } },
  }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 'session' }, user: { id: 'owner-1' } }),
}));

jest.mock('../providers/TenantScopeProvider', () => ({
  useTenantScope: () => ({ key: (resource: string) => [resource] }),
}));

describe('CollaboratorPermissionsScreen', () => {
  it('muestra solo los campos requeridos por el nuevo perfil', async () => {
    const view = await render(<CollaboratorPermissionsScreen />);

    expect(view.queryByText('Sucursales asignadas')).toBeNull();
    expect(view.queryByText('Comisión por servicios (%)')).toBeNull();

    fireEvent.press(view.getByLabelText('Recepción'));

    expect(await view.findByText('Sucursales asignadas')).toBeTruthy();
    expect(view.queryByText('Comisión por servicios (%)')).toBeNull();

    fireEvent.press(view.getByLabelText('Profesional'));

    expect(await view.findByText('Sucursales asignadas')).toBeTruthy();
    expect(await view.findByText('Comisión por servicios (%)')).toBeTruthy();
  });
});
