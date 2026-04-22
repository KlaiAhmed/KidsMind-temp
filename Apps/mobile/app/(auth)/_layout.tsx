import { Redirect, Stack, useSegments } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';

export default function AuthLayout() {
  const { isLoading, isAuthenticated, childProfile, user } = useAuth();
  const segments = useSegments();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const inSetupPin = segments[1] === 'setup-pin';
  const inChildProfileWizard = segments[1] === 'child-profile-wizard';
  const hasPinConfigured = Boolean(user?.pinConfigured);

  if (isAuthenticated) {
    if (!hasPinConfigured && !inSetupPin) {
      return <Redirect href="/(auth)/setup-pin" />;
    }

    if (hasPinConfigured && !childProfile && !inChildProfileWizard) {
      return <Redirect href="/(auth)/child-profile-wizard" />;
    }

    if (childProfile) {
      return <Redirect href="/(tabs)" />;
    }
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="setup-pin" />
      <Stack.Screen name="child-profile-wizard" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
    </Stack>
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