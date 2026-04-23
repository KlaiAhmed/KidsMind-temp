import { ScrollView, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { Spacing } from '@/constants/theme';
import type { ChildProfile } from '@/types/child';

import { ChildAvatarChip } from './ChildAvatarChip';

interface ParentChildSwitcherProps {
  profiles: ChildProfile[];
  activeChildId: string | null;
  getAvatarSource: (child: ChildProfile) => ImageSourcePropType;
  onSelectChild: (childId: string) => void;
  onAddChild?: () => void;
}

export function ParentChildSwitcher({
  profiles,
  activeChildId,
  getAvatarSource,
  onSelectChild,
  onAddChild,
}: ParentChildSwitcherProps) {
  return (
    <View style={styles.container}>
      <ScrollView horizontal contentContainerStyle={styles.row} showsHorizontalScrollIndicator={false}>
        {profiles.map((child) => (
          <ChildAvatarChip
            key={child.id}
            avatarSource={getAvatarSource(child)}
            isActive={child.id === activeChildId}
            label={child.nickname ?? child.name}
            onPress={() => onSelectChild(child.id)}
          />
        ))}

        {onAddChild ? <ChildAvatarChip label="+ Add" onPress={onAddChild} variant="add" /> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 0,
  },
  row: {
    gap: Spacing.sm,
    paddingRight: Spacing.sm,
  },
});
