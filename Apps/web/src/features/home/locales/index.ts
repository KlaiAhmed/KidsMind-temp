import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { zh } from './zh';
import type { LanguageCode, LocaleSlice } from '../../../locales/types';

export const homeLocales: Record<LanguageCode, LocaleSlice> = {
  en: { home: en },
  fr: { home: fr },
  es: { home: es },
  it: { home: it },
  ar: { home: ar },
  zh: { home: zh },
};

export const homeEn = homeLocales.en;
export const homeFr = homeLocales.fr;
export const homeEs = homeLocales.es;
export const homeIt = homeLocales.it;
export const homeAr = homeLocales.ar;
export const homeZh = homeLocales.zh;

export type HomeTranslations = typeof en;

export * from './ar';
export * from './en';
export * from './es';
export * from './fr';
export * from './it';
export * from './zh';
