import { StyleSheet, Text, View } from 'react-native';

import { SubjectCard, type SubjectCardProps } from '@/src/components/profile/SubjectCard';
import { ProfileColors } from '@/src/components/profile/profileTokens';

interface SubjectProgressProps {
  subjects: SubjectCardProps[];
  loading?: boolean;
}

export function SubjectProgress({ subjects, loading = false }: SubjectProgressProps) {
  const items = loading
    ? Array.from({ length: 3 }).map((_, index) => ({
        iconName: 'book-open-variant' as const,
        name: `loading-${index}`,
        percentage: 0,
        barColor: ProfileColors.xpBar,
        percentageColor: ProfileColors.xpBar,
        loading: true,
      }))
    : subjects;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.headerText}>Subject Progress</Text>
        <View style={styles.headerDot} />
      </View>

      {items.map((subject) => (
        <SubjectCard key={subject.name} {...subject} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: ProfileColors.sectionBackground,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerText: {
    color: ProfileColors.textPrimary,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  headerDot: {
    width: 6,
    height: 6,
    marginLeft: 6,
    borderRadius: 3,
    backgroundColor: ProfileColors.headerDot,
  },
});
