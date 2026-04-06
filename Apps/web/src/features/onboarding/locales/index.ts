import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { zh } from './zh';
import type { LanguageCode, LocaleSlice } from '../../../locales/types';

export const onboardingLocales: Record<LanguageCode, LocaleSlice> = {
  en: { onboarding: en },
  fr: { onboarding: fr },
  es: { onboarding: es },
  it: { onboarding: it },
  ar: { onboarding: ar },
  zh: { onboarding: zh },
};

export const onboardingEn = onboardingLocales.en;
export const onboardingFr = onboardingLocales.fr;
export const onboardingEs = onboardingLocales.es;
export const onboardingIt = onboardingLocales.it;
export const onboardingAr = onboardingLocales.ar;
export const onboardingZh = onboardingLocales.zh;

export type OnboardingTranslations = typeof en;

export * from './ar';
export * from './en';
export * from './es';
export * from './fr';
export * from './it';
export * from './zh';
