import { memo, useRef } from 'react';
import {
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { Subject } from '@/types/child';

const COLUMN_COUNT = 2;

interface SubjectInterestPickerProps {
  subjects: Subject[];
  selectedSubjectIds: string[];
  onToggleSubject: (subjectId: string) => void;
  style?: StyleProp<ViewStyle>;
}

interface SubjectChipProps {
  subject: Subject;
  selected: boolean;
  onPress: () => void;
}

function SubjectChip({ subject, selected, onPress }: SubjectChipProps) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePress() {
    void Haptics.selectionAsync().catch(() => undefined);

    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.05,
        duration: 75,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: 75,
        useNativeDriver: true,
      }),
    ]).start();

    onPress();
  }

  return (
    <Animated.View style={[styles.cellWrap, { transform: [{ scale }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={`Select ${subject.title}`}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.chip,
          selected ? [styles.chipSelected, { backgroundColor: subject.color }] : null,
          pressed ? styles.chipPressed : null,
        ]}
      >
        <View style={[styles.iconWrap, selected ? styles.iconWrapSelected : null]}>
          <Image source={subject.iconAsset} contentFit="cover" style={styles.iconImage} />
        </View>
        <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>
          {subject.title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function SubjectInterestPickerComponent({
  subjects,
  selectedSubjectIds,
  onToggleSubject,
  style,
}: SubjectInterestPickerProps) {
  return (
    <FlatList
      data={subjects}
      style={[styles.list, style]}
      keyExtractor={(item) => item.id}
      numColumns={COLUMN_COUNT}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.contentContainer}
      renderItem={({ item }) => {
        const selected = selectedSubjectIds.includes(item.id);

        return (
          <SubjectChip
            subject={item}
            selected={selected}
            onPress={() => onToggleSubject(item.id)}
          />
        );
      }}
    />
  );
}

export const SubjectInterestPicker = memo(SubjectInterestPickerComponent);

const styles = StyleSheet.create({
  list: {
    flex: 1,
    minHeight: 0,
  },
  contentContainer: {
    gap: Spacing.sm,
  },
  row: {
    gap: Spacing.sm,
  },
  cellWrap: {
    flex: 1,
  },
  chip: {
    minHeight: 64,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  chipSelected: {
    borderColor: Colors.primary,
  },
  chipPressed: {
    opacity: 0.94,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapSelected: {
    backgroundColor: Colors.white,
  },
  iconImage: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  chipText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  chipTextSelected: {
    color: Colors.white,
  },
});
