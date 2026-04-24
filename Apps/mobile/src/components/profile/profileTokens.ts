import { Platform } from 'react-native';

export const ProfileColors = {
  heroTop: '#6C63D8',
  heroBottom: '#8C84E0',
  heroOverlay: '#eeeeff',
  dashedBorder: '#c9c3f5',
  levelGold: '#F5C842',
  levelGoldText: '#5a3800',
  sectionBackground: '#f5f4ff',
  insightCardBackground: '#eeeeff',
  insightIconBackground: '#3D35C0',
  textPrimary: '#1a1a2e',
  textSecondary: '#999999',
  textMuted: '#555555',
  white: '#FFFFFF',
  progressTrack: '#e8e7ff',
  xpBar: '#3D4DE8',
  englishBar: '#D4A017',
  englishText: '#D4A017',
  scienceBar: '#8B1010',
  scienceText: '#B02020',
  statPurple: '#5B4FD9',
  statGold: '#D4A017',
  statRed: '#D94040',
  headerDot: '#4C9FF5',
  badgeYellow: '#FFF0C0',
  badgeLavender: '#E8E4FF',
  badgeRose: '#FFE4E4',
  iconTile: '#ededff',
} as const;

export const profileCardShadow = Platform.select({
  ios: {
    shadowColor: '#160F56',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  android: {
    elevation: 2,
  },
  default: {},
});
