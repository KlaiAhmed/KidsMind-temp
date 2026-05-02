import {
  useAnimatedKeyboard,
  useDerivedValue,
  type SharedValue,
} from 'react-native-reanimated';

const KEYBOARD_GAP = 12;

export function useKeyboardHeight(bottomInset: number = 0): {
  keyboardOffset: SharedValue<number>;
  isKeyboardVisible: SharedValue<number>;
} {
  const keyboard = useAnimatedKeyboard();
  const keyboardOffset = useDerivedValue(() => {
    return Math.max(keyboard.height.value - bottomInset + KEYBOARD_GAP, 0);
  }, [bottomInset]);
  const isKeyboardVisible = useDerivedValue<number>(() => {
    return keyboard.height.value > 0 ? 1 : 0;
  });

  return { keyboardOffset, isKeyboardVisible };
}
