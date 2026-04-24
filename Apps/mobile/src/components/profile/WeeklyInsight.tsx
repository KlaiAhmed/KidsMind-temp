import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, Text, View } from 'react-native';

import { ProfileSkeletonBlock } from '@/src/components/profile/ProfileSkeletonBlock';
import { ProfileColors } from '@/src/components/profile/profileTokens';

interface WeeklyInsightProps {
  message: string;
  loading?: boolean;
  errorMessage?: string | null;
}

export function WeeklyInsight({
  message,
  loading = false,
  errorMessage,
}: WeeklyInsightProps) {
  const bodyText = errorMessage?.trim() ? errorMessage : message;

  return (
    <View style={styles.section}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons color={ProfileColors.white} name="star-four-points" size={18} />
        </View>

        <View style={styles.copyColumn}>
          <Text style={styles.titleText}>Weekly Insight</Text>
          {loading ? (
            <>
              <ProfileSkeletonBlock style={styles.loadingLineLong} />
              <ProfileSkeletonBlock style={styles.loadingLineLong} />
              <ProfileSkeletonBlock style={styles.loadingLineShort} />
            </>
          ) : (
            <Text style={styles.bodyText}>{bodyText}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: 4,
    paddingBottom: 20,
    backgroundColor: ProfileColors.sectionBackground,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    backgroundColor: ProfileColors.insightCardBackground,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ProfileColors.insightIconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyColumn: {
    flex: 1,
  },
  titleText: {
    color: ProfileColors.textPrimary,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    lineHeight: 18,
  },
  bodyText: {
    marginTop: 4,
    color: ProfileColors.textMuted,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
  },
  loadingLineLong: {
    height: 12,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
  loadingLineShort: {
    width: '72%',
    height: 12,
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.86)',
  },
});
