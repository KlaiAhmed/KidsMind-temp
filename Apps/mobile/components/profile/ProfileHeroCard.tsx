// Apps/mobile/components/profile/ProfileHeroCard.tsx
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { AvatarPlaceholder } from '@/components/ui/AvatarPlaceholder';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Gradients, Radii, Spacing, Typography } from '@/constants/theme';
import { XPProgressBar } from '@/components/profile/XPProgressBar';

const MIN_CHILD_TAP_TARGET = 56;

interface ProfileHeroCardProps {
  avatarSource: ImageSourcePropType;
  nickname: string;
  level: number;
  currentXP: number;
  xpToNextLevel: number;
  showLevelUpOverlay?: boolean;
  onEditProfile: () => void;
}

export function ProfileHeroCard({
  avatarSource,
  nickname,
  level,
  currentXP,
  xpToNextLevel,
  showLevelUpOverlay = false,
  onEditProfile,
}: ProfileHeroCardProps) {
  const levelUpScale = useRef(new Animated.Value(0.8)).current;
  const levelUpOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!showLevelUpOverlay) {
      return;
    }

    Animated.sequence([
      Animated.parallel([
        Animated.timing(levelUpScale, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(levelUpOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(levelUpScale, {
          toValue: 0.9,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(levelUpOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [levelUpOpacity, levelUpScale, showLevelUpOverlay]);

  return (
    <LinearGradient
      colors={[...Gradients.indigoDepth.colors]}
      start={Gradients.indigoDepth.start}
      end={Gradients.indigoDepth.end}
      style={styles.container}
    >
      <View style={styles.headerRow}>
        <View style={styles.identityRow}>
          <AvatarOrImage source={avatarSource} style={styles.avatar} />

          <View style={styles.identityTextColumn}>
            <Text numberOfLines={1} style={styles.nicknameText}>
              {nickname}
            </Text>
            <View style={styles.levelPill}>
              <MaterialCommunityIcons name="star-four-points" size={14} color={Colors.primary} />
              <Text style={styles.levelPillText}>Level {level}</Text>
            </View>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Edit child profile"
          onPress={onEditProfile}
          style={({ pressed }) => [styles.editButton, pressed ? styles.editButtonPressed : null]}
        >
          <MaterialCommunityIcons name="pencil" size={20} color={Colors.primary} />
        </Pressable>
      </View>

      <XPProgressBar currentXP={currentXP} xpToNextLevel={xpToNextLevel} level={level} animated />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.levelUpOverlay,
          {
            opacity: levelUpOpacity,
            transform: [{ scale: levelUpScale }],
          },
        ]}
      >
        <MaterialCommunityIcons name="trophy" size={28} color={Colors.primary} />
        <Text style={styles.levelUpText}>Level Up!</Text>
      </Animated.View>
    </LinearGradient>
  );
}

function AvatarOrImage({ source, style }: { source: any; style: any }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !source) {
    const size = style?.width && typeof style.width === 'number' ? style.width : 72;
    return <AvatarPlaceholder size={size} style={{ borderRadius: size / 2 }} />;
  }

  return <Image source={source} contentFit="cover" style={style} onError={() => setHasError(true)} />;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.xl,
    padding: Spacing.md,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: Radii.full,
    borderWidth: 2,
    borderColor: Colors.primaryFixed,
    backgroundColor: Colors.surfaceContainerLowest,
  },
  identityTextColumn: {
    gap: Spacing.xs,
    flex: 1,
  },
  nicknameText: {
    ...Typography.headline,
    color: Colors.white,
  },
  levelPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryFixed,
  },
  levelPillText: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  editButton: {
    width: MIN_CHILD_TAP_TARGET,
    height: MIN_CHILD_TAP_TARGET,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
  },
  editButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  levelUpOverlay: {
    position: 'absolute',
    top: Spacing.xl,
    left: Spacing.xl,
    right: Spacing.xl,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  levelUpText: {
    ...Typography.bodySemiBold,
    color: Colors.primary,
  },
});
