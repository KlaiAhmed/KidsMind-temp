import { useCallback, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import { GestureDetector } from 'react-native-gesture-handler';

import { useTabSwipeGesture } from '@/src/hooks/useTabSwipeGesture';

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
];

const CHILD_TAB_ROUTES = [
  '/(child-tabs)/',
  '/(child-tabs)/explore',
  '/(child-tabs)/profile',
  '/(child-tabs)/chat',
];

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
  const tabRoutes = space === 'parent' ? PARENT_TAB_ROUTES : CHILD_TAB_ROUTES;

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

  const { gesture, animatedStyle } = useTabSwipeGesture({
    tabRoutes,
    currentIndex,
    onNavigate: handleNavigate,
    lockedIndices,
    disabled,
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.container, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
