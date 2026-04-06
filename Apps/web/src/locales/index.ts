import { authLocales } from '../features/auth/locales';
import { homeLocales } from '../features/home/locales';
import { onboardingLocales } from '../features/onboarding/locales';
import { parentLocales } from '../features/parent/locales';
import { ar } from './ar';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { zh } from './zh';
import type {
  FeatureLocaleNamespace,
  LanguageCode,
  LocaleSlice,
  TranslationMap,
  Translations,
} from './types';

export type {
  FeatureLocaleNamespace,
  LanguageCode,
  Language,
  TranslationMap,
  Translations,
  LocaleSlice,
} from './types';

export const SUPPORTED_LOCALE_CODES: LanguageCode[] = ['en', 'fr', 'es', 'it', 'ar', 'zh'];

const FEATURE_NAMESPACE_KEYS: FeatureLocaleNamespace[] = ['auth', 'onboarding', 'home', 'parent'];

const commonTranslations: Record<LanguageCode, LocaleSlice> = {
  en,
  fr,
  es,
  it,
  ar,
  zh,
};

const featureLocaleSlices: Record<LanguageCode, LocaleSlice[]> = {
  en: [authLocales.en, onboardingLocales.en, parentLocales.en, homeLocales.en],
  fr: [authLocales.fr, onboardingLocales.fr, parentLocales.fr, homeLocales.fr],
  es: [authLocales.es, onboardingLocales.es, parentLocales.es, homeLocales.es],
  it: [authLocales.it, onboardingLocales.it, parentLocales.it, homeLocales.it],
  ar: [authLocales.ar, onboardingLocales.ar, parentLocales.ar, homeLocales.ar],
  zh: [authLocales.zh, onboardingLocales.zh, parentLocales.zh, homeLocales.zh],
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const deepMergeObjects = (
  base: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = { ...base };

  for (const [key, sourceValue] of Object.entries(source)) {
    const currentValue = result[key];

    if (isRecord(currentValue) && isRecord(sourceValue)) {
      result[key] = deepMergeObjects(currentValue, sourceValue);
      continue;
    }

    result[key] = sourceValue;
  }

  return result;
};

const mergeLocaleSlices = (base: LocaleSlice, slices: LocaleSlice[]): TranslationMap => {
  return slices.reduce<TranslationMap>((accumulator, slice) => {
    return deepMergeObjects(
      accumulator as unknown as Record<string, unknown>,
      slice as Record<string, unknown>
    ) as unknown as TranslationMap;
  }, { ...base } as TranslationMap);
};

const withLegacyFlatAliases = (translation: TranslationMap): TranslationMap => {
  const result = { ...translation } as TranslationMap;

  for (const namespace of FEATURE_NAMESPACE_KEYS) {
    const namespaceSlice = result[namespace];

    if (!isRecord(namespaceSlice)) {
      continue;
    }

    for (const [key, value] of Object.entries(namespaceSlice)) {
      if (!(key in result)) {
        result[key] = value;
      }
    }
  }

  return result;
};

const translations: Translations = SUPPORTED_LOCALE_CODES.reduce<Translations>((accumulator, code) => {
  const mergedTranslation = mergeLocaleSlices(commonTranslations[code], featureLocaleSlices[code]);
  accumulator[code] = withLegacyFlatAliases(mergedTranslation);
  return accumulator;
}, {} as Translations);

export const getTranslationsForLanguage = (language: LanguageCode): TranslationMap => {
  return translations[language] ?? translations.en;
};

export default translations;
