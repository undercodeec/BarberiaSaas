import { Linking } from 'react-native';

export const NAVA_APP_STORE_ID = '6807973916';
const APP_STORE_LOOKUP_URL = `https://itunes.apple.com/lookup?id=${NAVA_APP_STORE_ID}&country=ec`;
const APP_STORE_URL = `itms-apps://apps.apple.com/app/id${NAVA_APP_STORE_ID}`;

interface AppStoreLookupResponse {
  readonly results?: readonly { readonly version?: unknown }[];
}

interface FetchResponse {
  readonly ok: boolean;
  json: () => Promise<unknown>;
}

type FetchImplementation = (url: string) => Promise<FetchResponse>;

function numericVersionParts(version: string): number[] | null {
  const parts = version
    .trim()
    .split('.')
    .map((part) => {
      if (!/^\d+$/u.test(part)) return Number.NaN;
      return Number.parseInt(part, 10);
    });
  return parts.length > 0 && parts.every(Number.isFinite) ? parts : null;
}

export function isAppStoreVersionNewer(
  installedVersion: string,
  storeVersion: string,
): boolean {
  const installed = numericVersionParts(installedVersion);
  const published = numericVersionParts(storeVersion);
  if (!installed || !published) return false;

  const segmentCount = Math.max(installed.length, published.length);
  for (let index = 0; index < segmentCount; index += 1) {
    const installedPart = installed[index] ?? 0;
    const publishedPart = published[index] ?? 0;
    if (publishedPart !== installedPart) return publishedPart > installedPart;
  }
  return false;
}

export async function checkForAppStoreUpdate(
  installedVersion: string,
  fetchImplementation: FetchImplementation = fetch,
): Promise<boolean> {
  const response = await fetchImplementation(APP_STORE_LOOKUP_URL);
  if (!response.ok) return false;
  const payload = (await response.json()) as AppStoreLookupResponse;
  const publishedVersion = payload.results?.[0]?.version;
  return (
    typeof publishedVersion === 'string' &&
    isAppStoreVersionNewer(installedVersion, publishedVersion)
  );
}

export async function openAppStoreUpdate(): Promise<boolean> {
  if (!(await Linking.canOpenURL(APP_STORE_URL))) return false;
  await Linking.openURL(APP_STORE_URL);
  return true;
}
