/** GetStartedPage — Multi-step onboarding flow for new parent registration with 4 steps. */
import { useState, useCallback, useEffect } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { useLanguage } from '../../hooks/useLanguage';
import { useMultiStep } from '../../hooks/useMultiStep';
import { useMeSummaryQuery } from '../../hooks/api/useMeSummaryQuery';
import { useRegisterMutation } from '../../hooks/api/useRegisterMutation';
import { apiClient } from '../../lib/api';
import { getPrimaryTimezoneByCountryCode } from '../../utils/countries';
import type {
  OnboardingStep,
  ParentAccountFormData,
  ChildProfileFormData,
  PreferencesFormData,
  SubjectId,
  TranslationMap,
  WeekdayId,
} from '../../types';
import AuthLayout from '../../components/shared/AuthLayout/AuthLayout';
import StepIndicator from '../../components/GetStarted/StepIndicator/StepIndicator';
import StepParentAccount from '../../components/GetStarted/StepParentAccount/StepParentAccount';
import StepChildProfile from '../../components/GetStarted/StepChildProfile/StepChildProfile';
import StepPreferences from '../../components/GetStarted/StepPreferences/StepPreferences';
import StepWelcome from '../../components/GetStarted/StepWelcome/StepWelcome';
import styles from './GetStartedPage.module.css';

/** Total number of steps in the onboarding flow */
const TOTAL_STEPS = 4;

interface ChildCreateSuccessResponse {
  id?: number | string;
  child_id?: number | string;
}

interface ChildSettingsPayload {
  dailyLimitMinutes: number;
  allowedSubjects: SubjectId[];
  allowedWeekdays: WeekdayId[];
  enableVoice: boolean;
  storeAudioHistory: boolean;
}

interface SafetyAndRulesPatchPayload {
  childSettings: ChildSettingsPayload;
  parentPin: string;
}

const toSafeDailyLimitMinutes = (value: number): number => {
  const normalizedValue = Number.isInteger(value) ? value : Math.round(value);
  return Math.min(120, Math.max(15, normalizedValue));
};

const buildSafetyAndRulesPatchPayload = (data: PreferencesFormData): SafetyAndRulesPatchPayload => {
  return {
    childSettings: {
      dailyLimitMinutes: toSafeDailyLimitMinutes(data.dailyLimitMinutes),
      allowedSubjects: data.allowedSubjects,
      allowedWeekdays: data.allowedWeekdays,
      enableVoice: data.enableVoice,
      storeAudioHistory: data.enableVoice ? data.storeAudioHistory : false,
    },
    parentPin: data.parentPinCode,
  };
};

const API_ERROR_TRANSLATION_PATTERNS: Array<{ pattern: RegExp; key: keyof TranslationMap }> = [
  { pattern: /invalid credentials/i, key: 'login_error_invalid' },
  { pattern: /csrf/i, key: 'login_error_session' },
  { pattern: /nickname cannot be blank/i, key: 'error_nickname_required' },
  { pattern: /birth_date cannot be in the future|birth_date must correspond to an age between 3 and 15/i, key: 'error_birth_date_invalid' },
  { pattern: /parent pin must be exactly 4 digits/i, key: 'error_pin_must_be_4_digits' },
  { pattern: /at least 8 characters/i, key: 'error_password_too_short' },
  { pattern: /one uppercase/i, key: 'error_password_no_uppercase' },
  { pattern: /one number/i, key: 'error_password_no_number' },
  { pattern: /value is not a valid email address/i, key: 'error_email_invalid' },
];

const hasTranslationKey = (translations: TranslationMap, key: string): key is keyof TranslationMap => {
  return Object.prototype.hasOwnProperty.call(translations, key);
};

const mapApiMessageToTranslationKey = (message: string): keyof TranslationMap | null => {
  for (const item of API_ERROR_TRANSLATION_PATTERNS) {
    if (item.pattern.test(message)) {
      return item.key;
    }
  }

  return null;
};

const translateApiMessage = (message: string, translations: TranslationMap): string => {
  const normalizedMessage = message.trim();

  if (!normalizedMessage) {
    return translations.status_error_description;
  }

  if (hasTranslationKey(translations, normalizedMessage)) {
    return translations[normalizedMessage];
  }

  const mappedKey = mapApiMessageToTranslationKey(normalizedMessage);
  if (mappedKey) {
    return translations[mappedKey];
  }

  return normalizedMessage;
};

/**
 * Builds the step configuration array with current completion state.
 */
const buildStepConfig = (currentIndex: number): OnboardingStep[] => {
  const stepDefinitions: Array<{
    titleKey: keyof TranslationMap;
    subtitleKey: keyof TranslationMap;
    iconName: string;
  }> = [
    { titleKey: 'gs_step1_title', subtitleKey: 'gs_step1_subtitle', iconName: 'User' },
    { titleKey: 'gs_step2_title', subtitleKey: 'gs_step2_subtitle', iconName: 'UserPlus' },
    { titleKey: 'gs_step3_title', subtitleKey: 'gs_step3_subtitle', iconName: 'Shield' },
    { titleKey: 'gs_step4_title', subtitleKey: 'gs_step4_subtitle', iconName: 'CheckCircle' },
  ];

  return stepDefinitions.map((stepDefinition, index) => ({
    index,
    titleKey: stepDefinition.titleKey,
    subtitleKey: stepDefinition.subtitleKey,
    iconName: stepDefinition.iconName,
    isComplete: index < currentIndex,
  }));
};

