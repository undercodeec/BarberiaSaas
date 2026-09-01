export const GUIDE_IDS = [
  'first-booking',
  'share-booking-link',
  'add-service',
  'add-client',
  'dashboard-booking-link',
  'dashboard-banners',
  'dashboard-quick-actions',
  'dashboard-summary',
  'dashboard-notifications',
  'booking-link-qr',
  'booking-link-copy',
  'booking-link-website',
] as const;

export type GuideId = (typeof GUIDE_IDS)[number];

export type GuideStatus =
  'unseen' | 'active' | 'snoozed' | 'dismissed' | 'completed';

export type GuideProgress = {
  readonly completedAt?: string;
  readonly dismissedAt?: string;
  readonly lastShownAt?: string;
  readonly snoozedUntil?: string;
  readonly status: GuideStatus;
};

export type GuideStore = {
  readonly firstStepsSnoozedUntil?: string | undefined;
  readonly firstStepsInvitationEnabled: boolean;
  readonly guides: Partial<Record<GuideId, GuideProgress>>;
  readonly version: 1;
};

export type GuideDefinition = {
  readonly body: string;
  readonly id: GuideId;
  readonly nextId?: GuideId;
  readonly previousId?: GuideId;
  readonly targetId: string;
  readonly title: string;
};

export type GuideAnchorRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};
