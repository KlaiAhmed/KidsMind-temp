import type MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';

import type { AgeGroup } from '@/types/child';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type BottomNavMode = 'parent' | 'child';
export type BottomNavSlot = 'overview' | 'history' | 'progress' | 'controls';
export type BottomNavRouteName = 'index' | 'chat' | 'explore' | 'profile';

export interface BottomNavIconPair {
  inactive: IconName;
  active: IconName;
}

export interface BottomNavItemConfig {
  slot: BottomNavSlot;
  routeName: BottomNavRouteName;
  label: string;
  inactiveIcon: IconName;
  activeIcon: IconName;
  disabled?: boolean;
}

type BottomNavItemSeed = Omit<BottomNavItemConfig, 'slot' | 'disabled' | 'inactiveIcon' | 'activeIcon'> & {
  iconSet: BottomNavIconPair;
  iconSetByAgeGroup?: Partial<Record<AgeGroup, BottomNavIconPair>>;
};

const TAB_ORDER: BottomNavSlot[] = ['overview', 'history', 'progress', 'controls'];

const NAV_CONFIG_BY_MODE: Record<BottomNavMode, Record<BottomNavSlot, BottomNavItemSeed>> = {
  parent: {
    overview: {
      routeName: 'index',
      label: 'Overview',
      iconSet: { inactive: 'home-outline', active: 'home' },
    },
    history: {
      routeName: 'chat',
      label: 'History',
      iconSet: { inactive: 'chart-box-outline', active: 'chart-box' },
    },
    progress: {
      routeName: 'explore',
      label: 'Progress',
      iconSet: { inactive: 'book-open-outline', active: 'book-open' },
    },
    controls: {
      routeName: 'profile',
      label: 'Controls',
      iconSet: { inactive: 'cog-outline', active: 'cog' },
    },
  },
  child: {
    overview: {
      routeName: 'index',
      label: 'Home',
      iconSet: { inactive: 'home-outline', active: 'home' },
      iconSetByAgeGroup: {
        '3-6': { inactive: 'rocket-outline', active: 'rocket' },
      },
    },
    history: {
      routeName: 'chat',
      label: 'Coach',
      iconSet: { inactive: 'lightbulb-outline', active: 'lightbulb' },
      iconSetByAgeGroup: {
        '3-6': { inactive: 'star-outline', active: 'star' },
      },
    },
    progress: {
      routeName: 'explore',
      label: 'Learn',
      iconSet: { inactive: 'book-open-outline', active: 'book-open' },
      iconSetByAgeGroup: {
        '3-6': { inactive: 'puzzle-outline', active: 'puzzle' },
      },
    },
    controls: {
      routeName: 'profile',
      label: 'Profile',
      iconSet: { inactive: 'account-outline', active: 'account' },
      iconSetByAgeGroup: {
        '3-6': { inactive: 'shield-account-outline', active: 'shield-account' },
      },
    },
  },
};

export interface BuildBottomNavConfigOptions {
  mode: BottomNavMode;
  ageGroup?: AgeGroup;
  blockedSlots?: Partial<Record<BottomNavSlot, boolean>>;
  iconOverrides?: Partial<Record<BottomNavSlot, BottomNavIconPair>>;
}

export function buildBottomNavConfig({
  mode,
  ageGroup,
  blockedSlots,
  iconOverrides,
}: BuildBottomNavConfigOptions): BottomNavItemConfig[] {
  const modeConfig = NAV_CONFIG_BY_MODE[mode];

  return TAB_ORDER.map((slot) => {
    const seed = modeConfig[slot];
    const ageGroupIcons = ageGroup ? seed.iconSetByAgeGroup?.[ageGroup] : undefined;
    const overrideIcons = iconOverrides?.[slot];

    return {
      slot,
      routeName: seed.routeName,
      label: seed.label,
      inactiveIcon: overrideIcons?.inactive ?? ageGroupIcons?.inactive ?? seed.iconSet.inactive,
      activeIcon: overrideIcons?.active ?? ageGroupIcons?.active ?? seed.iconSet.active,
      disabled: Boolean(blockedSlots?.[slot]),
    };
  });
}
