import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons'; // FIXED: was `import type` — erased at runtime, causing MaterialCommunityIcons to be undefined when used as a value on line 62
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomNavTokens } from '@/components/navigation/bottomNavTokens';
import { Colors } from '@/constants/theme';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';
import { showToast } from '@/services/toastClient';
import type { AgeGroup } from '@/types/child';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

type ChildRouteName = 'index' | 'explore' | 'profile' | 'chat';

type ChildTabSlot = 'home' | 'learn' | 'profile' | 'qubie';

interface ChildTabConfig {
  slot: ChildTabSlot;
  routeName: ChildRouteName;
  label: string;
  inactiveIcon: IconName;
  activeIcon: IconName;
}

interface ChildBottomNavContainerProps extends BottomTabBarProps {
  childId: string | null;
  ageGroup?: AgeGroup;
  voiceEnabled?: boolean;
  hidden?: boolean;
}

interface ChildBottomNavItemProps {
  label: string;
  inactiveIcon: IconName;
  activeIcon: IconName;
  isActive: boolean;
  isLocked: boolean;
  isQubie: boolean;
  showLiveDot: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

const LOCKED_TOAST_DEBOUNCE_MS = 5000;

const AnimatedIcon = Animated.createAnimatedComponent(MaterialCommunityIcons);

function resolveQubieIconPair(ageGroup: AgeGroup | undefined, voiceEnabled: boolean): { inactive: IconName; active: IconName } {
  if (ageGroup === '3-6') {
    if (voiceEnabled) {
      return {
        inactive: 'microphone-outline',
        active: 'microphone',
      };
    }

    return {
      inactive: 'chat-processing-outline',
      active: 'chat-processing',
    };
  }

  return {
    inactive: 'robot-outline',
    active: 'robot',
  };
}

function ChildBottomNavItem({
  label,
  inactiveIcon,
  activeIcon,
  isActive,
  isLocked,
  isQubie,
  showLiveDot,
  onPress,
  onLongPress,
  accessibilityLabel,
  testID,
}: ChildBottomNavItemProps) {
  const pressProgress = useSharedValue(0);
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const pulseProgress = useSharedValue(0);
  const bounceScale = useSharedValue(1);
  const liveDotPulse = useSharedValue(0);

  useEffect(() => {
    activeProgress.value = withTiming(isActive ? 1 : 0, {
      duration: 190,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeProgress, isActive]);

  useEffect(() => {
    if (!isQubie) {
      return;
    }

    pulseProgress.value = withRepeat(
      withTiming(1, {
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      true,
    );

    liveDotPulse.value = withRepeat(
      withTiming(1, {
        duration: 900,
        easing: Easing.inOut(Easing.cubic),
      }),
      -1,
      true,
    );
  }, [isQubie, liveDotPulse, pulseProgress]);

  const handlePressIn = () => {
    pressProgress.value = withTiming(1, {
      duration: 90,
      easing: Easing.out(Easing.cubic),
    });
  };

  const handlePressOut = () => {
    pressProgress.value = withTiming(0, {
      duration: 140,
      easing: Easing.out(Easing.cubic),
    });
  };

  const handlePress = () => {
    if (isQubie) {
      bounceScale.value = withSequence(
        withTiming(0.92, {
          duration: 90,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(1.05, {
          duration: 120,
          easing: Easing.out(Easing.cubic),
        }),
        withTiming(1, {
          duration: 120,
          easing: Easing.out(Easing.cubic),
        }),
      );
    }

    onPress();
  };

  const interactionAnimatedStyle = useAnimatedStyle(() => {
    const pressedScale = interpolate(pressProgress.value, [0, 1], [1, 0.92]);
    const pressedOpacity = interpolate(pressProgress.value, [0, 1], [1, 0.7]);
    const baseOpacity = isLocked ? 0.25 : 1;

    return {
      transform: [{ scale: pressedScale * bounceScale.value }],
      opacity: baseOpacity * pressedOpacity,
    };
  }, [isLocked]);

  const tintAnimatedStyle = useAnimatedStyle(() => {
    const inactiveColor = isLocked ? BottomNavTokens.colors.disabled : BottomNavTokens.colors.inactive;
    const activeColor = isLocked ? BottomNavTokens.colors.disabled : BottomNavTokens.colors.active;

    return {
      color: interpolateColor(activeProgress.value, [0, 1], [inactiveColor, activeColor]),
    };
  }, [isLocked]);

  const pulseRingAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: isLocked ? 0.1 : interpolate(pulseProgress.value, [0, 1], [0.2, 0.5]),
      transform: [{ scale: interpolate(pulseProgress.value, [0, 1], [1, 1.24]) }],
    };
  }, [isLocked]);

  const liveDotAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(liveDotPulse.value, [0, 1], [0.35, 1]),
      transform: [{ scale: interpolate(liveDotPulse.value, [0, 1], [0.8, 1.1]) }],
    };
  });

  const iconColor = isLocked
    ? BottomNavTokens.colors.disabled
    : isActive
      ? BottomNavTokens.colors.active
      : BottomNavTokens.colors.inactive;
  const iconName = isLocked ? inactiveIcon : isActive ? activeIcon : inactiveIcon;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: isActive }}
      hitSlop={8}
      onLongPress={onLongPress}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.pressable}
      testID={testID}
    >
      <Animated.View style={[styles.itemShell, interactionAnimatedStyle]}>
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            {isQubie ? <Animated.View style={[styles.qubiePulseRing, pulseRingAnimatedStyle]} /> : null}
            <AnimatedIcon name={iconName} color={iconColor} size={BottomNavTokens.size.icon} />
            {isQubie && showLiveDot ? <Animated.View style={[styles.liveDot, liveDotAnimatedStyle]} /> : null}
          </View>

          <Animated.Text
            numberOfLines={1}
            style={[
              styles.label,
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

export function ChildBottomNavContainer({
  state,
  descriptors,
  navigation,
  childId,
  ageGroup,
  voiceEnabled = false,
  hidden,
}: ChildBottomNavContainerProps) {
  const insets = useSafeAreaInsets();
  const { isSessionActive, nextSessionStartLabel, hasError } = useChildSessionGate(childId);

  const hiddenProgress = useSharedValue(hidden ? 1 : 0);
  const lastToastAtRef = useRef(0);

  useEffect(() => {
    hiddenProgress.value = withTiming(hidden ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [hidden, hiddenProgress]);

  const qubieIconPair = useMemo(() => resolveQubieIconPair(ageGroup, voiceEnabled), [ageGroup, voiceEnabled]);

  const navItems = useMemo<ChildTabConfig[]>(
    () => [
      {
        slot: 'home',
        routeName: 'index',
        label: 'Home',
        inactiveIcon: 'home-outline',
        activeIcon: 'home',
      },
      {
        slot: 'learn',
        routeName: 'explore',
        label: 'Learn',
        inactiveIcon: 'book-open-outline',
        activeIcon: 'book-open',
      },
      {
        slot: 'profile',
        routeName: 'profile',
        label: 'Profile',
        inactiveIcon: 'account-outline',
        activeIcon: 'account',
      },
      {
        slot: 'qubie',
        routeName: 'chat',
        label: 'Qubie',
        inactiveIcon: qubieIconPair.inactive,
        activeIcon: qubieIconPair.active,
      },
    ],
    [qubieIconPair.active, qubieIconPair.inactive],
  );

  const lockedRouteNames = useMemo(() => {
    if (isSessionActive) {
      return new Set<ChildRouteName>();
    }

    return new Set<ChildRouteName>(['explore', 'chat']);
  }, [isSessionActive]);

  const bottomPadding = Math.max(insets.bottom, BottomNavTokens.spacing.minBottomOffset);

  const shellAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(hiddenProgress.value, [0, 1], [1, 0]),
      transform: [{ translateY: interpolate(hiddenProgress.value, [0, 1], [0, bottomPadding + 72]) }],
    };
  }, [bottomPadding]);

  const currentRouteKey = state.routes[state.index]?.key;

  const showLockedToast = () => {
    const now = Date.now();
    if (now - lastToastAtRef.current < LOCKED_TOAST_DEBOUNCE_MS) {
      return;
    }

    lastToastAtRef.current = now;

    const message = hasError || !nextSessionStartLabel
      ? "Your session isn't active right now."
      : `You're outside your session. Come back at ${nextSessionStartLabel}!`;

    // Locked-tab feedback toast is debounced so rapid taps do not stack multiple toasts.
    showToast({
      type: 'info',
      text1: message,
      visibilityTime: 3500,
      autoHide: true,
    });
  };

  const showLiveVoiceDot = Boolean(isSessionActive && ageGroup === '3-6' && voiceEnabled);

  return (
    <View
      style={[
        styles.host,
        {
          paddingHorizontal: BottomNavTokens.spacing.outerHorizontal,
          paddingBottom: bottomPadding,
          paddingTop: BottomNavTokens.spacing.outerTop,
        },
      ]}
      pointerEvents={hidden ? 'none' : 'box-none'}
    >
      <Animated.View style={[styles.container, shellAnimatedStyle]}>
        {navItems.map((item) => {
          const route = state.routes.find((candidate) => candidate.name === item.routeName);

          if (!route) {
            return null;
          }

          const descriptor = descriptors[route.key];
          const isFocused = route.key === currentRouteKey;
          const isLocked = lockedRouteNames.has(item.routeName);

          const onPress = () => {
            if (isLocked) {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
              showLockedToast();
              return;
            }

            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (event.defaultPrevented) {
              return;
            }

            if (item.slot === 'qubie') {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
            } else {
              void Haptics.selectionAsync().catch(() => undefined);
            }

            navigation.navigate(route.name as never, route.params as never);
          };

          const onLongPress = () => {
            if (isLocked) {
              return;
            }

            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <ChildBottomNavItem
              key={item.slot}
              label={item.label}
              inactiveIcon={item.inactiveIcon}
              activeIcon={item.activeIcon}
              isActive={isFocused}
              isLocked={isLocked}
              isQubie={item.slot === 'qubie'}
              showLiveDot={item.slot === 'qubie' && showLiveVoiceDot}
              accessibilityLabel={
                descriptor.options.tabBarAccessibilityLabel
                  ? String(descriptor.options.tabBarAccessibilityLabel)
                  : `${item.label} tab`
              }
              testID={descriptor.options.tabBarButtonTestID}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 50,
    elevation: 50,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: BottomNavTokens.radius.container,
    backgroundColor: BottomNavTokens.colors.container,
    paddingHorizontal: BottomNavTokens.spacing.containerHorizontal,
    paddingVertical: BottomNavTokens.spacing.containerVertical,
    shadowColor: BottomNavTokens.shadow.shadowColor,
    shadowOffset: BottomNavTokens.shadow.shadowOffset,
    shadowOpacity: BottomNavTokens.shadow.shadowOpacity,
    shadowRadius: BottomNavTokens.shadow.shadowRadius,
    elevation: BottomNavTokens.shadow.elevation,
  },
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
  iconWrap: {
    width: 28,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qubiePulseRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.accentAmber,
  },
  liveDot: {
    position: 'absolute',
    top: -1,
    right: 1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#B45309',
  },
  label: {
    fontSize: BottomNavTokens.text.fontSize,
    lineHeight: BottomNavTokens.text.lineHeight,
    textAlign: 'center',
  },
});
