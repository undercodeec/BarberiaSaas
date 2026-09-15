import { act, render } from '@testing-library/react-native';

import BusinessScheduleScreen from '../../app/(onboarding)/business-schedule';

const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);
const mockSetQueryData = jest.fn();
let mockSaveMutationOptions: {
  readonly onSuccess?: (response: unknown) => Promise<void>;
} | null = null;

jest.mock('@tanstack/react-query', () => ({
  useMutation: (options: typeof mockSaveMutationOptions) => {
    mockSaveMutationOptions = options;
    return { isPending: false, mutate: jest.fn() };
  },
  useQuery: ({ queryKey }: { readonly queryKey: readonly string[] }) => ({
    data: queryKey.includes('business-schedule')
      ? {
          bookingSlotIntervalMinutes: 30,
          days: Array.from({ length: 7 }, (_, weekday) => ({
            endMinute: 1080,
            isOpen: true,
            startMinute: 570,
            weekday,
          })),
          locationId: 'location-1',
        }
      : { locations: [{ id: 'location-1', name: 'Sucursal Centro' }] },
  }),
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    setQueryData: mockSetQueryData,
  }),
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
      accent: '#287247',
      accentDark: '#1C5534',
      background: '#F7F6F2',
      border: '#E4E2DC',
      danger: '#C0392B',
      surface: '#FFFFFF',
      text: '#101C2D',
      textMuted: '#667080',
      white: '#FFFFFF',
    },
  },
  goldButtonShadow: {},
  useNativeLayoutMetrics: () => ({ bottomInset: 0, sheetMaxHeight: 640 }),
}));

jest.mock('../components/RegistrationSelectors', () => ({
  TimeField: () => null,
}));

jest.mock('../lib/api', () => ({
  requireApiClient: () => ({ request: jest.fn() }),
}));

jest.mock('../providers/AuthProvider', () => ({
  useAuth: () => ({ session: { token: 'session' } }),
}));

jest.mock('../providers/TenantScopeProvider', () => ({
  useTenantScope: () => ({
    key: (resource: string, ...details: readonly unknown[]) => [
      'tenant',
      resource,
      ...details,
    ],
    scope: {
      locationId: 'location-1',
      organizationId: 'organization-1',
      role: 'owner',
      userId: 'user-1',
    },
  }),
}));

describe('BusinessScheduleScreen', () => {
  beforeEach(() => {
    mockInvalidateQueries.mockClear();
    mockSaveMutationOptions = null;
  });

  it('refresca las horas disponibles de Agenda al guardar el horario del negocio', async () => {
    const view = await render(<BusinessScheduleScreen />);

    expect(view.getByText('Horario del negocio')).toBeTruthy();
    expect(mockSaveMutationOptions).not.toBeNull();
    const onSuccess = mockSaveMutationOptions?.onSuccess;
    expect(onSuccess).toBeDefined();
    await act(async () => {
      await onSuccess?.({
        bookingSlotIntervalMinutes: 30,
        days: [],
        locationId: 'location-1',
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tenant', 'agenda-availability'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['tenant', 'availability'],
    });
  });
});
