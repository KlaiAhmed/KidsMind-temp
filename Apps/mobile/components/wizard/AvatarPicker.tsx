import { memo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import AvatarPlaceholder from '@/components/ui/AvatarPlaceholder';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { AvatarOption } from '@/types/child';

const COLUMN_COUNT = 3;

interface AvatarPickerProps {
  avatars: AvatarOption[];
  selectedAvatarId: string;
  onSelect: (avatarId: string) => void;
  style?: StyleProp<ViewStyle>;
}

function AvatarPickerComponent({
  avatars,
  selectedAvatarId,
  onSelect,
  style,
}: AvatarPickerProps) {
  function handleSelect(avatarId: string) {
    void Haptics.selectionAsync().catch(() => undefined);
    onSelect(avatarId);
  }

  return (
    <FlatList
      data={avatars}
      style={[styles.list, style]}
      keyExtractor={(item) => item.id}
      numColumns={COLUMN_COUNT}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.contentContainer}
      renderItem={({ item }) => {
        const selected = item.id === selectedAvatarId;

        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Choose avatar ${item.label}`}
            accessibilityState={{ selected }}
            onPress={() => handleSelect(item.id)}
            style={({ pressed }) => [
              styles.avatarCell,
              selected ? styles.avatarCellSelected : null,
              pressed ? styles.avatarCellPressed : null,
            ]}
          >
            <AvatarCell asset={item.asset} style={styles.avatarImage} />
            <Text numberOfLines={1} style={styles.avatarLabel}>
              {item.label}
            </Text>
            {selected ? (
              <View style={styles.checkBadge}>
                <MaterialCommunityIcons name="check" size={14} color={Colors.white} />
              </View>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

function AvatarCell({ asset, style }: { asset: any; style: any }) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !asset) {
    const size = style?.width && typeof style.width === 'number' ? style.width : 52;
    return <AvatarPlaceholder size={size} style={{ borderRadius: size / 2 }} />;
  }

  return <Image source={asset} contentFit="cover" style={style} onError={() => setHasError(true)} />;
}

export const AvatarPicker = memo(AvatarPickerComponent);

const styles = StyleSheet.create({
  list: {
    flex: 1,
    minHeight: 0,
  },
  contentContainer: {
    gap: Spacing.sm,
  },
  row: {
    gap: Spacing.sm,
  },
  avatarCell: {
    flex: 1,
    minHeight: 112,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    position: 'relative',
  },
  avatarCellSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFixed,
  },
  avatarCellPressed: {
    transform: [{ scale: 0.97 }],
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  avatarLabel: {
    ...Typography.caption,
    color: Colors.text,
    textAlign: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.xs,
    right: Spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
});
