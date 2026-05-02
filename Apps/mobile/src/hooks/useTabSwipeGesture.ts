import { useMemo } from 'react';
import * as Haptics from 'expo-haptics';
import type { SharedValue } from 'react-native-reanimated';
import {
  useSharedValue,
  withTiming,
  withSpring,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture } from 'react-native-gesture-handler';

const COMMIT_DISTANCE_RATIO = 0.45;
const COMMIT_VELOCITY = 550;
const ELASTIC_MAX = 22;
const ELASTIC_DAMPING = 90;
const EMPTY_LOCKED: number[] = [];

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
  screenWidth: number;
}): {
  gesture: ReturnType<typeof Gesture.Pan>;
  translateX: SharedValue<number>;
} {
  const {
    tabRoutes,
    currentIndex,
    onNavigate,
    lockedIndices = EMPTY_LOCKED,
    disabled = false,
    screenWidth,
  } = options;

  const translateX = useSharedValue(0);
  const elasticX = useSharedValue(0);
  const isDragging = useSharedValue(false);

  const gesture = useMemo(
    () =>
    Gesture.Pan()
      .enabled(!disabled && currentIndex >= 0)
      .activeOffsetX([-20, 20])
      .failOffsetY([-10, 10])
      .minDistance(10)
        .maxPointers(1)
        .onStart(() => {
          'worklet';
          isDragging.value = true;
        })
        .onUpdate((event) => {
          'worklet';
          const targetIndex = getTargetIndex(
            currentIndex,
            event.translationX,
            tabRoutes.length,
            lockedIndices,
          );

          if (targetIndex !== null) {
            translateX.value = event.translationX;
            return;
          }

          const sign = event.translationX === 0 ? 0 : event.translationX > 0 ? 1 : -1;
          elasticX.value = sign * ELASTIC_MAX * (1 - Math.exp(-Math.abs(event.translationX) / ELASTIC_DAMPING));
          translateX.value = elasticX.value;
        })
        .onEnd((event) => {
          'worklet';
          isDragging.value = false;

    const shouldCommit =
      (Math.abs(event.translationX) > screenWidth * COMMIT_DISTANCE_RATIO &&
        Math.abs(event.velocityX) > COMMIT_VELOCITY * 0.4) ||
      Math.abs(event.velocityX) > COMMIT_VELOCITY;
          const targetIndex = getTargetIndex(
            currentIndex,
            event.translationX,
            tabRoutes.length,
            lockedIndices,
          );

        if (shouldCommit && targetIndex !== null) {
          const navHref = tabRoutes[targetIndex];
          translateX.value = withTiming(
            event.translationX > 0 ? screenWidth : -screenWidth,
            { duration: 180, easing: Easing.out(Easing.quad) },
            (finished) => {
              if (finished) {
                translateX.value = 0;
                elasticX.value = 0;
                runOnJS(onNavigate)(navHref);
              }
            },
          );
          runOnJS(triggerHaptic)();
          return;
        }

          translateX.value = withSpring(0, { damping: 22, stiffness: 200, mass: 0.8 });
          elasticX.value = withSpring(0, { damping: 22, stiffness: 200, mass: 0.8 });
        }),
    [currentIndex, disabled, lockedIndices, onNavigate, tabRoutes, screenWidth],
  );

  return { gesture, translateX };
}
