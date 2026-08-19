import { runTenantTransition } from './tenant-transition';

describe('runTenantTransition', () => {
  it('elimina datos anteriores antes y después de cambiar de tenant', async () => {
    const calls: string[] = [];
    await expect(
      runTenantTransition(
        {
          cancelQueries: async () => {
            calls.push('cancel');
          },
          clear: () => calls.push('clear'),
        },
        async () => {
          calls.push('transition');
          return 'ok';
        },
      ),
    ).resolves.toBe('ok');
    expect(calls).toEqual(['cancel', 'clear', 'transition', 'clear']);
  });

  it('también elimina la caché si la transición falla', async () => {
    const clear = jest.fn();
    await expect(
      runTenantTransition(
        { cancelQueries: jest.fn().mockResolvedValue(undefined), clear },
        jest.fn().mockRejectedValue(new Error('falló')),
      ),
    ).rejects.toThrow('falló');
    expect(clear).toHaveBeenCalledTimes(2);
  });
});
