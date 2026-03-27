/** Form validation functions for login, parent account, child profile, and preferences forms. */
import type {
  FormErrors,
  ParentAccountFormData,
  ChildProfileFormData,
  PreferencesFormData,
} from '../types';

// ─── Individual Field Validators ──────────────────────────────────────────────

/**
 * validateEmail — checks format using RFC-compliant regex.
 *
 * Validates that the string looks like a proper email address
 * with a local part, @ symbol, and domain with at least one dot.
 *
 * @param email - The email string to validate
 * @returns Error message string, or empty string if valid
 */
const validateEmail = (email: string): string => {
  if (!email.trim()) {
    return 'error_email_required';
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return 'error_email_invalid';
  }
  return '';
};

/**
 * validatePassword — enforces minimum security requirements.
 *
 * Requirements: at least 8 characters, 1 uppercase letter, 1 number.
 *
 * @param password - The password string to validate
 * @returns Error message string, or empty string if valid
 */
const validatePassword = (password: string): string => {
  if (!password) {
    return 'error_password_required';
  }
  if (password.length < 8) {
    return 'error_password_too_short';
  }
  if (!/[A-Z]/.test(password)) {
    return 'error_password_no_uppercase';
  }
  if (!/[0-9]/.test(password)) {
    return 'error_password_no_number';
  }
  return '';
};

/**
 * getPasswordStrength — returns a 0–3 score for the password strength meter.
 *
 * Scoring criteria:
 * - 0: empty or very short (< 4 chars)
 * - 1: weak — meets length but few criteria
 * - 2: fair — meets some criteria
 * - 3: strong — meets all criteria (length, uppercase, number, special char)
 *
 * @param password - The password string to evaluate
 * @returns A score from 0 to 3
 */
const getPasswordStrength = (password: string): 0 | 1 | 2 | 3 => {
  if (!password || password.length < 4) return 0;

  let score = 0;

  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return 1;
  if (score <= 2) return 2;
  return 3;
};

/**
 * validateNickname — enforces 2–20 character limit with no special characters.
 *
 * Allows letters (any script via Unicode), numbers, spaces, and hyphens.
 *
 * @param nickname - The nickname string to validate
 * @returns Error message string, or empty string if valid
 */
const validateNickname = (nickname: string): string => {
  if (!nickname.trim()) {
    return 'error_nickname_required';
  }
  if (nickname.trim().length < 2) {
    return 'error_nickname_too_short';
  }
  if (nickname.trim().length > 20) {
    return 'error_nickname_too_long';
  }
  return '';
};

/**
 * validatePinCode — must be exactly 4 numeric digits.
 *
 * @param pin - The PIN code string to validate
 * @returns Error message string, or empty string if valid
 */
const validatePinCode = (pin: string): string => {
  if (!pin) {
    return 'error_pin_required';
  }
  if (!/^\d{4}$/.test(pin)) {
    return 'error_pin_must_be_4_digits';
  }
  return '';
};

// ─── Composite Form Validators ────────────────────────────────────────────────

/**
 * validateLoginForm — validates email and password fields together.
 *
 * @param values - Object with email and password fields
 * @returns FormErrors object — empty means no errors
 */
const validateLoginForm = (values: { email: string; password: string }): FormErrors => {
  const errors: FormErrors = {};

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;

  return errors;
};

/**
 * validateParentAccountStep — validates step 1 of onboarding.
 *
 * Checks email, password, confirm password match, country selection,
 * and terms agreement.
 *
 * @param values - The parent account form data
 * @returns FormErrors object
 */
const validateParentAccountStep = (values: ParentAccountFormData): FormErrors => {
  const errors: FormErrors = {};

  const emailError = validateEmail(values.email);
  if (emailError) errors.email = emailError;

  const passwordError = validatePassword(values.password);
  if (passwordError) errors.password = passwordError;

  if (!values.confirmPassword) {
    errors.confirmPassword = 'error_password_required';
  } else if (values.password !== values.confirmPassword) {
    errors.confirmPassword = 'error_passwords_dont_match';
  }

  if (!values.country) {
    errors.country = 'error_country_required';
  }

  if (!values.agreedToTerms) {
    errors.agreedToTerms = 'gs_terms_required_error';
  }

  return errors;
};

/**
 * validateChildProfileStep — validates step 2 of onboarding.
 *
 * Checks nickname, birth date, and education stage.
 *
 * @param values - The child profile form data
 * @returns FormErrors object
 */
const validateChildProfileStep = (values: ChildProfileFormData): FormErrors => {
  const errors: FormErrors = {};

  const nicknameError = validateNickname(values.nickname);
  if (nicknameError) errors.nickname = nicknameError;

  if (!values.birthDate) {
    errors.birthDate = 'error_age_group_required';
  } else {
    const birthDate = new Date(values.birthDate);
    const today = new Date();
    if (Number.isNaN(birthDate.getTime()) || birthDate > today) {
      errors.birthDate = 'error_age_group_required';
    } else {
      const age = today.getFullYear() - birthDate.getFullYear() - (
        today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0
      );
      if (age < 3 || age > 15) {
        errors.birthDate = 'error_age_group_required';
      }
    }
  }

  if (!values.educationStage) {
    errors.educationStage = 'error_grade_required';
  }

  return errors;
};

/**
 * validatePreferencesStep — validates step 3 of onboarding.
 *
 * Checks PIN code validity and that PINs match.
 *
 * @param values - The preferences form data
 * @returns FormErrors object
 */
const validatePreferencesStep = (values: PreferencesFormData): FormErrors => {
  const errors: FormErrors = {};

  const pinError = validatePinCode(values.parentPinCode);
  if (pinError) errors.parentPinCode = pinError;

  if (!values.confirmPinCode) {
    errors.confirmPinCode = 'error_pin_required';
  } else if (values.parentPinCode !== values.confirmPinCode) {
    errors.confirmPinCode = 'error_pins_dont_match';
  }

  if (values.allowedSubjects.length < 2) {
    errors.allowedSubjects = 'error_min_two_subjects';
  }

  return errors;
};

export {
  validateEmail,
  validatePassword,
  getPasswordStrength,
  validateNickname,
  validatePinCode,
  validateLoginForm,
  validateParentAccountStep,
  validateChildProfileStep,
  validatePreferencesStep,
};
