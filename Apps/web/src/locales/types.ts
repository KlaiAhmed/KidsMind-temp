export type LanguageCode = 'en' | 'fr' | 'es' | 'it' | 'ar' | 'zh';

export interface Language {
  code: LanguageCode;
  label: string;
  flag: string;
  dir: 'ltr' | 'rtl';
}

export type FeatureLocaleNamespace = 'auth' | 'onboarding' | 'home' | 'parent';
export type FeatureTranslationMap = Record<string, string>;

export interface TranslationMap {
  dir: 'ltr' | 'rtl';
  auth: FeatureTranslationMap;
  onboarding: FeatureTranslationMap;
  home: FeatureTranslationMap;
  parent: FeatureTranslationMap;
  [key: string]: any;
}

export type Translations = Record<LanguageCode, TranslationMap>;
export type LocaleSlice = Partial<TranslationMap>;
