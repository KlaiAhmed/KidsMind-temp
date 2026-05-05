// Apps/mobile/components/chat/SessionHeader.tsx
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface SessionHeaderProps {
  subjectName?: string;
  elapsedSeconds: number;
  minutesRemaining: number | null;
  onClearChat: () => void;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function formatRemaining(seconds: number): string {
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function SessionHeader({ subjectName, elapsedSeconds, minutesRemaining, onClearChat }: SessionHeaderProps) {
  const remainingSeconds = minutesRemaining !== null ? minutesRemaining * 60 : null;

  const handleClearChat = () => {
    Alert.alert(
      'Start a new chat?',
      'This will clear the current conversation.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start new chat', style: 'destructive', onPress: onClearChat },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.primaryRow}>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.textSecondary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            hitSlop={8}
            onPress={handleClearChat}
            style={({ pressed }) => [styles.iconButton, pressed ? styles.iconButtonPressed : null]}
          >
            <MaterialCommunityIcons name="chat-remove-outline" size={20} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <View style={styles.subjectPill}>
          <MaterialCommunityIcons name="book-open-variant" size={16} color={Colors.primary} />
          <Text style={styles.subjectText}>{subjectName ?? 'Ask me anything!'}</Text>
        </View>

        <View style={styles.timerPill}>
          <MaterialCommunityIcons name="timer-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.timerText}>{formatDuration(elapsedSeconds)}</Text>
        </View>
      </View>

      {remainingSeconds !== null && remainingSeconds <= 300 ? (
        <View style={styles.warningBanner}>
          <MaterialCommunityIcons name="clock-alert-outline" size={16} color={Colors.secondary} />
          <Text style={styles.warningText}>You have {formatRemaining(remainingSeconds)} left today.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconButton: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radii.full,
  },
  iconButtonPressed: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  subjectPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 40,
  },
  subjectText: {
    ...Typography.captionMedium,
    color: Colors.text,
    flex: 1,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLow,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 40,
  },
  timerText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.md,
    backgroundColor: Colors.secondaryContainer,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  warningText: {
    ...Typography.caption,
    color: Colors.text,
  },
});
