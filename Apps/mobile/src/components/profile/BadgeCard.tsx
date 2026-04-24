import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProfileSkeletonBlock } from '@/src/components/profile/ProfileSkeletonBlock';
import { ProfileColors, profileCardShadow } from '@/src/components/profile/profileTokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface BadgeCardProps {
  label: string;
  iconName: IconName;
  backgroundColor: string;
  iconColor?: string;
  onPress: () => void;
  loading?: boolean;
  faded?: boolean;
}

export function BadgeCard({
  label,
  iconName,
  backgroundColor,
  iconColor = ProfileColors.textPrimary,
  onPress,
  loading = false,
  faded = false,
}: BadgeCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading ? 'Badge loading' : label}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        faded ? styles.fadedCard : null,
        pressed ? styles.cardPressed : null,
      ]}
    >
      {loading ? (
        <>
          <ProfileSkeletonBlock style={styles.loadingCircle} />
          <ProfileSkeletonBlock style={styles.loadingLineShort} />
          <ProfileSkeletonBlock style={styles.loadingLineLong} />
        </>
      ) : (
        <>
          <View style={[styles.iconCircle, { backgroundColor }]}>
            <MaterialCommunityIcons color={iconColor} name={iconName} size={20} />
          </View>
          <Text numberOfLines={2} style={styles.labelText}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 76,
    minHeight: 92,
    borderRadius: 10,
    backgroundColor: ProfileColors.white,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...profileCardShadow,
  },
  fadedCard: {
    opacity: 0.72,
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelText: {
    marginTop: 6,
    color: ProfileColors.textMuted,
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    lineHeight: 13,
    textAlign: 'center',
  },
  loadingCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ProfileColors.sectionBackground,
  },
  loadingLineShort: {
    width: 42,
    height: 10,
    marginTop: 8,
    borderRadius: 5,
    backgroundColor: ProfileColors.sectionBackground,
  },
  loadingLineLong: {
    width: 54,
    height: 10,
    marginTop: 4,
    borderRadius: 5,
    backgroundColor: ProfileColors.sectionBackground,
  },
});
