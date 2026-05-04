import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Spacing } from '@/constants/theme';

const BAR_COUNT = 16;
const MIN_BAR_HEIGHT = 4;
const MAX_BAR_HEIGHT = 40;
const WAVEFORM_BARS = Array.from({ length: BAR_COUNT }, (_, i) => i);

function getBarConfig(index: number) {
  const centerDistance = Math.abs(index - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
  const shape = 1 - centerDistance * 0.5;
  const maxH = MIN_BAR_HEIGHT + (MAX_BAR_HEIGHT - MIN_BAR_HEIGHT) * shape;
  const duration = 380 + (index % 5) * 55;
  const delay = index * 38;
  return { maxH, duration, delay };
}

interface AudioWaveformProps {
  isRecording: boolean;
}

function WaveformBar({ index, isRecording }: { index: number; isRecording: boolean }) {
  const height = useSharedValue(MIN_BAR_HEIGHT);
  const { maxH, duration, delay } = getBarConfig(index);

  useEffect(() => {
    if (isRecording) {
      height.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(maxH,                         { duration,                easing: Easing.inOut(Easing.ease) }),
            withTiming(MIN_BAR_HEIGHT + maxH * 0.15, { duration: duration * 0.65, easing: Easing.inOut(Easing.ease) }),
            withTiming(maxH * 0.75,                  { duration: duration * 0.8,  easing: Easing.inOut(Easing.ease) }),
            withTiming(MIN_BAR_HEIGHT,               { duration: duration * 0.55, easing: Easing.inOut(Easing.ease) }),
          ),
          -1,
          false,
        ),
      );
    } else {
      cancelAnimation(height);
      height.value = withTiming(MIN_BAR_HEIGHT, { duration: 180 });
    }
  }, [isRecording, height, maxH, duration, delay]);

  const animatedStyle = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View style={[styles.bar, animatedStyle]} />;
}

function AudioWaveformComponent({ isRecording }: AudioWaveformProps) {
  return (
    <View style={styles.container} accessibilityRole="progressbar" accessibilityLabel="Recording volume">
      {WAVEFORM_BARS.map((index) => (
        <WaveformBar key={index} index={index} isRecording={isRecording} />
      ))}
    </View>
  );
}

export const AudioWaveform = memo(AudioWaveformComponent);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: MAX_BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  bar: {
    width: 3,
    minHeight: MIN_BAR_HEIGHT,
    borderRadius: 99,
    backgroundColor: Colors.primary,
  },
});