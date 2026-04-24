import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';

interface HomeHeaderProps {
  avatarSource: ImageSourcePropType;
  childName: string;
}

export function HomeHeader({ avatarSource, childName }: HomeHeaderProps) {
  return (
    <View style={styles.header}>
      <Image source={avatarSource} style={styles.avatar} />

      <View style={styles.headerText}>
        <Text style={styles.welcomeLabel}>WELCOME BACK!</Text>
        <Text style={styles.greetingText}>{`Good morning, ${childName}! ☀️`}</Text>
      </View>

      <View style={styles.lockCircle}>
        <MaterialCommunityIcons color="#4338CA" name="lock-outline" size={18} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  headerText: {
    flex: 1,
    paddingRight: 8,
  },
  welcomeLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  greetingText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: '#3730A3',
    lineHeight: 24,
    flexShrink: 1,
  },
  lockCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#C4B5FD',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
  },
});
