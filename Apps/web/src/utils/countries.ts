import countries from 'world-countries';
import type { LanguageCode } from '../types';

export interface CountryOption {
  value: string;
  label: string;
}

const LANGUAGE_TO_COUNTRY_TRANSLATION_KEY: Record<LanguageCode, string> = {
  en: 'eng',
  fr: 'fra',
  es: 'spa',
  it: 'ita',
  ar: 'ara',
  ch: 'zho',
};

const getLocalizedCountryName = (country: (typeof countries)[number], language: LanguageCode): string => {
  const translationKey = LANGUAGE_TO_COUNTRY_TRANSLATION_KEY[language];
  const translated = country.translations?.[translationKey]?.common;
  return translated || country.name.common;
};

const getCountryOptions = (language: LanguageCode): CountryOption[] => {
  return countries
    .filter((country) => country.cca2!== 'IL')
    .map((country) => ({
      value: country.cca2,
      label: getLocalizedCountryName(country, language),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, language === 'ch' ? 'zh' : language, { sensitivity: 'base' }));
};

const getPrimaryTimezoneByCountryCode = (countryCode: string): string => {
  const normalizedCountryCode = countryCode.trim().toUpperCase();
  if (!normalizedCountryCode) {
    return 'UTC';
  }

  const country = countries.find((item) => item.cca2 === normalizedCountryCode);
  const countryWithTimezone = country as (typeof countries)[number] & { timezones?: string[] };

  if (!countryWithTimezone || !Array.isArray(countryWithTimezone.timezones) || countryWithTimezone.timezones.length === 0) {
    return 'UTC';
  }

  return countryWithTimezone.timezones[0] ?? 'UTC';
};

export { getCountryOptions, getPrimaryTimezoneByCountryCode };
