import { useCallback, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Animated, {
  useAnimatedStyle,
} from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';

import { useTabSwipeGesture } from '@/src/hooks/useTabSwipeGesture';
import { Colors } from '@/constants/theme';

interface SwipeableTabScreenProps {
  children: React.ReactNode;
  space: 'parent' | 'child';
  lockedIndices?: number[];
  disabled?: boolean;
}

const PARENT_TAB_ROUTES = [
  '/(tabs)/',
  '/(tabs)/chat',
  '/(tabs)/explore',
  '/(tabs)/profile',
] as const;

const CHILD_TAB_ROUTES = [
  '/(child-tabs)/',
  '/(child-tabs)/explore',
  '/(child-tabs)/profile',
  '/(child-tabs)/chat',
] as const;

function normalizeTabRoute(href: string): string {
  const withoutGroup = href.replace(/^\/\([^/]+\)/, '');
  return withoutGroup.length > 0 ? withoutGroup : '/';
}

export function SwipeableTabScreen({
  children,
  space,
  lockedIndices,
  disabled,
}: SwipeableTabScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const tabRoutes: string[] = space === 'parent' ? [...PARENT_TAB_ROUTES] : [...CHILD_TAB_ROUTES];

  const currentIndex = useMemo(
    () =>
      tabRoutes.findIndex((route) => {
        return pathname === route || pathname === normalizeTabRoute(route);
      }),
    [pathname, tabRoutes],
  );

  const handleNavigate = useCallback(
    (href: string) => {
      router.navigate(href as never);
    },
    [router],
  );

  const { gesture, translateX } = useTabSwipeGesture({
    tabRoutes,
    currentIndex,
    onNavigate: handleNavigate,
    lockedIndices,
    disabled,
    screenWidth,
  });

  const slidingStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateX: translateX.value }],
    backgroundColor: Colors.surface,
  }));

  return (
    <View style={{ flex: 1, overflow: 'hidden' }}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.surface }]} />
          <Animated.View style={slidingStyle}>
            {children}
          </Animated.View>
        </View>
      </GestureDetector>
    </View>
  );
}
