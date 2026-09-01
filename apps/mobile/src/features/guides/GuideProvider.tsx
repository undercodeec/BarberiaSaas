/* eslint-disable react-hooks/set-state-in-effect -- The provider must reset and hydrate guide state when the authenticated user changes. */
import type { PropsWithChildren } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '../../providers/AuthProvider';

import { CoachmarkOverlay } from './CoachmarkOverlay';
import {
  DASHBOARD_TOUR_IDS,
  GUIDE_CATALOG,
  GUIDE_SNOOZE_MS,
} from './guide-catalog';
import {
  createEmptyGuideStore,
  getGuideStore,
  saveGuideStore,
} from './guide-storage';
import type {
  GuideAnchorRect,
  GuideDefinition,
  GuideId,
  GuideProgress,
  GuideStore,
} from './guide-types';

type StartGuideOptions = { readonly force?: boolean };

type GuideContextValue = {
  readonly activeGuide: {
    readonly definition: GuideDefinition;
    readonly rect: GuideAnchorRect;
  } | null;
  readonly activeGuideId: GuideId | null;
  readonly advanceGuide: () => void;
  readonly anchorMeasurementTick: number;
  readonly completeGuide: (id: GuideId) => void;
  readonly dismissFirstSteps: () => void;
  readonly dismissGuide: (id: GuideId) => void;
  readonly enableFirstStepsInvitation: () => void;
  readonly firstStepsVisible: boolean;
  readonly isGuideAvailable: (id: GuideId) => boolean;
  readonly refreshAnchors: () => void;
  readonly registerAnchor: (id: string, rect: GuideAnchorRect) => void;
  readonly previousGuide: () => void;
  readonly startGuide: (id: GuideId, options?: StartGuideOptions) => boolean;
  readonly unregisterAnchor: (id: string) => void;
};

const GuideContext = createContext<GuideContextValue | null>(null);

function isDashboardTourGuide(
  id: GuideId,
): id is (typeof DASHBOARD_TOUR_IDS)[number] {
  return DASHBOARD_TOUR_IDS.includes(id as (typeof DASHBOARD_TOUR_IDS)[number]);
}

function isSnoozed(progress: GuideProgress | undefined, now: number) {
  return (
    progress?.status === 'snoozed' &&
    progress.snoozedUntil !== undefined &&
    new Date(progress.snoozedUntil).getTime() > now
  );
}

function firstStepsIsSnoozed(store: GuideStore, now: number) {
  return (
    store.firstStepsSnoozedUntil !== undefined &&
    new Date(store.firstStepsSnoozedUntil).getTime() > now
  );
}

