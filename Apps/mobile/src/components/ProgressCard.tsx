import { StyleSheet, Text, View } from 'react-native';

interface ProgressCardProps {
  currentXP: number;
  level: number;
  maxXP: number;
}

export function ProgressCard({ currentXP, level, maxXP }: ProgressCardProps) {
  const safeCurrentXP = Math.max(0, currentXP);
  const safeMaxXP = Math.max(1, maxXP);
  const progressWidth = `${Math.min(100, Math.round((safeCurrentXP / safeMaxXP) * 100))}%` as `${number}%`;

  return (
    <View style={styles.progressCard}>
      <Text style={styles.progressLabel}>YOUR PROGRESS</Text>

      <View style={styles.progressRow}>
        <Text style={styles.levelText}>{`Level ${level}`}</Text>
        <Text style={styles.xpText}>{`${safeCurrentXP.toLocaleString()} / ${safeMaxXP.toLocaleString()} XP`}</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: progressWidth }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  progressLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.4,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  levelText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 26,
    color: '#4338CA',
  },
  xpText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#9CA3AF',
    flexShrink: 1,
    textAlign: 'right',
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 8,
    backgroundColor: '#312E81',
    borderRadius: 4,
  },
});
