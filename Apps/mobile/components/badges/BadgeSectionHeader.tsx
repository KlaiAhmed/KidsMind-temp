// Apps/mobile/components/badges/BadgeSectionHeader.tsx
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Spacing, Typography } from '@/constants/theme';

interface BadgeSectionHeaderProps {
  title: string;
  count: number;
}

export function BadgeSectionHeader({ title, count }: BadgeSectionHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  title: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  count: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
});
