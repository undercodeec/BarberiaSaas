import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';

export interface PlayInAppUpdateState {
  readonly availability: string;
  readonly availableVersionCode: number | null;
  readonly bytesDownloaded: number;
  readonly clientVersionStalenessDays: number | null;
  readonly flowInProgress: boolean;
  readonly flexibleAllowed: boolean;
  readonly installStatus: string;
  readonly totalBytesToDownload: number;
  readonly updatePriority: number | null;
}

interface PlayInAppUpdatesNativeModule {
  checkForUpdate: () => Promise<PlayInAppUpdateState>;
  completeUpdate: () => Promise<void>;
}

const unavailableState: PlayInAppUpdateState = {
  availability: 'UNKNOWN',
  availableVersionCode: null,
  bytesDownloaded: 0,
  clientVersionStalenessDays: null,
  flowInProgress: false,
  flexibleAllowed: false,
  installStatus: 'UNKNOWN',
  totalBytesToDownload: 0,
  updatePriority: null,
};

const nativeModule =
  Platform.OS === 'android'
    ? (NativeModules.NavaPlayInAppUpdates as
        | PlayInAppUpdatesNativeModule
        | undefined)
    : undefined;

export function isPlayInAppUpdateDownloaded(
  state: PlayInAppUpdateState,
): boolean {
  return state.installStatus === 'DOWNLOADED';
}

export function subscribeToPlayInAppUpdates(
  listener: (state: PlayInAppUpdateState) => void,
): { remove: () => void } {
  if (Platform.OS !== 'android') return { remove: () => undefined };
  return DeviceEventEmitter.addListener('navaPlayInAppUpdates', listener);
}

export function checkForPlayInAppUpdate(): Promise<PlayInAppUpdateState> {
  if (!nativeModule) return Promise.resolve(unavailableState);
  return nativeModule.checkForUpdate();
}

export function completePlayInAppUpdate(): Promise<void> {
  if (!nativeModule) return Promise.resolve();
  return nativeModule.completeUpdate();
}