const GetStartedPage = () => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, translations } = useLanguage();
  const { isAuthenticated, isLoading: isAuthLoading } = useMeSummaryQuery();
  const registerMutation = useRegisterMutation();
  const {
    currentStepIndex,
    goToNextStep,
    goToStep,
  } = useMultiStep(TOTAL_STEPS);

  // ─── Onboarding State ──────────────────────────────────────────────────
  const [parentData, setParentData] = useState<Partial<ParentAccountFormData>>({});
  const [childData, setChildData] = useState<Partial<ChildProfileFormData>>({});
  const [preferencesData, setPreferencesData] = useState<Partial<PreferencesFormData>>({});
  const [childId, setChildId] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState('');

  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');

  // ─── Auth Redirect: Skip step 1 if already logged in ────────────────────
  useEffect(() => {
    if (!isAuthLoading && isAuthenticated && currentStepIndex === 0) {
      goToStep(1); // Jump to step 2 (child profile)
    }
  }, [isAuthLoading, isAuthenticated, currentStepIndex, goToStep]);

  const handleParentComplete = useCallback(
    async (data: ParentAccountFormData): Promise<void> => {
      setSubmitError('');

      try {
        const timezone = getPrimaryTimezoneByCountryCode(data.country);

        await registerMutation.mutateAsync({
          email: data.email,
          password: data.password,
          password_confirmation: data.confirmPassword,
          country: data.country,
          timezone,
          agreed_to_terms: data.agreedToTerms,
        });

        setParentData(data);
        setChildData({});
        setPreferencesData({});
        setChildId(null);
        setDirection('forward');
        goToNextStep();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? translateApiMessage(error.message, translations)
            : translations.status_error_description
        );
      }
    },
    [goToNextStep, registerMutation, translations]
  );

  const handleChildComplete = useCallback(
    async (data: ChildProfileFormData): Promise<void> => {
      setSubmitError('');

      try {
        const childPayload = {
          nickname: data.nickname,
          birth_date: data.birthDate,
          education_stage: data.educationStage,
          languages: [data.preferredLanguage],
          avatar: data.avatarEmoji,
        };

        const childResponse = await apiClient.post<ChildCreateSuccessResponse>('/api/v1/children', {
          body: childPayload,
        });

        const childBody = childResponse.data;
        const rawChildId = childBody.child_id ?? childBody.id;
        const numericChildId = Number(rawChildId);

        if (!rawChildId || Number.isNaN(numericChildId)) {
          throw new Error(translations.status_error_description);
        }

        setChildId(numericChildId);
        setChildData(data);
        setDirection('forward');
        goToNextStep();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? translateApiMessage(error.message, translations)
            : translations.status_error_description
        );
      }
    },
    [goToNextStep, translations]
  );

  const handlePreferencesComplete = useCallback(
    async (data: PreferencesFormData) => {
      setSubmitError('');

      if (childId === null) {
        setSubmitError(translations.status_error_description);
        return;
      }

      try {
        const patchPayload = buildSafetyAndRulesPatchPayload(data);

        await apiClient.patch('/api/v1/safety-and-rules', {
          body: patchPayload,
        });

        setPreferencesData(data);
        setDirection('forward');
        goToNextStep();
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? translateApiMessage(error.message, translations)
            : translations.status_error_description
        );
      }
    },
    [childId, goToNextStep, translations]
  );

  const handleFinish = () => {
    window.location.href = '/dashboard';
  };

  const onboardingSteps = buildStepConfig(currentStepIndex);

  const containerClassName = direction === 'backward'
    ? styles.stepContainerBackward
    : styles.stepContainerForward;

  return (
    <div
      data-theme={theme}
      dir={translations.dir}
      lang={language}
    >
      <AuthLayout
        illustrationVariant="register"
        translations={translations}
        language={language}
        onLanguageChange={setLanguage}
        theme={theme}
        onToggleTheme={toggleTheme}
      >
        <StepIndicator steps={onboardingSteps} currentIndex={currentStepIndex} translations={translations} />

        <div className={containerClassName} key={currentStepIndex}>
          {currentStepIndex === 0 && (
            <StepParentAccount
              translations={translations}
              language={language}
              onComplete={handleParentComplete}
              submitError={submitError}
            />
          )}
          {currentStepIndex === 1 && (
            <StepChildProfile
              translations={translations}
              language={language}
              onComplete={handleChildComplete}
              submitError={submitError}
            />
          )}
          {currentStepIndex === 2 && (
            <StepPreferences
              translations={translations}
              onComplete={handlePreferencesComplete}
              submitError={submitError}
            />
          )}
          {currentStepIndex === 3 && (
            <StepWelcome
              translations={translations}
              parentData={parentData}
              childData={childData}
              preferencesData={preferencesData}
              onFinish={handleFinish}
            />
          )}
        </div>

        {!isAuthenticated && currentStepIndex < TOTAL_STEPS - 1 && (
          <div className={styles.bottomLink}>
            <span>{translations.gs_already_have_account}</span>
            <a href="/login" className={styles.bottomLinkAnchor}>
              {translations.gs_login_link}
            </a>
          </div>
        )}
      </AuthLayout>
    </div>
  );
};

export default GetStartedPage;
