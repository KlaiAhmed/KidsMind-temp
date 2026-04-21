import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { BottomNavTokens } from '@/components/navigation/bottomNavTokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface BottomNavItemProps {
  label: string;
  inactiveIcon: IconName;
  activeIcon: IconName;
  isActive: boolean;
  isDisabled?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

export function BottomNavItem({
  label,
  inactiveIcon,
  activeIcon,
  isActive,
  isDisabled,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: BottomNavItemProps) {
  const pressProgress = useSharedValue(0);
  const activeProgress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeProgress, isActive]);

  const handlePressIn = useCallback(() => {
    if (isDisabled) {
      return;
    }

    pressProgress.value = withTiming(1, {
      duration: 90,
      easing: Easing.out(Easing.cubic),
    });
  }, [isDisabled, pressProgress]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withTiming(0, {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [pressProgress]);

  const interactionAnimatedStyle = useAnimatedStyle(() => {
    const pressedScale = interpolate(pressProgress.value, [0, 1], [1, 0.92]);
    const pressedOpacity = interpolate(pressProgress.value, [0, 1], [1, BottomNavTokens.opacity.pressed]);

    return {
      transform: [{ scale: pressedScale }],
      opacity: isDisabled ? BottomNavTokens.opacity.disabled : pressedOpacity,
    };
  }, [isDisabled]);

  const tintAnimatedStyle = useAnimatedStyle(() => {
    const inactiveColor = isDisabled ? BottomNavTokens.colors.disabled : BottomNavTokens.colors.inactive;
    const activeColor = isDisabled ? BottomNavTokens.colors.disabled : BottomNavTokens.colors.active;

    return {
      color: interpolateColor(activeProgress.value, [0, 1], [inactiveColor, activeColor]),
    };
  }, [isDisabled]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isActive, disabled: isDisabled }}
      testID={testID}
      disabled={isDisabled}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.pressable}
      hitSlop={8}
    >
      <Animated.View style={[styles.itemShell, interactionAnimatedStyle]}>
        <View style={styles.content}>
          <AnimatedIcon
            name={isActive ? activeIcon : inactiveIcon}
            size={BottomNavTokens.size.icon}
            style={tintAnimatedStyle}
          />
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.label,
              { fontFamily: isActive ? BottomNavTokens.text.activeFontFamily : BottomNavTokens.text.inactiveFontFamily },
              tintAnimatedStyle,
            ]}
          >
            {label}
          </Animated.Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flex: 1,
    minHeight: BottomNavTokens.size.minTapTarget,
  },
  itemShell: {
    flex: 1,
    minHeight: BottomNavTokens.size.minTapTarget,
    marginHorizontal: BottomNavTokens.spacing.itemHorizontal,
    paddingVertical: BottomNavTokens.spacing.itemVertical,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: BottomNavTokens.spacing.iconLabelGap,
    paddingHorizontal: BottomNavTokens.spacing.itemHorizontal,
  },
  label: {
    fontSize: BottomNavTokens.text.fontSize,
    lineHeight: BottomNavTokens.text.lineHeight,
    textAlign: 'center',
  },
});
