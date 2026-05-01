import { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Radii, Sizing } from '@/constants/theme';
import { useChildSpaceBoundary } from '@/src/components/spaceSwitch/ChildSpaceBoundary';

export function PINGateHeaderButton() {
  const { requestParentAccess } = useChildSpaceBoundary();
  const insets = useSafeAreaInsets();
  const iconScale = useSharedValue(1);

  const handlePress = useCallback(() => {
    iconScale.value = withSpring(0.85, { damping: 12, stiffness: 400 }, () => {
      iconScale.value = withSpring(1, { damping: 15, stiffness: 200 });
    });

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    requestParentAccess();
  }, [iconScale, requestParentAccess]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <Pressable
      accessibilityLabel="Parent access - requires PIN"
      accessibilityRole="button"
      onPress={handlePress}
      style={({ pressed }) => [
        styles.button,
        { top: insets.top + 8 },
        pressed && styles.buttonPressed,
      ]}
    >
      <Animated.View style={animatedStyle}>
        <MaterialCommunityIcons
          color={Colors.primary}
          name="shield-account-outline"
          size={22}
        />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    right: 16,
    width: Sizing.minTapTarget,
    height: Sizing.minTapTarget,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    elevation: 100,
  },
  buttonPressed: {
    backgroundColor: Colors.surfaceContainerLow,
    transform: [{ scale: 0.95 }],
  },
});