export function GuideProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [store, setStore] = useState<GuideStore>(createEmptyGuideStore);
  const [isReady, setIsReady] = useState(false);
  const [activeGuideId, setActiveGuideId] = useState<GuideId | null>(null);
  const [anchors, setAnchors] = useState<Record<string, GuideAnchorRect>>({});
  const [anchorMeasurementTick, setAnchorMeasurementTick] = useState(0);
  const [visibilityClock, setVisibilityClock] = useState(Date.now);

  useEffect(() => {
    let active = true;
    setIsReady(false);
    setActiveGuideId(null);
    setAnchors({});
    if (!user) {
      setStore(createEmptyGuideStore());
      return () => {
        active = false;
      };
    }
    void getGuideStore(user.id).then((nextStore) => {
      if (!active) return;
      setStore(nextStore);
      setIsReady(true);
    });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!store.firstStepsSnoozedUntil) return;
    const remaining =
      new Date(store.firstStepsSnoozedUntil).getTime() - Date.now();
    if (remaining <= 0) {
      const timer = setTimeout(() => setVisibilityClock(Date.now()), 0);
      return () => clearTimeout(timer);
    }
    const timer = setTimeout(
      () => setVisibilityClock(Date.now()),
      Math.min(remaining, 2_147_000_000),
    );
    return () => clearTimeout(timer);
  }, [store.firstStepsSnoozedUntil]);

  const updateStore = useCallback(
    (update: (current: GuideStore) => GuideStore) => {
      if (!user) return;
      setStore((current) => {
        const next = update(current);
        void saveGuideStore(user.id, next).catch(() => undefined);
        return next;
      });
    },
    [user],
  );

  const isGuideAvailable = useCallback(
    (id: GuideId) => {
      if (!isReady) return false;
      const progress = store.guides[id];
      if (!progress || progress.status === 'unseen') return true;
      if (isSnoozed(progress, Date.now())) return false;
      return progress.status === 'snoozed';
    },
    [isReady, store.guides],
  );

  const startGuide = useCallback(
    (id: GuideId, options?: StartGuideOptions) => {
      if ((!isReady && !options?.force) || !GUIDE_CATALOG[id]) return false;
      if (activeGuideId === id) return true;
      if (activeGuideId && activeGuideId !== id && !options?.force)
        return false;
      if (!options?.force && !isGuideAvailable(id)) return false;
      const now = new Date().toISOString();
      updateStore((current) => ({
        ...current,
        guides: {
          ...current.guides,
          [id]: { lastShownAt: now, status: 'active' },
        },
      }));
      setActiveGuideId(id);
      return true;
    },
    [activeGuideId, isGuideAvailable, isReady, updateStore],
  );

  const completeGuide = useCallback(
    (id: GuideId) => {
      const now = new Date().toISOString();
      updateStore((current) => ({
        ...current,
        guides: {
          ...current.guides,
          [id]: { completedAt: now, lastShownAt: now, status: 'completed' },
        },
      }));
      setActiveGuideId((current) => (current === id ? null : current));
    },
    [updateStore],
  );

  const dismissGuide = useCallback(
    (id: GuideId) => {
      const now = new Date().toISOString();
      updateStore((current) => ({
        ...current,
        guides: {
          ...current.guides,
          ...(isDashboardTourGuide(id)
            ? Object.fromEntries(
                DASHBOARD_TOUR_IDS.map((guideId) => [
                  guideId,
                  { dismissedAt: now, lastShownAt: now, status: 'dismissed' },
                ]),
              )
            : {
                [id]: {
                  dismissedAt: now,
                  lastShownAt: now,
                  status: 'dismissed',
                },
              }),
        },
      }));
      setActiveGuideId((current) => (current === id ? null : current));
    },
    [updateStore],
  );

  const advanceGuide = useCallback(() => {
    if (!activeGuideId) return;
    const nextId = GUIDE_CATALOG[activeGuideId].nextId;
    const now = new Date().toISOString();
    updateStore((current) => ({
      ...current,
      guides: {
        ...current.guides,
        [activeGuideId]: {
          completedAt: now,
          lastShownAt: now,
          status: 'completed',
        },
        ...(nextId
          ? { [nextId]: { lastShownAt: now, status: 'active' as const } }
          : {}),
      },
    }));
    setActiveGuideId(nextId ?? null);
  }, [activeGuideId, updateStore]);

  const previousGuide = useCallback(() => {
    if (!activeGuideId) return;
    const previousId = GUIDE_CATALOG[activeGuideId].previousId;
    if (previousId) setActiveGuideId(previousId);
  }, [activeGuideId]);

  const enableFirstStepsInvitation = useCallback(() => {
    updateStore((current) => ({
      ...current,
      firstStepsInvitationEnabled: true,
      firstStepsSnoozedUntil: undefined,
    }));
  }, [updateStore]);

  const dismissFirstSteps = useCallback(() => {
    updateStore((current) => ({
      ...current,
      firstStepsSnoozedUntil: new Date(
        Date.now() + GUIDE_SNOOZE_MS,
      ).toISOString(),
    }));
  }, [updateStore]);

  const registerAnchor = useCallback((id: string, rect: GuideAnchorRect) => {
    setAnchors((current) => {
      const previous = current[id];
      if (
        previous?.x === rect.x &&
        previous.y === rect.y &&
        previous.width === rect.width &&
        previous.height === rect.height
      )
        return current;
      return { ...current, [id]: rect };
    });
  }, []);

  const unregisterAnchor = useCallback((id: string) => {
    setAnchors((current) => {
      if (!current[id]) return current;
      const rest = { ...current };
      delete rest[id];
      return rest;
    });
  }, []);

  const refreshAnchors = useCallback(() => {
    setAnchorMeasurementTick((current) => current + 1);
  }, []);

  const firstStepsGuidesFinished = [
    'first-booking',
    'share-booking-link',
  ].every((id) => {
    const status = store.guides[id as GuideId]?.status;
    return status === 'completed' || status === 'dismissed';
  });
  const firstStepsVisible =
    isReady &&
    store.firstStepsInvitationEnabled &&
    !firstStepsGuidesFinished &&
    !firstStepsIsSnoozed(store, visibilityClock);
  const activeDefinition = activeGuideId ? GUIDE_CATALOG[activeGuideId] : null;
  const activeAnchor = activeDefinition
    ? anchors[activeDefinition.targetId]
    : null;
  const value = useMemo<GuideContextValue>(
    () => ({
      activeGuide:
        activeDefinition && activeAnchor
          ? { definition: activeDefinition, rect: activeAnchor }
          : null,
      activeGuideId,
      advanceGuide,
      activeAnchor,
      activeDefinition,
      anchorMeasurementTick,
      completeGuide,
      dismissFirstSteps,
      dismissGuide,
      enableFirstStepsInvitation,
      firstStepsVisible,
      isGuideAvailable,
      previousGuide,
      refreshAnchors,
      registerAnchor,
      startGuide,
      unregisterAnchor,
    }),
    [
      activeAnchor,
      activeDefinition,
      activeGuideId,
      advanceGuide,
      anchorMeasurementTick,
      completeGuide,
      dismissFirstSteps,
      dismissGuide,
      enableFirstStepsInvitation,
      firstStepsVisible,
      isGuideAvailable,
      previousGuide,
      refreshAnchors,
      registerAnchor,
      startGuide,
      unregisterAnchor,
    ],
  );

  return (
    <GuideContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {activeDefinition &&
        activeAnchor &&
        !activeDefinition.id.startsWith('booking-link-') ? (
          <CoachmarkOverlay
            definition={activeDefinition}
            onDismiss={() => dismissGuide(activeDefinition.id)}
            onNext={activeDefinition.nextId ? advanceGuide : undefined}
            onPrevious={activeDefinition.previousId ? previousGuide : undefined}
            rect={activeAnchor}
            step={
              isDashboardTourGuide(activeDefinition.id)
                ? DASHBOARD_TOUR_IDS.indexOf(activeDefinition.id) + 1
                : null
            }
            totalSteps={
              isDashboardTourGuide(activeDefinition.id)
                ? DASHBOARD_TOUR_IDS.length
                : null
            }
          />
        ) : null}
      </View>
    </GuideContext.Provider>
  );
}

export function useGuides() {
  const context = useContext(GuideContext);
  if (!context)
    throw new Error('useGuides debe utilizarse dentro de GuideProvider.');
  return context;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
