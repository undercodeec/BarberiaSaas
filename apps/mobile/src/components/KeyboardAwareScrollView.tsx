import { forwardRef, useEffect, useRef, type ForwardedRef } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView as NativeScrollView,
  TextInput,
  type ScrollViewProps,
} from 'react-native';

interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  readonly keyboardExtraOffset?: number;
}

let activeKeyboardScroll: symbol | null = null;

export function shouldRevealFocusedInput(
  focusedInput: unknown,
  previousInput: unknown,
) {
  const focusableInput = focusedInput as { isFocused?: () => boolean } | null;
  return Boolean(
    focusableInput &&
    focusedInput !== previousInput &&
    focusableInput.isFocused?.() !== false,
  );
}

function assignRef(
  ref: ForwardedRef<NativeScrollView>,
  value: NativeScrollView | null,
) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * ScrollView común para formularios. Cuando un TextInput recibe foco, lo
 * desplaza sobre el teclado tanto al abrirlo como al cambiar entre campos.
 */
export const KeyboardAwareScrollView = forwardRef<
  NativeScrollView,
  KeyboardAwareScrollViewProps
>(function KeyboardAwareScrollView(
  {
    automaticallyAdjustKeyboardInsets = true,
    keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
    keyboardExtraOffset = 28,
    keyboardShouldPersistTaps = 'handled',
    horizontal = false,
    onTouchStart,
    ...props
  },
  forwardedRef,
) {
  const scrollRef = useRef<NativeScrollView | null>(null);
  const instanceId = useRef(Symbol('keyboard-aware-scroll'));
  const focusedInputRef = useRef<ReturnType<
    typeof TextInput.State.currentlyFocusedInput
  > | null>(null);
  const delayedScrollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealFocusedInput = () => {
    if (horizontal || activeKeyboardScroll !== instanceId.current) return;
    const focusedInput = TextInput.State.currentlyFocusedInput();
    if (!shouldRevealFocusedInput(focusedInput, focusedInputRef.current))
      return;
    focusedInputRef.current = focusedInput;
    scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard?.(
      focusedInput,
      keyboardExtraOffset,
      true,
    );
  };

  useEffect(() => {
    const currentInstanceId = instanceId.current;
    const keyboardShow = Keyboard.addListener('keyboardDidShow', () => {
      focusedInputRef.current = null;
      revealFocusedInput();
    });
    const keyboardHide = Keyboard.addListener('keyboardDidHide', () => {
      focusedInputRef.current = null;
    });

    return () => {
      keyboardShow.remove();
      keyboardHide.remove();
      if (delayedScrollRef.current) clearTimeout(delayedScrollRef.current);
      if (activeKeyboardScroll === currentInstanceId)
        activeKeyboardScroll = null;
    };
  });

  const activateScroll: NonNullable<ScrollViewProps['onTouchStart']> = (
    event,
  ) => {
    onTouchStart?.(event);
    if (horizontal) return;
    activeKeyboardScroll = instanceId.current;
    focusedInputRef.current = null;
    if (delayedScrollRef.current) clearTimeout(delayedScrollRef.current);
    delayedScrollRef.current = setTimeout(revealFocusedInput, 220);
  };

  return (
    <NativeScrollView
      {...props}
      automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
      keyboardDismissMode={keyboardDismissMode}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      horizontal={horizontal}
      onTouchStart={activateScroll}
      ref={(value) => {
        scrollRef.current = value;
        assignRef(forwardedRef, value);
      }}
    />
  );
});
