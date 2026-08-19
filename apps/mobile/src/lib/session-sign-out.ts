export async function runSessionSignOut(input: {
  readonly clearLocalSession: () => Promise<void>;
  readonly logoutFromApi: () => Promise<void>;
  readonly revokePushToken: () => Promise<unknown>;
}) {
  try {
    await input.revokePushToken().catch(() => undefined);
    await input.logoutFromApi();
  } finally {
    await input.clearLocalSession();
  }
}
