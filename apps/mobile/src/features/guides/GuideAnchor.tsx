import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';

import { useGuides } from './GuideProvider';

export function GuideAnchor({
  children,
  id,
}: PropsWithChildren<{ readonly id: string }>) {
  const anchorRef = useRef<View>(null);
  const { registerAnchor, unregisterAnchor } = useGuides();
  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return;
        registerAnchor(id, { height, width, x, y });
      });
    });
  }, [id, registerAnchor]);

  useEffect(() => () => unregisterAnchor(id), [id, unregisterAnchor]);

  return (
    <View collapsable={false} onLayout={measure} ref={anchorRef}>
      {children}
    </View>
  );
}
