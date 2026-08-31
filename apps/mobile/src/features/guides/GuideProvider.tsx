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
import { GUIDE_CATALOG, GUIDE_SNOOZE_MS } from './guide-catalog';
import {
  createEmptyGuideStore,
  getGuideStore,
  saveGuideStore,
} from './guide-storage';
import type {
  GuideAnchorRect,
  GuideId,
  GuideProgress,
  GuideStore,
} from './guide-types';

type StartGuideOptions = { readonly force?: boolean };

type GuideContextValue = {
  readonly completeGuide: (id: GuideId) => void;
  readonly dismissFirstSteps: () => void;
  readonly dismissGuide: (id: GuideId) => void;
  readonly enableFirstStepsInvitation: () => void;
  readonly firstStepsVisible: boolean;
  readonly isGuideAvailable: (id: GuideId) => boolean;
  readonly registerAnchor: (id: string, rect: GuideAnchorRect) => void;
  readonly startGuide: (id: GuideId, options?: StartGuideOptions) => boolean;
  readonly unregisterAnchor: (id: string) => void;
};

const GuideContext = createContext<GuideContextValue | null>(null);

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
      if (!isReady || !GUIDE_CATALOG[id]) return false;
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
    [isGuideAvailable, isReady, updateStore],
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
          [id]: { dismissedAt: now, lastShownAt: now, status: 'dismissed' },
        },
      }));
      setActiveGuideId((current) => (current === id ? null : current));
    },
    [updateStore],
  );

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
      completeGuide,
      dismissFirstSteps,
      dismissGuide,
      enableFirstStepsInvitation,
      firstStepsVisible,
      isGuideAvailable,
      registerAnchor,
      startGuide,
      unregisterAnchor,
    }),
    [
      completeGuide,
      dismissFirstSteps,
      dismissGuide,
      enableFirstStepsInvitation,
      firstStepsVisible,
      isGuideAvailable,
      registerAnchor,
      startGuide,
      unregisterAnchor,
    ],
  );

  return (
    <GuideContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {activeDefinition && activeAnchor ? (
          <CoachmarkOverlay
            definition={activeDefinition}
            onDismiss={() => dismissGuide(activeDefinition.id)}
            rect={activeAnchor}
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
