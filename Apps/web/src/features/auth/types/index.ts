import type { LanguageCode, TranslationMap } from '../../../locales/types';
import type { ThemeMode } from '../../../types';

export interface AuthLayoutProps {
  illustrationVariant: 'login' | 'register';
  children: React.ReactNode;
  translations: TranslationMap;
  language: LanguageCode;
  onLanguageChange: (code: LanguageCode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}
