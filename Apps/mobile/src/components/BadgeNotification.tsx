import { Pressable, StyleSheet, Text, View } from 'react-native';

interface BadgeNotificationProps {
  onDismiss: () => void;
}

export function BadgeNotification({ onDismiss }: BadgeNotificationProps) {
  return (
    <View style={styles.badgeBanner}>
      <View style={styles.badgeIconCircle}>
        <Text style={styles.badgeEmoji}>🏆</Text>
      </View>

      <Text style={styles.badgeText}>New Badge: Space Cadet! 🥇</Text>

      <Pressable hitSlop={8} onPress={onDismiss} style={styles.dismissButton}>
        <Text style={styles.dismissX}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  badgeIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FCD34D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeEmoji: {
    fontSize: 16,
    lineHeight: 18,
  },
  badgeText: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
    color: '#1F2937',
  },
  dismissButton: {
    padding: 4,
  },
  dismissX: {
    fontSize: 18,
    color: '#6B7280',
    fontWeight: '600',
    lineHeight: 20,
  },
});
