import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { zh } from './zh';
import type { LanguageCode, LocaleSlice } from '../../../locales/types';

export const authLocales: Record<LanguageCode, LocaleSlice> = {
  en: { auth: en },
  fr: { auth: fr },
  es: { auth: es },
  it: { auth: it },
  ar: { auth: ar },
  zh: { auth: zh },
};

export const authEn = authLocales.en;
export const authFr = authLocales.fr;
export const authEs = authLocales.es;
export const authIt = authLocales.it;
export const authAr = authLocales.ar;
export const authZh = authLocales.zh;

export type AuthTranslations = typeof en;

export * from './ar';
export * from './en';
export * from './es';
export * from './fr';
export * from './it';
export * from './zh';
