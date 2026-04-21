import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { BottomNavContainer } from '@/components/navigation/BottomNavContainer';
import { useAuth } from '@/contexts/AuthContext';
import { Colors } from '@/constants/theme';

export default function TabLayout() {
  const { isLoading, isAuthenticated, childProfile } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/splash" />;
  }

  if (!childProfile) {
    return <Redirect href="/(auth)/child-profile-wizard" />;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <BottomNavContainer
          {...props}
          mode="parent"
          ageGroup={childProfile.ageGroup}
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
          title: 'Insights',
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Curriculum',
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
