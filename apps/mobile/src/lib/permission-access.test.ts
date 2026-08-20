import {
  classifyPermission,
  ensurePermissionAccess,
} from './permission-access';

describe('native permission decisions', () => {
  it('uses an existing grant without opening another system prompt', async () => {
    const request = jest.fn();
    await expect(
      ensurePermissionAccess(
        async () => ({ canAskAgain: true, status: 'granted' }),
        request,
      ),
    ).resolves.toBe('granted');
    expect(request).not.toHaveBeenCalled();
  });

  it('requests a denied permission again when the OS allows it', async () => {
    const request = jest
      .fn()
      .mockResolvedValue({ canAskAgain: true, status: 'granted' });
    await expect(
      ensurePermissionAccess(
        async () => ({ canAskAgain: true, status: 'denied' }),
        request,
      ),
    ).resolves.toBe('granted');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a permanent denial so the UI can offer Settings', () => {
    expect(classifyPermission({ canAskAgain: true, status: 'denied' })).toBe(
      'denied',
    );
    expect(classifyPermission({ canAskAgain: false, status: 'denied' })).toBe(
      'blocked',
    );
    expect(classifyPermission({ granted: true })).toBe('granted');
  });
});
