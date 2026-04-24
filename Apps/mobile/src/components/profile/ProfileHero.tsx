import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ImageSourcePropType } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { ProfileSkeletonBlock } from '@/src/components/profile/ProfileSkeletonBlock';
import { StatCard, type StatCardProps } from '@/src/components/profile/StatCard';
import { ProfileColors } from '@/src/components/profile/profileTokens';

interface ProfileHeroProps {
  avatarSource: ImageSourcePropType;
  level: number;
  title: string;
  subtitle: string;
  stats: StatCardProps[];
  loading?: boolean;
}

export function ProfileHero({
  avatarSource,
  level,
  title,
  subtitle,
  stats,
  loading = false,
}: ProfileHeroProps) {
  return (
    <LinearGradient colors={[ProfileColors.heroTop, ProfileColors.heroBottom]} style={styles.container}>
      {loading ? (
        <>
          <ProfileSkeletonBlock style={styles.loadingAvatarRing} />
          <ProfileSkeletonBlock style={styles.loadingLevelPill} />
          <ProfileSkeletonBlock style={styles.loadingTitle} />
          <ProfileSkeletonBlock style={styles.loadingSubtitle} />
          <View style={styles.statsGrid}>
            {Array.from({ length: 4 }).map((_, index) => (
              <StatCard
                key={`loading-stat-${index}`}
                dashed={index === 1}
                iconColor={ProfileColors.statPurple}
                iconName="star-four-points"
                label="Loading"
                loading
                onPress={() => undefined}
                value="0"
              />
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={styles.avatarRing}>
            <Image contentFit="cover" source={avatarSource} style={styles.avatarImage} />
          </View>

          <View style={styles.levelPill}>
            <Text allowFontScaling={false} style={styles.levelPillText}>
              {`LVL ${level}`}
            </Text>
          </View>

          <Text style={styles.titleText}>{title}</Text>
          <Text style={styles.subtitleText}>{subtitle}</Text>

          <View style={styles.statsGrid}>
            {stats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </View>
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 20,
    paddingHorizontal: 16,
    paddingBottom: 24,
    alignItems: 'center',
  },
  avatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: ProfileColors.levelGold,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  levelPill: {
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 20,
    backgroundColor: ProfileColors.levelGold,
    paddingHorizontal: 12,
    paddingVertical: 3,
  },
  levelPillText: {
    color: ProfileColors.levelGoldText,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 11,
    lineHeight: 14,
  },
  titleText: {
    color: ProfileColors.white,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  subtitleText: {
    marginTop: 4,
    marginBottom: 16,
    color: 'rgba(255,255,255,0.75)',
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  statsGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
    columnGap: 8,
  },
  loadingAvatarRing: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  loadingLevelPill: {
    width: 58,
    height: 22,
    marginTop: 8,
    marginBottom: 10,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  loadingTitle: {
    width: 156,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  loadingSubtitle: {
    width: 188,
    height: 14,
    marginTop: 8,
    marginBottom: 16,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});
