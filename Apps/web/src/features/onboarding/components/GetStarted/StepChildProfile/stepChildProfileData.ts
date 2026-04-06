import type { EducationStageId } from '../../../types';
import type { LanguageCode } from '../../../../../locales/types';

export interface BirthDateParts {
  year: string;
  month: string;
  day: string;
}

export const EDUCATION_STAGE_OPTIONS: { value: EducationStageId; label: string }[] = [
  { value: 'KINDERGARTEN', label: 'Kindergarten' },
  { value: 'PRIMARY', label: 'Primary' },
  { value: 'SECONDARY', label: 'Secondary' },
];

export const EDUCATION_STAGE_ORDER: Record<EducationStageId, number> = {
  KINDERGARTEN: 0,
  PRIMARY: 1,
  SECONDARY: 2,
};

export const LANGUAGE_OPTIONS: { value: LanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'ar', label: 'العربية' },
  { value: 'zh', label: '中文' },
];

export const LANGUAGE_TO_LOCALE: Record<LanguageCode, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-ES',
  it: 'it-IT',
  ar: 'ar',
  zh: 'zh-CN',
};

export const toDateOnly = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const padDatePart = (value: number): string => value.toString().padStart(2, '0');

export const getAllowedMonthBounds = (
  year: number,
  minBirthDate: Date,
  maxBirthDate: Date
): { min: number; max: number } => {
  let min = 1;
  let max = 12;

  if (year === minBirthDate.getFullYear()) {
    min = minBirthDate.getMonth() + 1;
  }

  if (year === maxBirthDate.getFullYear()) {
    max = maxBirthDate.getMonth() + 1;
  }

  return { min, max };
};

export const getAllowedDayBounds = (
  year: number,
  month: number,
  minBirthDate: Date,
  maxBirthDate: Date
): { min: number; max: number } => {
  const daysInMonth = new Date(year, month, 0).getDate();
  let min = 1;
  let max = daysInMonth;

  if (
    year === minBirthDate.getFullYear()
    && month === minBirthDate.getMonth() + 1
  ) {
    min = minBirthDate.getDate();
  }

  if (
    year === maxBirthDate.getFullYear()
    && month === maxBirthDate.getMonth() + 1
  ) {
    max = maxBirthDate.getDate();
  }

  return { min, max };
};

export const normalizeBirthDatePartsForYearChange = (
  currentParts: BirthDateParts,
  yearValue: string,
  minBirthDate: Date,
  maxBirthDate: Date
): BirthDateParts => {
  if (!yearValue) {
    return { year: '', month: '', day: '' };
  }

  const year = Number.parseInt(yearValue, 10);
  if (Number.isNaN(year)) {
    return { year: '', month: '', day: '' };
  }

  const yearMin = minBirthDate.getFullYear();
  const yearMax = maxBirthDate.getFullYear();
  if (year < yearMin || year > yearMax) {
    return { year: '', month: '', day: '' };
  }

  let nextMonth = currentParts.month;
  let nextDay = currentParts.day;

  if (nextMonth) {
    const month = Number.parseInt(nextMonth, 10);
    const monthBounds = getAllowedMonthBounds(year, minBirthDate, maxBirthDate);
    if (Number.isNaN(month) || month < monthBounds.min || month > monthBounds.max) {
      nextMonth = '';
      nextDay = '';
    }
  }

  if (nextMonth && nextDay) {
    const month = Number.parseInt(nextMonth, 10);
    const day = Number.parseInt(nextDay, 10);
    const dayBounds = getAllowedDayBounds(year, month, minBirthDate, maxBirthDate);
    if (Number.isNaN(day) || day < dayBounds.min || day > dayBounds.max) {
      nextDay = '';
    }
  }

  return { year: String(year), month: nextMonth, day: nextDay };
};

export const normalizeBirthDatePartsForMonthChange = (
  currentParts: BirthDateParts,
  monthValue: string,
  minBirthDate: Date,
  maxBirthDate: Date
): BirthDateParts => {
  if (!currentParts.year) {
    return currentParts;
  }

  if (!monthValue) {
    return { year: currentParts.year, month: '', day: '' };
  }

  const year = Number.parseInt(currentParts.year, 10);
  const month = Number.parseInt(monthValue, 10);
  if (Number.isNaN(year) || Number.isNaN(month)) {
    return currentParts;
  }

  const monthBounds = getAllowedMonthBounds(year, minBirthDate, maxBirthDate);
  if (month < monthBounds.min || month > monthBounds.max) {
    return { year: currentParts.year, month: '', day: '' };
  }

  let nextDay = currentParts.day;
  if (nextDay) {
    const day = Number.parseInt(nextDay, 10);
    const dayBounds = getAllowedDayBounds(year, month, minBirthDate, maxBirthDate);
    if (Number.isNaN(day) || day < dayBounds.min || day > dayBounds.max) {
      nextDay = '';
    }
  }

  return { year: currentParts.year, month: String(month), day: nextDay };
};

export const normalizeBirthDatePartsForDayChange = (
  currentParts: BirthDateParts,
  dayValue: string,
  minBirthDate: Date,
  maxBirthDate: Date
): BirthDateParts => {
  if (!currentParts.year || !currentParts.month) {
    return currentParts;
  }

  if (!dayValue) {
    return { year: currentParts.year, month: currentParts.month, day: '' };
  }

  const year = Number.parseInt(currentParts.year, 10);
  const month = Number.parseInt(currentParts.month, 10);
  const day = Number.parseInt(dayValue, 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return currentParts;
  }

  const dayBounds = getAllowedDayBounds(year, month, minBirthDate, maxBirthDate);
  if (day < dayBounds.min || day > dayBounds.max) {
    return currentParts;
  }

  return { year: currentParts.year, month: currentParts.month, day: String(day) };
};