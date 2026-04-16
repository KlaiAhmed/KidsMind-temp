// Apps/mobile/types/badge.ts
import type { ImageSourcePropType } from 'react-native';

export interface Badge {
  id: string;
  name: string;
  description: string;
  iconAsset: ImageSourcePropType;
  earned: boolean;
  earnedAt: string | null;
  condition: string;
  progressPercent?: number;
}

export interface BadgeApiItem {
  id: string;
  name: string;
  description?: string;
  earned?: boolean;
  earned_at?: string | null;
  condition?: string;
  icon_key?: string;
  progress_percent?: number;
}
