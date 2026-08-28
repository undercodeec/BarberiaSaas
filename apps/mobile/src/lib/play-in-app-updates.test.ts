import { isPlayInAppUpdateDownloaded } from './play-in-app-updates';

describe('isPlayInAppUpdateDownloaded', () => {
  it('detects the terminal flexible update state', () => {
    expect(
      isPlayInAppUpdateDownloaded({
        availability: 'DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS',
        availableVersionCode: 36,
        bytesDownloaded: 100,
        clientVersionStalenessDays: null,
        flowInProgress: false,
        flexibleAllowed: true,
        installStatus: 'DOWNLOADED',
        totalBytesToDownload: 100,
        updatePriority: 0,
      }),
    ).toBe(true);
  });

  it('does not treat an intermediate state as downloaded', () => {
    expect(
      isPlayInAppUpdateDownloaded({
        availability: 'DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS',
        availableVersionCode: 36,
        bytesDownloaded: 50,
        clientVersionStalenessDays: null,
        flowInProgress: true,
        flexibleAllowed: true,
        installStatus: 'DOWNLOADING',
        totalBytesToDownload: 100,
        updatePriority: 0,
      }),
    ).toBe(false);
  });
});
