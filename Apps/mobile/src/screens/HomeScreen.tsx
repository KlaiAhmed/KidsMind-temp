import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { useChildProfile } from '@/hooks/useChildProfile';
import { BadgeNotification } from '@/src/components/BadgeNotification';
import { FeaturedLesson } from '@/src/components/FeaturedLesson';
import { HomeHeader } from '@/src/components/HomeHeader';
import { ProgressCard } from '@/src/components/ProgressCard';
import { StreakCard } from '@/src/components/StreakCard';
import { SubjectGrid, type SubjectGridItem } from '@/src/components/SubjectGrid';

const SUBJECTS: SubjectGridItem[] = [
  {
    name: 'Maths',
    lessonCount: '8 Lessons done',
    iconName: 'calculator-variant-outline',
    iconColor: '#4338CA',
    iconBackground: '#EEF2FF',
  },
  {
    name: 'Science',
    lessonCount: '6 Lessons done',
    iconName: 'microscope',
    iconColor: '#059669',
    iconBackground: '#ECFDF5',
  },
  {
    name: 'English',
    lessonCount: '5 Lessons done',
    iconName: 'book-open-variant',
    iconColor: '#D97706',
    iconBackground: '#FFFBEB',
  },
  {
    name: 'French',
    lessonCount: '4 Lessons done',
    iconName: 'translate',
    iconColor: '#7C3AED',
    iconBackground: '#F5F3FF',
  },
  {
    name: 'History',
    lessonCount: '3 Lessons done',
    iconName: 'history',
    iconColor: '#92400E',
    iconBackground: '#FEF3C7',
  },
  {
    name: 'Art',
    lessonCount: '7 Lessons done',
    iconName: 'palette-outline',
    iconColor: '#EC4899',
    iconBackground: '#FDF2F8',
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const { profile, getAvatarById } = useChildProfile();
  const [showBadgeBanner, setShowBadgeBanner] = useState(true);

  const childName = profile?.nickname?.trim() || profile?.name?.trim() || 'Little Explorer';
  const avatarSource = getAvatarById(profile?.avatarId).asset;
  const currentXP = profile?.xp ?? 1250;
  const level = profile?.level ?? 5;
  const maxXP = profile?.xpToNextLevel ?? 1500;
  const streakDays = profile?.streakDays ?? 5;

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        style={styles.scrollView}
      >
        <HomeHeader avatarSource={avatarSource} childName={childName} />

        {showBadgeBanner ? <BadgeNotification onDismiss={() => setShowBadgeBanner(false)} /> : null}

        <ProgressCard currentXP={currentXP} level={level} maxXP={maxXP} />

        <StreakCard days={streakDays} />

        <FeaturedLesson
          category="SCIENCE • SPACE"
          description="You're halfway through! Discover why Saturn has those beautiful rings today."
          onTalkToKidsMind={() => router.push('/(tabs)/chat' as never)}
          title="Solar Systems"
        />

        <SubjectGrid subjects={SUBJECTS} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#EEEEF6',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#EEEEF6',
  },
  contentContainer: {
    paddingBottom: 32,
  },
});
