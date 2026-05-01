import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, type ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
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
  isLocked?: boolean;
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
  isLocked,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: BottomNavItemProps) {
  const pressProgress = useSharedValue(0);
  const activeProgress = useSharedValue(isActive && !isLocked ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withTiming(isActive && !isLocked ? 1 : 0, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeProgress, isActive, isLocked]);

  const handlePressIn = useCallback(() => {
    if (isDisabled || isLocked) {
      return;
    }

    pressProgress.value = withTiming(1, {
      duration: 90,
      easing: Easing.out(Easing.cubic),
    });
  }, [isDisabled, isLocked, pressProgress]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withTiming(0, {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  }, [pressProgress]);

  const handlePress = useCallback(() => {
    if (isLocked) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      return;
    }
    onPress();
  }, [isLocked, onPress]);

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

  const iconColor = isDisabled
    ? BottomNavTokens.colors.disabled
    : isLocked
      ? BottomNavTokens.colors.inactive
      : isActive
        ? BottomNavTokens.colors.active
        : BottomNavTokens.colors.inactive;

  const iconName = isLocked ? 'lock-outline' : (isActive ? activeIcon : inactiveIcon);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={isLocked ? `${accessibilityLabel ?? label} — locked` : (accessibilityLabel ?? label)}
      accessibilityState={{ selected: isActive && !isLocked, disabled: isDisabled || isLocked }}
      testID={testID}
      disabled={isDisabled}
      onPress={handlePress}
      onLongPress={isLocked ? undefined : onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.pressable}
      hitSlop={8}
    >
      <Animated.View style={[styles.itemShell, isLocked && styles.itemShellLocked, interactionAnimatedStyle]}>
        <View style={styles.content}>
          <AnimatedIcon
            name={iconName}
            color={iconColor}
            size={BottomNavTokens.size.icon}
          />
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.label,
              isLocked && styles.labelLocked,
              {
                fontFamily: isActive && !isLocked
                  ? BottomNavTokens.text.activeFontFamily
                  : BottomNavTokens.text.inactiveFontFamily,
              },
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
  itemShellLocked: {
    opacity: 0.45,
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
  labelLocked: {
    opacity: 0.6,
  },
});
