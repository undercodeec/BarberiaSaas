import type { AppStateStatus } from 'react-native';

export function shouldProtectAppContent(state: AppStateStatus): boolean {
  return state !== 'active';
}
