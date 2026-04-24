import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export interface SubjectGridItem {
  iconBackground: string;
  iconColor: string;
  iconName: ComponentProps<typeof MaterialCommunityIcons>['name'];
  lessonCount: string;
  name: string;
}

interface SubjectGridProps {
  onViewAll?: () => void;
  subjects: SubjectGridItem[];
}

export function SubjectGrid({ onViewAll, subjects }: SubjectGridProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Choose a Subject</Text>

        <Pressable disabled={!onViewAll} onPress={onViewAll}>
          <Text style={styles.viewAllLink}>View All</Text>
        </Pressable>
      </View>

      <View style={styles.grid}>
        {subjects.map((subject) => (
          <View key={subject.name} style={styles.subjectCard}>
            <View style={[styles.iconContainer, { backgroundColor: subject.iconBackground }]}>
              <MaterialCommunityIcons color={subject.iconColor} name={subject.iconName} size={24} />
            </View>

            <Text style={styles.subjectName}>{subject.name}</Text>
            <Text style={styles.lessonCount}>{subject.lessonCount}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 20,
    color: '#111827',
  },
  viewAllLink: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#4338CA',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  subjectCard: {
    width: '48%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  subjectName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    color: '#111827',
    marginBottom: 4,
  },
  lessonCount: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#9CA3AF',
  },
});
