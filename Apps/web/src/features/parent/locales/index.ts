import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { zh } from './zh';
import type { LanguageCode, LocaleSlice } from '../../../locales/types';

export const parentLocales: Record<LanguageCode, LocaleSlice> = {
  en: { parent: en },
  fr: { parent: fr },
  es: { parent: es },
  it: { parent: it },
  ar: { parent: ar },
  zh: { parent: zh },
};

export const parentEn = parentLocales.en;
export const parentFr = parentLocales.fr;
export const parentEs = parentLocales.es;
export const parentIt = parentLocales.it;
export const parentAr = parentLocales.ar;
export const parentZh = parentLocales.zh;

export type ParentTranslations = typeof en;

export * from './ar';
export * from './en';
export * from './es';
export * from './fr';
export * from './it';
export * from './zh';
