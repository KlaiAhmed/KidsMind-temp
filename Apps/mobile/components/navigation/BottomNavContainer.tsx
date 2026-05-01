import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildBottomNavConfig,
  type BottomNavIconPair,
  type BottomNavMode,
  type BottomNavSlot,
} from '@/components/navigation/bottomNavConfig';
import { BottomNavItem } from '@/components/navigation/BottomNavItem';
import { BottomNavTokens } from '@/components/navigation/bottomNavTokens';
import type { AgeGroup } from '@/types/child';

interface BottomNavContainerProps extends BottomTabBarProps {
  mode: BottomNavMode;
  ageGroup?: AgeGroup;
  hidden?: boolean;
  blockedSlots?: Partial<Record<BottomNavSlot, boolean>>;
  lockedSlots?: Partial<Record<BottomNavSlot, boolean>>;
  iconOverrides?: Partial<Record<BottomNavSlot, BottomNavIconPair>>;
}

export function BottomNavContainer({
  state,
  descriptors,
  navigation,
  mode,
  ageGroup,
  hidden,
  blockedSlots,
  lockedSlots,
  iconOverrides,
}: BottomNavContainerProps) {
  const insets = useSafeAreaInsets();
  const navItems = useMemo(
    () => buildBottomNavConfig({ mode, ageGroup, blockedSlots, iconOverrides }),
    [ageGroup, blockedSlots, iconOverrides, mode]
  );
  const hiddenProgress = useSharedValue(hidden ? 1 : 0);

  useEffect(() => {
    hiddenProgress.value = withTiming(hidden ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [hidden, hiddenProgress]);

  const bottomPadding = Math.max(insets.bottom, BottomNavTokens.spacing.minBottomOffset);

  const shellAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: interpolate(hiddenProgress.value, [0, 1], [1, 0]),
      transform: [{ translateY: interpolate(hiddenProgress.value, [0, 1], [0, bottomPadding + 72]) }],
    };
  }, [bottomPadding]);

  const currentRouteKey = state.routes[state.index]?.key;

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
        const isLocked = Boolean(lockedSlots?.[item.slot]);

        const onPress = () => {
          if (item.disabled || isLocked) {
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

          void Haptics.selectionAsync();
          navigation.navigate(route.name as never, route.params as never);
        };

        const onLongPress = () => {
          if (item.disabled || isLocked) {
            return;
          }

          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <BottomNavItem
            key={item.slot}
            label={item.label}
            inactiveIcon={item.inactiveIcon}
            activeIcon={item.activeIcon}
            isActive={isFocused}
            isDisabled={item.disabled}
            isLocked={isLocked}
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
});
