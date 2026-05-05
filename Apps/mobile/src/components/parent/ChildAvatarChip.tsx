import type { ImageSourcePropType } from 'react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AvatarPlaceholder from '@/components/ui/AvatarPlaceholder';

import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface ChildAvatarChipBaseProps {
  label: string;
  isActive?: boolean;
  onPress: () => void;
}

interface ChildAvatarItemProps extends ChildAvatarChipBaseProps {
  variant?: 'child';
  avatarSource: ImageSourcePropType;
}

interface AddChildChipProps extends ChildAvatarChipBaseProps {
  variant: 'add';
  avatarSource?: never;
}

export type ChildAvatarChipProps = ChildAvatarItemProps | AddChildChipProps;

export function ChildAvatarChip({
  label,
  isActive = false,
  onPress,
  variant = 'child',
  avatarSource,
}: ChildAvatarChipProps) {
  const isAddChip = variant === 'add';

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isAddChip ? label : `Switch to ${label}`}
        accessibilityState={{ selected: isActive }}
        onPress={onPress}
        style={({ pressed }) => [
          styles.button,
          isAddChip ? styles.addButton : styles.childButton,
          isActive ? styles.buttonActive : null,
          pressed ? styles.buttonPressed : null,
        ]}
      >
        {isAddChip ? (
          <MaterialCommunityIcons
            accessibilityLabel="Add child"
            color={Colors.primary}
            name="plus"
            size={26}
          />
        ) : (
          (() => {
            const [hasError, setHasError] = [false, () => {}];
            // Inline hook-like behavior isn't allowed here in render helper, so
            // lift to actual component below instead.
            return <AvatarOrImage source={avatarSource} style={styles.avatar} />;
          })()
        )}
      </Pressable>

      <Text numberOfLines={1} style={[styles.label, isActive ? styles.labelActive : null]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 74,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 2,
    borderColor: Colors.outline,
  },
  childButton: {
    overflow: 'hidden',
  },
  addButton: {
    borderStyle: 'dashed',
    backgroundColor: Colors.surfaceContainerLow,
  },
  buttonActive: {
    borderColor: Colors.accentPurple,
    shadowColor: Colors.accentPurple,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonPressed: {
    transform: [{ scale: 0.96 }],
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  label: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  labelActive: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
});

function AvatarOrImage({ source, style }: { source: any; style: any }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !source) {
    // estimate size from container style if numeric, otherwise default
    const size = style?.width && typeof style.width === 'number' ? style.width : 64;
    return <AvatarPlaceholder size={size} style={{ borderRadius: size / 2 }} />;
  }

  return <Image contentFit="cover" source={source} style={style} onError={() => setHasError(true)} />;
}
