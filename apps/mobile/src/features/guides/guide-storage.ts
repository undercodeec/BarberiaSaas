import * as SecureStore from 'expo-secure-store';

import type { GuideStore } from './guide-types';

const STORAGE_PREFIX = 'nava.guide.v1';

export function createEmptyGuideStore(): GuideStore {
  return { firstStepsInvitationEnabled: false, guides: {}, version: 1 };
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}.${userId}`;
}

export async function getGuideStore(userId: string): Promise<GuideStore> {
  try {
    const value = await SecureStore.getItemAsync(storageKey(userId));
    if (!value) return createEmptyGuideStore();
    const parsed = JSON.parse(value) as Partial<GuideStore>;
    if (parsed.version !== 1 || typeof parsed.guides !== 'object')
      return createEmptyGuideStore();
    return {
      firstStepsInvitationEnabled: parsed.firstStepsInvitationEnabled === true,
      firstStepsSnoozedUntil:
        typeof parsed.firstStepsSnoozedUntil === 'string'
          ? parsed.firstStepsSnoozedUntil
          : undefined,
      guides: parsed.guides ?? {},
      version: 1,
    };
  } catch {
    return createEmptyGuideStore();
  }
}

export async function saveGuideStore(userId: string, store: GuideStore) {
  await SecureStore.setItemAsync(storageKey(userId), JSON.stringify(store));
}
