/** Application-wide constants: breakpoints, timing, languages, age groups, features, how-it-works steps, and testimonials. */
import type { AgeGroup, Feature, Step, Testimonial, Language } from '../types';

export const BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
} as const;

export const TIMING = {
  carouselInterval: 3000,
  animationDuration: 700,
  staggerDelay: 120,
  hoverTransition: 250,
} as const;

export const LANGUAGES: Language[] = [
  { code: 'en', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'fr', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'es', label: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'it', label: 'Italiano', flag: '🇮🇹', dir: 'ltr' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
  { code: 'ch', label: '中文', flag: '🇨🇳', dir: 'ltr' },
];

export const AGE_GROUPS: AgeGroup[] = [
  {
    id: 'explorers',
    emoji: '🧒',
    titleKey: 'age_group_1_title',
    rangeKey: 'age_group_1_range',
    descKey: 'age_group_1_desc',
    accentColor: 'var(--accent-fun)',
    bgColor: 'rgba(255, 230, 109, 0.15)',
  },
  {
    id: 'adventurers',
    emoji: '🧑‍🎓',
    titleKey: 'age_group_2_title',
    rangeKey: 'age_group_2_range',
    descKey: 'age_group_2_desc',
    accentColor: 'var(--accent-learn)',
    bgColor: 'rgba(78, 205, 196, 0.15)',
  },
  {
    id: 'innovators',
    emoji: '🚀',
    titleKey: 'age_group_3_title',
    rangeKey: 'age_group_3_range',
    descKey: 'age_group_3_desc',
    accentColor: 'var(--accent-grow)',
    bgColor: 'rgba(149, 225, 160, 0.15)',
  },
];

export const FEATURES: Feature[] = [
  {
    id: 'chat',
    iconName: 'MessageCircle',
    titleKey: 'feature_chat_title',
    descKey: 'feature_chat_desc',
    accentColor: 'var(--accent-main)',
  },
  {
    id: 'voice',
    iconName: 'Mic',
    titleKey: 'feature_voice_title',
    descKey: 'feature_voice_desc',
    accentColor: 'var(--accent-learn)',
  },
  {
    id: 'badges',
    iconName: 'Trophy',
    titleKey: 'feature_badges_title',
    descKey: 'feature_badges_desc',
    accentColor: 'var(--accent-fun)',
  },
  {
    id: 'dashboard',
    iconName: 'BarChart2',
    titleKey: 'feature_dashboard_title',
    descKey: 'feature_dashboard_desc',
    accentColor: 'var(--accent-grow)',
  },
  {
    id: 'safety',
    iconName: 'Shield',
    titleKey: 'feature_safety_title',
    descKey: 'feature_safety_desc',
    accentColor: 'var(--accent-safety)',
  },
  {
    id: 'language',
    iconName: 'Globe',
    titleKey: 'feature_language_title',
    descKey: 'feature_language_desc',
    accentColor: 'var(--accent-learn)',
  },
];

export const STEPS: Step[] = [
  {
    number: 1,
    emoji: '📝',
    titleKey: 'step_1_title',
    descKey: 'step_1_desc',
  },
  {
    number: 2,
    emoji: '🎯',
    titleKey: 'step_2_title',
    descKey: 'step_2_desc',
  },
  {
    number: 3,
    emoji: '🌟',
    titleKey: 'step_3_title',
    descKey: 'step_3_desc',
  },
];

export const TESTIMONIALS: Testimonial[] = [
  {
    id: 'testimonial-1',
    initials: 'SM',
    name: 'Sarah M.',
    role: 'Parent of two',
    quote: 'KidsMind has transformed how my children learn. They actually ask to study now! The AI adapts perfectly to each child\'s level.',
    avatarColor: '#FF6B35',
    stars: 5,
  },
  {
    id: 'testimonial-2',
    initials: 'JL',
    name: 'James L.',
    role: 'Elementary teacher',
    quote: 'I recommend KidsMind to all parents. The safety features give me confidence, and the educational content is top-notch.',
    avatarColor: '#4ECDC4',
    stars: 5,
  },
  {
    id: 'testimonial-3',
    initials: 'AR',
    name: 'Amira R.',
    role: 'Mother of three',
    quote: 'The multilingual support is incredible. My kids practice Arabic and French at the same time. It understands context beautifully.',
    avatarColor: '#6C63FF',
    stars: 5,
  },
  {
    id: 'testimonial-4',
    initials: 'DK',
    name: 'David K.',
    role: 'Father & software engineer',
    quote: 'Finally an educational app that takes privacy seriously. The parent dashboard gives me full visibility without being intrusive.',
    avatarColor: '#95E1A0',
    stars: 5,
  },
];
