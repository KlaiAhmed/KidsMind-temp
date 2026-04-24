import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileSkeletonBlock } from '@/src/components/profile/ProfileSkeletonBlock';
import { ProfileColors, profileCardShadow } from '@/src/components/profile/profileTokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface StatCardProps {
  iconName: IconName;
  iconColor: string;
  value: string;
  label: string;
  dashed?: boolean;
  onPress: () => void;
  loading?: boolean;
}

export function StatCard({
  iconName,
  iconColor,
  value,
  label,
  dashed = false,
  onPress,
  loading = false,
}: StatCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? `${label} loading` : `${label}: ${value}`}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        dashed ? styles.dashedCard : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {loading ? (
        <View style={styles.loadingState}>
          <ProfileSkeletonBlock style={styles.loadingIcon} />
          <ProfileSkeletonBlock style={styles.loadingValue} />
          <ProfileSkeletonBlock style={styles.loadingLabel} />
        </View>
      ) : (
        <>
          <MaterialCommunityIcons color={iconColor} name={iconName} size={18} />
          <Text allowFontScaling={false} style={styles.valueText}>
            {value}
          </Text>
          <Text numberOfLines={1} style={styles.labelText}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexBasis: '48.5%',
    minHeight: 78,
    borderRadius: 12,
    backgroundColor: ProfileColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 3,
    ...profileCardShadow,
  },
  dashedCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ProfileColors.dashedBorder,
  },
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },
  valueText: {
    color: ProfileColors.textPrimary,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    lineHeight: 24,
  },
  labelText: {
    color: ProfileColors.textSecondary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  loadingState: {
    alignItems: 'center',
    gap: 6,
  },
  loadingIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: ProfileColors.heroOverlay,
  },
  loadingValue: {
    width: 40,
    height: 18,
    borderRadius: 9,
    backgroundColor: ProfileColors.heroOverlay,
  },
  loadingLabel: {
    width: 56,
    height: 10,
    borderRadius: 5,
    backgroundColor: ProfileColors.heroOverlay,
  },
});
