import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import {
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';

import { useGuides } from './GuideProvider';

export function GuideAnchor({
  children,
  id,
  onAnchorLayout,
  style,
}: PropsWithChildren<{
  readonly id: string;
  readonly onAnchorLayout?: (layout: LayoutRectangle) => void;
  readonly style?: StyleProp<ViewStyle>;
}>) {
  const anchorRef = useRef<View>(null);
  const { anchorMeasurementTick, registerAnchor, unregisterAnchor } =
    useGuides();
  const measure = useCallback(() => {
    requestAnimationFrame(() => {
      anchorRef.current?.measureInWindow((x, y, width, height) => {
        if (width <= 0 || height <= 0) return;
        registerAnchor(id, { height, width, x, y });
      });
    });
  }, [id, registerAnchor]);

  useEffect(() => () => unregisterAnchor(id), [id, unregisterAnchor]);

  useEffect(() => {
    measure();
  }, [anchorMeasurementTick, measure]);

  return (
    <View
      collapsable={false}
      onLayout={(event) => {
        onAnchorLayout?.(event.nativeEvent.layout);
        measure();
      }}
      ref={anchorRef}
      style={style}
    >
      {children}
    </View>
  );
}
