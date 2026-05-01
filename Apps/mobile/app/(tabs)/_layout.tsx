import { Redirect, Tabs, usePathname } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BottomNavContainer } from '@/components/navigation/BottomNavContainer';
import type { BottomNavSlot } from '@/components/navigation/bottomNavConfig';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/theme';

const LOCKED_SLOTS: BottomNavSlot[] = ['history', 'progress', 'controls'];

export default function TabLayout() {
  const { isLoading, isAuthenticated, childProfileStatus, childProfile } = useAuth();
  const pathname = usePathname();

  const noChildProfiles = childProfileStatus === 'missing';

  const lockedSlots = useMemo<Partial<Record<BottomNavSlot, boolean>>>(
    () => {
      if (!noChildProfiles) return {};
      const map: Partial<Record<BottomNavSlot, boolean>> = {};
      for (const slot of LOCKED_SLOTS) {
        map[slot] = true;
      }
      return map;
    },
    [noChildProfiles],
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

  if (noChildProfiles && pathname !== '/') {
    return <Redirect href="/" />;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <BottomNavContainer
          {...props}
          mode="parent"
          ageGroup={childProfile?.ageGroup}
          lockedSlots={lockedSlots}
        />
      )}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneContainerStyle: {
          backgroundColor: Colors.surface,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Overview',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'History',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Progress',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Controls',
        }}
      />
    </Tabs>
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
