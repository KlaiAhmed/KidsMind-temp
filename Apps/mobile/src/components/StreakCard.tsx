import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

interface StreakCardProps {
  days: number;
}

export function StreakCard({ days }: StreakCardProps) {
  const streakLabel = days > 0
    ? `${days} Day${days === 1 ? '' : 's'} Streak! 🔥`
    : 'Start your streak today! Learn something new. 🔥';

  return (
    <View style={styles.streakCard}>
      <View style={styles.streakTopRow}>
        <Text style={styles.streakLabel}>DAILY STREAK</Text>
        <View style={styles.streakIconCircle}>
          <MaterialCommunityIcons color={Colors.white} name="fire" size={18} />
        </View>
      </View>

      <View style={styles.streakBottomRow}>
        <Text style={styles.streakText}>{streakLabel}</Text>
      </View>

      <MaterialCommunityIcons color={Colors.white} name="fire" size={86} style={styles.ghostFlame} />
    </View>
  );
}

const styles = StyleSheet.create({
  streakCard: {
    backgroundColor: Colors.tertiaryContainer,
    borderRadius: 16,
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 16,
    overflow: 'hidden',
    minHeight: 100,
  },
  streakTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  streakLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    letterSpacing: 0,
    color: Colors.white,
    opacity: 0.7,
    textTransform: 'uppercase',
  },
  streakIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streakBottomRow: {
    minHeight: 38,
    justifyContent: 'center',
  },
  streakText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 24,
    color: Colors.white,
    lineHeight: 30,
    maxWidth: '76%',
  },
  ghostFlame: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    opacity: 0.1,
  },
});
