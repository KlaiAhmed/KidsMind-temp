import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

interface StreakCardProps {
  days: number;
}

export function StreakCard({ days }: StreakCardProps) {
  const streakLabel = `${days} Day${days === 1 ? '' : 's'} Streak! 🔥`;

  return (
    <View style={styles.streakCard}>
      <View style={styles.streakTopRow}>
        <Text style={styles.streakLabel}>DAILY STREAK</Text>
        <View style={styles.streakIconCircle}>
          <MaterialCommunityIcons color="#FFFFFF" name="fire" size={18} />
        </View>
      </View>

      <View style={styles.streakBottomRow}>
        <Text style={styles.streakText}>{streakLabel}</Text>
      </View>

      <MaterialCommunityIcons color="rgba(255,255,255,0.10)" name="fire" size={86} style={styles.ghostFlame} />
    </View>
  );
}

const styles = StyleSheet.create({
  streakCard: {
    backgroundColor: '#7B1A2A',
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
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.70)',
    textTransform: 'uppercase',
  },
  streakIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    color: '#FFFFFF',
    lineHeight: 30,
    maxWidth: '76%',
  },
  ghostFlame: {
    position: 'absolute',
    right: -10,
    bottom: -10,
  },
});
