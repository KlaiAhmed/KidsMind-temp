import type { EducationStageId } from '../features/onboarding/types';

const MIN_CHILD_AGE = 3;
const MAX_CHILD_AGE = 15;

const calculateAgeFromBirthDate = (birthDateInput: string, today: Date = new Date()): number | null => {
  if (!birthDateInput) {
    return null;
  }

  const birthDate = new Date(birthDateInput);

  if (Number.isNaN(birthDate.getTime()) || birthDate > today) {
    return null;
  }

  const hasBirthdayPassedThisYear = today >= new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());
  return today.getFullYear() - birthDate.getFullYear() - (hasBirthdayPassedThisYear ? 0 : 1);
};

const deriveEducationStageFromAge = (age: number): EducationStageId | null => {
  if (age >= 3 && age <= 6) {
    return 'KINDERGARTEN';
  }

  if (age >= 7 && age <= 11) {
    return 'PRIMARY';
  }

  if (age >= 12 && age <= 15) {
    return 'SECONDARY';
  }

  return null;
};

const deriveEducationStageFromBirthDate = (birthDateInput: string): EducationStageId | null => {
  const age = calculateAgeFromBirthDate(birthDateInput);

  if (age === null) {
    return null;
  }

  return deriveEducationStageFromAge(age);
};

export {
  MIN_CHILD_AGE,
  MAX_CHILD_AGE,
  calculateAgeFromBirthDate,
  deriveEducationStageFromAge,
  deriveEducationStageFromBirthDate,
};
