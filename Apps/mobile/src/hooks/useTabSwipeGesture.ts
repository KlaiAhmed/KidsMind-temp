import { useEffect, useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import type { SharedValue } from 'react-native-reanimated';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';

const COMMIT_DISTANCE = 55;
const COMMIT_VELOCITY = 400;
const FOLLOW_FACTOR = 0.25;
const EDGE_RESISTANCE = 0.18;
const EDGE_LIMIT = 28;

const triggerHaptic = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
};

function getTargetIndex(
  currentIndex: number,
  translationX: number,
  routeCount: number,
  lockedIndices: number[],
): number | null {
  'worklet';

  if (translationX === 0) {
    return null;
  }

  const direction = translationX < 0 ? 1 : -1;
  const targetIndex = currentIndex + direction;

  if (targetIndex < 0 || targetIndex >= routeCount || lockedIndices.includes(targetIndex)) {
    return null;
  }

  return targetIndex;
}

export function useTabSwipeGesture(options: {
  tabRoutes: string[];
  currentIndex: number;
  onNavigate: (href: string) => void;
  lockedIndices?: number[];
  disabled?: boolean;
}): {
  gesture: ReturnType<typeof Gesture.Pan>;
  animatedStyle: ReturnType<typeof useAnimatedStyle>;
  translateX: SharedValue<number>;
} {
  const {
    tabRoutes,
    currentIndex,
    onNavigate,
    lockedIndices = [],
    disabled = false,
  } = options;

  const translateX = useSharedValue(0);

  useEffect(() => {
    if (disabled) {
      translateX.value = withTiming(0, { duration: 120 });
    }
  }, [disabled, translateX]);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && currentIndex >= 0)
        .activeOffsetX([-12, 12])
        .failOffsetY([-8, 8])
        .minVelocity(0)
        .onUpdate((event) => {
          const targetIndex = getTargetIndex(
            currentIndex,
            event.translationX,
            tabRoutes.length,
            lockedIndices,
          );

          if (targetIndex !== null) {
            translateX.value = event.translationX * FOLLOW_FACTOR;
            return;
          }

          const sign = event.translationX === 0 ? 0 : event.translationX > 0 ? 1 : -1;
          translateX.value = sign * Math.min(EDGE_LIMIT, Math.abs(event.translationX) * EDGE_RESISTANCE);
        })
        .onEnd((event) => {
          const shouldCommit =
            Math.abs(event.translationX) > COMMIT_DISTANCE ||
            Math.abs(event.velocityX) > COMMIT_VELOCITY;
          const targetIndex = getTargetIndex(
            currentIndex,
            event.translationX,
            tabRoutes.length,
            lockedIndices,
          );

          if (shouldCommit && targetIndex !== null) {
            translateX.value = withSpring(0, { damping: 20, stiffness: 180 });
            runOnJS(onNavigate)(tabRoutes[targetIndex]);
            runOnJS(triggerHaptic)();
            return;
          }

          translateX.value = withSpring(0, { damping: 18, stiffness: 160 });
        }),
    [currentIndex, disabled, lockedIndices, onNavigate, tabRoutes, translateX],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return {
    gesture,
    animatedStyle,
    translateX,
  };
}
