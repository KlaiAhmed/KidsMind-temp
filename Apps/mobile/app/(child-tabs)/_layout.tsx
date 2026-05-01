import { Redirect, Tabs, useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  Platform,
  StyleSheet,
  View,
  type AppStateStatus,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import { ChildBottomNavContainer } from '@/components/navigation/ChildBottomNavContainer';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';
import { verifyParentPin } from '@/services/parentAccessService';
import { showToast } from '@/services/toastClient';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { ChildSpaceBoundaryProvider } from '@/src/components/spaceSwitch/ChildSpaceBoundary';
import { ParentPINGate } from '@/src/components/spaceSwitch/ParentPINGate';
import { PINGateHeaderButton } from '@/src/components/spaceSwitch/PINGateHeaderButton';

const childTabScreenOptions = {
  headerShown: false,
  // SECURITY: Disable iOS swipe-back gesture to prevent navigation out of child space.
  gestureEnabled: false,
  gestureDirection: 'horizontal' as const,
  animation: Platform.select({
    ios: 'fade' as const,
    android: 'fade' as const,
  }),
  tabBarHideOnKeyboard: true,
  sceneContainerStyle: {
    backgroundColor: Colors.surface,
  },
};

function getLockedChildTabOptions(title: string) {
  return {
    title,
    headerShown: false,
    // SECURITY: Disable gestures for all child screens.
    gestureEnabled: false,
  };
}

const hiddenBadgesScreenOptions = {
  href: null,
  title: 'Badges',
  // SECURITY: Hidden child routes still inherit the sealed child-space navigator.
  gestureEnabled: false,
};

export default function ChildTabLayout() {
  const router = useRouter();
  const pathname = usePathname();
  const showPinGate = !pathname.includes('/chat');

  const {
    isLoading,
    isAuthenticated,
    childProfileStatus,
    childProfile,
    childProfiles,
    selectedChildId,
    selectChild,
    user,
  } = useAuth();

  const { gateState } = useChildSessionGate(childProfile?.id ?? null, {
    weekSchedule: childProfile?.rules?.weekSchedule ?? null,
    todayUsageSeconds: childProfile?.todayUsageSeconds,
    timeZone: childProfile?.timezone ?? null,
  });

  const params = useLocalSearchParams<{ childId?: string }>();
  const routeChildId = typeof params.childId === 'string' ? params.childId.trim() : '';
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastKnownChildIdRef = useRef<string | null>(routeChildId || selectedChildId || childProfile?.id || null);
  const [isParentPinGateOpen, setIsParentPinGateOpen] = useState(false);

  useEffect(() => {
    if (!routeChildId) {
      return;
    }

    selectChild(routeChildId);
  }, [childProfiles.length, routeChildId, selectChild]);

  useEffect(() => {
    const activeChildId = selectedChildId ?? childProfile?.id ?? routeChildId;

    if (activeChildId) {
      lastKnownChildIdRef.current = activeChildId;
    }
  }, [childProfile?.id, routeChildId, selectedChildId]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // SECURITY: Hardware back is suppressed inside child space so history cannot reveal parent routes.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      return true;
    });

    return () => {
      backHandler.remove();
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackgrounded = appStateRef.current === 'background' || appStateRef.current === 'inactive';
      appStateRef.current = nextState;

      if (nextState !== 'active' || !wasBackgrounded) {
        return;
      }

      const activeChildId = selectedChildId ?? childProfile?.id ?? routeChildId ?? lastKnownChildIdRef.current;

      if (!activeChildId) {
        return;
      }

      lastKnownChildIdRef.current = activeChildId;

      if (selectedChildId) {
        return;
      }

      // SECURITY: Foregrounding with a cleared child selection re-seals the app in child space, never parent tabs.
      selectChild(activeChildId);
      router.replace(`/child-home?childId=${encodeURIComponent(activeChildId)}` as never);
    });

    return () => {
      subscription.remove();
    };
  }, [childProfile?.id, routeChildId, router, selectChild, selectedChildId]);

  const requestParentAccess = useCallback(() => {
    // SECURITY: Child -> parent is the only direction that requires PIN verification.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    if (!user?.pinConfigured) {
      showToast({
        type: 'error',
        text1: 'PIN not set',
        text2: 'Please set up your parent PIN first.',
        visibilityTime: 3000,
      });
      return;
    }

    setIsParentPinGateOpen(true);
  }, [user?.pinConfigured]);

  const handleParentPinSuccess = useCallback(() => {
    setIsParentPinGateOpen(false);
    router.replace('/(tabs)' as never);
  }, [router]);

  const handleParentPinCancel = useCallback(() => {
    setIsParentPinGateOpen(false);
  }, []);

  const handleVerifyParentPin = useCallback((pin: string): Promise<boolean> => verifyParentPin(pin), []);

  const boundaryValue = useMemo(
    () => ({
      isParentAccessGateVisible: isParentPinGateOpen,
      requestParentAccess,
    }),
    [isParentPinGateOpen, requestParentAccess],
  );

  if (isLoading || (isAuthenticated && childProfileStatus === 'unknown')) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/splash" />;
  }

  if (childProfileStatus === 'missing' && !childProfile) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <ChildSpaceBoundaryProvider value={boundaryValue}>
      <ErrorBoundary resetKey={pathname}>
        <Tabs
          backBehavior="none"
          screenOptions={childTabScreenOptions}
          tabBar={(props) => (
            <ChildBottomNavContainer
              {...props}
              childId={childProfile?.id ?? null}
              ageGroup={childProfile?.ageGroup}
              voiceEnabled={Boolean(childProfile?.rules?.voiceModeEnabled)}
              gateState={gateState}
            />
          )}
        >
          <Tabs.Screen
            name="index"
            options={getLockedChildTabOptions('Home')}
          />
          <Tabs.Screen
            name="explore"
            options={getLockedChildTabOptions('Learn')}
          />
          <Tabs.Screen
            name="profile"
            options={getLockedChildTabOptions('Profile')}
          />
          <Tabs.Screen
            name="chat"
            options={getLockedChildTabOptions('Qubie')}
          />
          <Tabs.Screen
            name="badges"
            options={hiddenBadgesScreenOptions}
          />
        </Tabs>
      </ErrorBoundary>

    {showPinGate && <PINGateHeaderButton />}

      <ParentPINGate
        onCancel={handleParentPinCancel}
        onSuccess={handleParentPinSuccess}
        subtitle="Enter your PIN to access parent controls"
        title="Parent Access"
        verifyPin={handleVerifyParentPin}
        visible={isParentPinGateOpen}
      />
    </ChildSpaceBoundaryProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
});
