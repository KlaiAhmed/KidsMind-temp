import type { ReactNode } from 'react';
import { ClipboardList, Home, Settings, Shield, User, UserCircle } from 'lucide-react';
import type { TranslationMap } from '../locales/types';

export interface ParentNavItem {
  label: string;
  to: string;
  icon: ReactNode;
}

export const WINDOW_SIZE = 2;

export const buildParentMainNav = (translations: TranslationMap): ParentNavItem[] => {
  return [
    { label: translations.nav_profile, to: '/parent/profile', icon: <UserCircle size={20} strokeWidth={2} /> },
    { label: translations.dashboard_page_title, to: '/parent/dashboard', icon: <Home size={20} strokeWidth={2} /> },
    { label: translations.dashboard_settings_profile, to: '/parent/children', icon: <User size={20} strokeWidth={2} /> },
    { label: translations.dashboard_child_activity_title, to: '/parent/insights', icon: <ClipboardList size={20} strokeWidth={2} /> },
    { label: translations.dashboard_settings_title, to: '/parent/settings', icon: <Settings size={20} strokeWidth={2} /> },
    { label: translations.settings_privacy, to: '/parent/subscription', icon: <Shield size={20} strokeWidth={2} /> },
  ];
};

export const getParentPageTitle = (pathname: string, translations: TranslationMap): string => {
  if (/^\/parent\/profile/.test(pathname)) return translations.nav_profile;
  if (/^\/parent\/dashboard/.test(pathname)) return translations.dashboard_page_title;
  if (/^\/parent\/children/.test(pathname)) return translations.dashboard_settings_profile;
  if (/^\/parent\/insights/.test(pathname)) return translations.dashboard_child_activity_title;
  if (/^\/parent\/settings/.test(pathname)) return translations.dashboard_settings_title;
  if (/^\/parent\/subscription/.test(pathname)) return translations.settings_privacy;
  return translations.dashboard_page_title;
};