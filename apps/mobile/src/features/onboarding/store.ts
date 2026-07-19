import type {
  LocationOnboardingInput,
  OrganizationOnboardingInput,
} from '@barber-saas/validation';
import { create } from 'zustand';

interface OnboardingState {
  readonly location: LocationOnboardingInput | null;
  readonly organization: OrganizationOnboardingInput | null;
  readonly reset: () => void;
  readonly setLocation: (location: LocationOnboardingInput) => void;
  readonly setOrganization: (organization: OrganizationOnboardingInput) => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  location: null,
  organization: null,
  reset: () => set({ location: null, organization: null }),
  setLocation: (location) => set({ location }),
  setOrganization: (organization) => set({ organization }),
}));
