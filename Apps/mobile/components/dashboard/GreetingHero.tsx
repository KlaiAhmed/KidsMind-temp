import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useState } from 'react';
import { Image } from 'expo-image';
import AvatarPlaceholder from '@/components/ui/AvatarPlaceholder';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Gradients, Radii, Spacing, Typography } from '@/constants/theme';

const MIN_CHILD_TAP_TARGET = 56;

interface GreetingHeroProps {
  childName: string;
  avatarSource: ImageSourcePropType;
  onAvatarPress: () => void;
}

function getTimeOfDayGreeting(date: Date): string {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

function GreetingHeroComponent({
  childName,
  avatarSource,
  onAvatarPress,
}: GreetingHeroProps) {
  const greeting = getTimeOfDayGreeting(new Date());

  return (
    <LinearGradient
      colors={[...Gradients.indigoDepth.colors]}
      start={Gradients.indigoDepth.start}
      end={Gradients.indigoDepth.end}
      style={styles.container}
    >
      <View style={styles.copyBlock}>
        <Text allowFontScaling={false} style={styles.greetingLine}>
          {greeting}
        </Text>
        <Text allowFontScaling={false} numberOfLines={1} style={styles.nameLine}>
          {childName}!
        </Text>
        <Text style={styles.supportingText}>
          Ready for a bright learning streak today?
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Edit child profile"
        onPress={onAvatarPress}
        style={({ pressed }) => [
          styles.avatarButton,
          pressed ? styles.avatarButtonPressed : null,
        ]}
      >
        <AvatarOrImage source={avatarSource} style={styles.avatarImage} />
      </Pressable>
    </LinearGradient>
  );
}

export const GreetingHero = memo(GreetingHeroComponent);

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  copyBlock: {
    flex: 1,
    gap: Spacing.xs,
  },
  greetingLine: {
    ...Typography.bodySemiBold,
    color: Colors.primaryFixed,
  },
  nameLine: {
    ...Typography.headline,
    color: Colors.white,
  },
  supportingText: {
    ...Typography.caption,
    color: Colors.primaryFixed,
    maxWidth: 220,
  },
  avatarButton: {
    width: 80,
    height: 80,
    minWidth: MIN_CHILD_TAP_TARGET,
    minHeight: MIN_CHILD_TAP_TARGET,
    borderRadius: 40,
    padding: Spacing.xs,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 2,
    borderColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
});

function AvatarOrImage({ source, style }: { source: any; style: any }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !source) {
    const size = style?.width && typeof style.width === 'number' ? style.width : 70;
    return <AvatarPlaceholder size={size} style={{ borderRadius: size / 2 }} />;
  }

  return <Image source={source} contentFit="cover" style={style} onError={() => setHasError(true)} />;
}
