import {
  Image,
  StyleSheet,
  Text,
  View,
  Pressable,
  type ImageSourcePropType,
  type ViewStyle,
} from 'react-native';
import { useState } from 'react';
import { AvatarPlaceholder } from '@/components/ui/AvatarPlaceholder';

import { Radii, Spacing, Colors } from '@/constants/theme';
import { useChildProfile } from '@/hooks/useChildProfile';

interface ChildSpaceHeaderProps {
  avatarSource: ImageSourcePropType;
  childName: string;
  welcomeLabel?: string;
  greetingText?: string;
  onRequestParentAccess?: () => void;
  style?: ViewStyle;
  children?: React.ReactNode;
}

// PIN gate shield icon removed — a global PINGateHeaderButton overlay in the
// child-tabs layout now provides the PIN-gate entry point on ALL four tabs,
// eliminating the duplicate that existed when only Home had the shield.

function getTimezoneGreeting(childName: string, timezone?: string | null): string {
  const tz = timezone || undefined;
  const hourStr = new Date().toLocaleString('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: tz,
  });
  const hour = parseInt(hourStr, 10);

  let greeting: string;
  if (hour >= 5 && hour < 12) {
    greeting = 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    greeting = 'Good afternoon';
  } else if (hour >= 17 && hour < 21) {
    greeting = 'Good evening';
  } else {
    greeting = 'Good night';
  }

  return `${greeting}, ${childName}! 👋`;
}

export function ChildSpaceHeader({
  avatarSource,
  childName,
  welcomeLabel = 'WELCOME BACK!',
  greetingText,
  onRequestParentAccess,
  style,
  children,
}: ChildSpaceHeaderProps) {
  const { profile } = useChildProfile();
  
  const displayGreeting = greetingText || getTimezoneGreeting(childName, profile?.timezone);

  return (
    <View style={[styles.container, style]}>
      <View style={styles.headerRow}>
        <AvatarOrImage source={avatarSource} style={styles.avatar} />

        <View style={styles.textContainer}>
          <Text style={styles.welcomeLabel}>{welcomeLabel}</Text>
          <Text style={styles.greetingText} numberOfLines={1}>
            {displayGreeting}
          </Text>
        </View>

        {onRequestParentAccess ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRequestParentAccess}
            style={styles.parentZoneButton}
          >
            <Text style={styles.parentZoneText}>Parent Zone</Text>
          </Pressable>
        ) : null}
      </View>

      {children}
    </View>
  );
}

function AvatarOrImage({ source, style }: { source: any; style: any }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !source) {
    const size = style?.width && typeof style.width === 'number' ? style.width : 44;
    return <AvatarPlaceholder size={size} style={{ borderRadius: size / 2 }} />;
  }

  return <Image source={source} style={style} onError={() => setHasError(true)} />;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
  },
  textContainer: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  welcomeLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    letterSpacing: 1.2,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  greetingText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 18,
    color: Colors.text,
    lineHeight: 24,
    flexShrink: 1,
  },
  parentZoneButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainerLow,
  },
  parentZoneText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: Colors.primary,
  },
});

export default ChildSpaceHeader;
