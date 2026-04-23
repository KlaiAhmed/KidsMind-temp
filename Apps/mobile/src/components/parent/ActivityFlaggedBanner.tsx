import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

export interface ActivityFlaggedBannerProps {
  flagged: boolean;
  childName: string;
  timestampLabel: string;
  onReview: () => void;
  reserveSpace?: boolean;
}

export function ActivityFlaggedBanner({
  flagged,
  childName,
  timestampLabel,
  onReview,
  reserveSpace = true,
}: ActivityFlaggedBannerProps) {
  if (!flagged) {
    return reserveSpace ? <View style={styles.placeholder} /> : null;
  }

  return (
    <View accessibilityRole="alert" style={styles.container}>
      <View style={styles.contentColumn}>
        <View style={styles.titleRow}>
          <MaterialCommunityIcons
            accessibilityLabel="Flagged activity"
            color={Colors.errorText}
            name="alert-outline"
            size={20}
          />
          <Text style={styles.title}>Activity Flagged</Text>
        </View>

        <Text style={styles.description}>
          Content flagged in <Text style={styles.childName}>{childName}</Text>
          {"'s"} recent chat history at {timestampLabel}.
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Review ${childName} conversation history`}
        onPress={onReview}
        style={({ pressed }) => [styles.reviewButton, pressed ? styles.reviewButtonPressed : null]}
      >
        <Text style={styles.reviewLabel}>Review</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    minHeight: 96,
  },
  container: {
    minHeight: 96,
    borderRadius: Radii.xl,
    borderWidth: 1,
    borderColor: Colors.errorText,
    backgroundColor: Colors.errorContainer,
    padding: Spacing.md,
    gap: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  contentColumn: {
    flex: 1,
    gap: Spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  title: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  description: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  childName: {
    ...Typography.captionMedium,
    color: Colors.accentPurple,
  },
  reviewButton: {
    minWidth: 84,
    minHeight: 44,
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.md,
  },
  reviewButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  reviewLabel: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
});
