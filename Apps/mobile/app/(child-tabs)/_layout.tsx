import { Redirect, Tabs, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ChildBottomNavContainer } from '@/components/navigation/ChildBottomNavContainer';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function ChildTabLayout() {
  const {
    isLoading,
    isAuthenticated,
    childProfileStatus,
    childProfile,
    selectChild,
  } = useAuth();

  const params = useLocalSearchParams<{ childId?: string }>();
  const routeChildId = typeof params.childId === 'string' ? params.childId.trim() : '';

  useEffect(() => {
    if (!routeChildId) {
      return;
    }

    selectChild(routeChildId);
  }, [routeChildId, selectChild]);

  if (
    isLoading ||
    (isAuthenticated &&
      (childProfileStatus === 'unknown' ||
        (childProfileStatus === 'exists' && !childProfile)))
  ) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/splash" />;
  }

  if (childProfileStatus === 'missing') {
    return <Redirect href="/(auth)/child-profile-wizard" />;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <ChildBottomNavContainer
          {...props}
          childId={childProfile?.id ?? null}
          ageGroup={childProfile?.ageGroup}
          voiceEnabled={Boolean(childProfile?.rules?.voiceModeEnabled)}
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
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Learn',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Qubie',
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
