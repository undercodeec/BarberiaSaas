import { runTemporaryShare } from './temporary-export';

describe('runTemporaryShare', () => {
  it('elimina el archivo después de compartirlo', async () => {
    const calls: string[] = [];
    await runTemporaryShare({
      remove: () => calls.push('remove'),
      share: async () => {
        calls.push('share');
      },
      write: () => calls.push('write'),
    });
    expect(calls).toEqual(['write', 'share', 'remove']);
  });

  it('elimina el archivo cuando se cancela o falla el share sheet', async () => {
    const remove = jest.fn();
    await expect(
      runTemporaryShare({
        remove,
        share: jest.fn().mockRejectedValue(new Error('cancelado')),
        write: jest.fn(),
      }),
    ).rejects.toThrow('cancelado');
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
