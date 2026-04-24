import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Image } from 'expo-image';
import type { ImageSourcePropType } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileSkeletonBlock } from '@/src/components/profile/ProfileSkeletonBlock';
import { ProfileColors } from '@/src/components/profile/profileTokens';

interface ProfileHeaderProps {
  avatarSource: ImageSourcePropType;
  username: string;
  loading?: boolean;
  onSettingsPress: () => void;
}

export function ProfileHeader({
  avatarSource,
  username,
  loading = false,
  onSettingsPress,
}: ProfileHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 12 }]}>
      {loading ? (
        <>
          <ProfileSkeletonBlock style={styles.loadingAvatar} />
          <ProfileSkeletonBlock style={styles.loadingName} />
          <ProfileSkeletonBlock style={styles.loadingSettings} />
        </>
      ) : (
        <>
          <Image contentFit="cover" source={avatarSource} style={styles.avatar} />
          <Text numberOfLines={1} style={styles.usernameText}>
            {username}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            hitSlop={10}
            onPress={onSettingsPress}
            style={({ pressed }) => [styles.settingsButton, pressed ? styles.settingsButtonPressed : null]}
          >
            <MaterialCommunityIcons color={ProfileColors.white} name="cog-outline" size={22} />
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: ProfileColors.heroTop,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  usernameText: {
    flex: 1,
    marginLeft: 10,
    color: ProfileColors.white,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsButtonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
  loadingAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  loadingName: {
    flex: 1,
    height: 18,
    marginLeft: 10,
    marginRight: 12,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  loadingSettings: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
});
