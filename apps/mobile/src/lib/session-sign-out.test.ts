import { runSessionSignOut } from './session-sign-out';

describe('runSessionSignOut', () => {
  it('revoca push antes del logout y limpia la sesion local', async () => {
    const calls: string[] = [];

    await runSessionSignOut({
      clearLocalSession: async () => {
        calls.push('clear');
      },
      logoutFromApi: async () => {
        calls.push('logout');
      },
      revokePushToken: async () => {
        calls.push('revoke');
      },
    });

    expect(calls).toEqual(['revoke', 'logout', 'clear']);
  });

  it('continua el logout si push falla y limpia local si la API falla', async () => {
    const logoutFromApi = jest.fn().mockRejectedValue(new Error('offline'));
    const clearLocalSession = jest.fn().mockResolvedValue(undefined);

    await expect(
      runSessionSignOut({
        clearLocalSession,
        logoutFromApi,
        revokePushToken: jest.fn().mockRejectedValue(new Error('native')),
      }),
    ).rejects.toThrow('offline');
    expect(logoutFromApi).toHaveBeenCalledTimes(1);
    expect(clearLocalSession).toHaveBeenCalledTimes(1);
  });
});
