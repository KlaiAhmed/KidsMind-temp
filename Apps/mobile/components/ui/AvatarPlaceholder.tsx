import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/theme';

export function AvatarPlaceholder({ size = 48, style }: { size?: number; style?: ViewStyle }) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: Colors.surfaceContainerHigh,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="account" size={Math.round(size * 0.55)} color={Colors.textTertiary} />
    </View>
  );
}

const styles = StyleSheet.create({});

export default AvatarPlaceholder;
