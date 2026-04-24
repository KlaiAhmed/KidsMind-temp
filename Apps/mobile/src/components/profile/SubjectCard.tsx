import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ProfileSkeletonBlock } from '@/src/components/profile/ProfileSkeletonBlock';
import { ProfileColors, profileCardShadow } from '@/src/components/profile/profileTokens';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export interface SubjectCardProps {
  iconName: IconName;
  name: string;
  percentage: number;
  barColor: string;
  percentageColor: string;
  loading?: boolean;
}

export function SubjectCard({
  iconName,
  name,
  percentage,
  barColor,
  percentageColor,
  loading = false,
}: SubjectCardProps) {
  const progressWidth = `${Math.max(0, Math.min(100, Math.round(percentage)))}%` as const;

  return (
    <View style={styles.card}>
      {loading ? (
        <>
          <View style={styles.loadingHeader}>
            <ProfileSkeletonBlock style={styles.loadingIcon} />
            <ProfileSkeletonBlock style={styles.loadingName} />
            <ProfileSkeletonBlock style={styles.loadingPercentage} />
          </View>
          <ProfileSkeletonBlock style={styles.loadingTrack} />
        </>
      ) : (
        <>
          <View style={styles.topRow}>
            <View style={styles.iconTile}>
              <MaterialCommunityIcons color={barColor} name={iconName} size={16} />
            </View>
            <Text style={styles.subjectName}>{name}</Text>
            <Text style={[styles.percentageText, { color: percentageColor }]}>{`${Math.round(percentage)}%`}</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: progressWidth, backgroundColor: barColor }]} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 10,
    backgroundColor: ProfileColors.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    ...profileCardShadow,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: ProfileColors.iconTile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectName: {
    flex: 1,
    marginLeft: 8,
    color: ProfileColors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    lineHeight: 18,
  },
  percentageText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    lineHeight: 18,
  },
  track: {
    height: 6,
    marginTop: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: ProfileColors.progressTrack,
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: ProfileColors.sectionBackground,
  },
  loadingName: {
    flex: 1,
    height: 14,
    marginLeft: 8,
    marginRight: 8,
    borderRadius: 7,
    backgroundColor: ProfileColors.sectionBackground,
  },
  loadingPercentage: {
    width: 30,
    height: 14,
    borderRadius: 7,
    backgroundColor: ProfileColors.sectionBackground,
  },
  loadingTrack: {
    height: 6,
    marginTop: 10,
    borderRadius: 3,
    backgroundColor: ProfileColors.sectionBackground,
  },
});
