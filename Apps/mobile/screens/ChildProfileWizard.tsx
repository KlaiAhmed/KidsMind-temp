import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, FormProvider, useForm, useWatch } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { toApiErrorMessage } from '@/contexts/AuthContext';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { AvatarPicker } from '@/components/wizard/AvatarPicker';
import { ChildInfoStep } from '@/components/wizard/ChildInfoStep';
import { ChildRulesStep } from '@/components/wizard/ChildRulesStep';
import { ProfileSummaryStep } from '@/components/wizard/ProfileSummaryStep';
import { WeekScheduleStep } from '@/components/wizard/WeekScheduleStep';
import { WizardStepIndicator } from '@/components/wizard/WizardStepIndicator';
import { useChildProfile } from '@/hooks/useChildProfile';
import {
  buildChildProfileWizardDefaultValues,
  childProfileWizardSchema,
  type ChildProfileWizardFormValues,
} from '@/src/schemas/childProfileWizardSchema';
import {
  deriveBlockedSubjects,
  deriveAgeGroupFromBirthDate,
  deriveTimeWindowFromWeekSchedule,
  educationLevelToBackendStage,
  isChildProfileAgeInRange,
  parseIsoDateOnly,
  WEEKDAY_OPTIONS,
} from '@/src/utils/childProfileWizard';
import { patchChildRules } from '@/services/childService';

const TOTAL_STEPS = 5;

type WizardStep = 1 | 2 | 3 | 4 | 5;

// --- 3. Nickname Animation ---
const NICKNAME_COLORS = {
  from: '#A78BFA',
  mid: '#60A5FA',
  to: '#34D399',
} as const;

interface NicknameCharProps {
  char: string;
  index: number;
  total: number;
}

function NicknameChar({ char, index, total }: NicknameCharProps) {
  const progress = useSharedValue(0);

  const delayMs = total > 0 ? 500 + index * 100 : 0;

  useEffect(() => {
    progress.value = withDelay(
      delayMs,
      withTiming(1, {
        duration: 1000,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [delayMs, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 0.5, 1],
      [NICKNAME_COLORS.from, NICKNAME_COLORS.mid, NICKNAME_COLORS.to],
    ),
  }));

  return (
    <Animated.Text
      style={[
        styles.nicknameChar,
        char === ' ' ? styles.nicknameSpace : null,
        animatedStyle,
      ]}
    >
      {char}
    </Animated.Text>
  );
}

function validateStepOne(childInfo: ChildProfileWizardFormValues['childInfo'] | undefined): boolean {
  if (!childInfo) {
    return false;
  }

  const hasNickname = childInfo.nickname.trim().length > 0;
  const hasEducationLevel = !!childInfo.educationLevel;
  const birthDate = parseIsoDateOnly(childInfo.birthDateIso);
  const hasValidAge = !!birthDate && isChildProfileAgeInRange(birthDate);

  const hasValidOverrideState =
    !childInfo.educationLevel ||
    !childInfo.derivedEducationLevel ||
    childInfo.educationLevel === childInfo.derivedEducationLevel ||
    childInfo.mismatchAcknowledged;

  return hasNickname && hasEducationLevel && hasValidAge && hasValidOverrideState;
}

export default function ChildProfileWizard() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditMode = params.mode === 'edit';

  const {
    profile,
    avatars,
    defaultAvatarId,
    saveChildProfile,
    refreshChildData,
  } = useChildProfile();

  const [step, setStep] = useState<WizardStep>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const defaultValues = useMemo(
    () => buildChildProfileWizardDefaultValues(profile, defaultAvatarId),
    [defaultAvatarId, profile],
  );

  const methods = useForm<ChildProfileWizardFormValues>({
    resolver: zodResolver(childProfileWizardSchema),
    defaultValues,
    mode: 'onChange',
  });

  const methodsRef = useRef(methods);
  methodsRef.current = methods;

  const childInfo = useWatch({ control: methods.control, name: 'childInfo' });
  const schedule = useWatch({ control: methods.control, name: 'schedule' });
  const isStepOneValid = useMemo(() => validateStepOne(childInfo), [childInfo]);
  const hasSelectedDays = WEEKDAY_OPTIONS.some((day) => schedule?.weekSchedule?.[day.key].enabled);
  const hasSelectedSubjects = (schedule?.allowedSubjects?.length ?? 0) > 0;

  useEffect(() => {
    methodsRef.current.reset(defaultValues);
  }, [defaultValues]);

  const showBackButton = isEditMode || step > 1;
  const nextLabel = step === 5 ? (isEditMode ? 'Save Changes' : 'Start Learning') : 'Next';
  const isNextDisabled =
    isSubmitting ||
    (step === 1 && !isStepOneValid) ||
    (step === 3 && (!hasSelectedDays || !hasSelectedSubjects));

  function handleBack() {
    if (step > 1) {
      setStep((current) => (current - 1) as WizardStep);
      return;
    }

    if (isEditMode) {
      router.back();
      return;
    }

    router.replace('/(auth)/login' as never);
  }

  async function handleStepAdvance() {
    const fieldsByStep: Record<WizardStep, Array<keyof ChildProfileWizardFormValues | string>> = {
      1: [
        'childInfo.nickname',
        'childInfo.dob',
        'childInfo.birthDateIso',
        'childInfo.educationLevel',
        'childInfo.mismatchAcknowledged',
      ],
      2: ['avatar.avatarId'],
      3: ['schedule.allowedSubjects', 'schedule.dailyLimitMinutes', 'schedule.weekSchedule'],
      4: [
        'rules.defaultLanguage',
        'rules.homeworkModeEnabled',
        'rules.voiceModeEnabled',
        'rules.audioStorageEnabled',
        'rules.conversationHistoryEnabled',
        'rules.contentSafetyLevel',
      ],
      5: [],
    };

    if (step === 1 && !isStepOneValid) {
      await methods.trigger(fieldsByStep[1] as any, { shouldFocus: true });
      return;
    }

    const valid = await methods.trigger(fieldsByStep[step] as any, { shouldFocus: true });
    if (!valid) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setStep((current) => (Math.min(current + 1, TOTAL_STEPS) as WizardStep));
  }

  async function submit(values: ChildProfileWizardFormValues) {
    if (isSubmitting) {
      return;
    }

    if (!values.childInfo.birthDateIso || !values.childInfo.educationLevel) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const parsedBirthDate = parseIsoDateOnly(values.childInfo.birthDateIso);
      const ageGroup = parsedBirthDate ? (deriveAgeGroupFromBirthDate(parsedBirthDate) ?? undefined) : undefined;
      const blockedSubjects = deriveBlockedSubjects(values.schedule.allowedSubjects);
      const { timeWindowStart, timeWindowEnd } = deriveTimeWindowFromWeekSchedule(
        values.schedule.weekSchedule,
      );

      const savedProfile = await saveChildProfile({
        nickname: values.childInfo.nickname.trim(),
        birthDate: values.childInfo.birthDateIso,
        educationStage: educationLevelToBackendStage(values.childInfo.educationLevel),
        ageGroup,
        languages: [values.rules.defaultLanguage],
        avatarId: values.avatar.avatarId,
      });

      await patchChildRules(savedProfile.id, {
        defaultLanguage: values.rules.defaultLanguage,
        dailyLimitMinutes: values.schedule.dailyLimitMinutes,
        allowedSubjects: values.schedule.allowedSubjects,
        blockedSubjects,
        weekSchedule: values.schedule.weekSchedule,
        timeWindowStart,
        timeWindowEnd,
        homeworkModeEnabled: values.rules.homeworkModeEnabled,
        voiceModeEnabled: values.rules.voiceModeEnabled,
        audioStorageEnabled: values.rules.audioStorageEnabled,
        conversationHistoryEnabled: values.rules.conversationHistoryEnabled,
        contentSafetyLevel: values.rules.contentSafetyLevel,
      });

      await refreshChildData();

      if (isEditMode) {
        router.replace('/(tabs)/profile' as never);
      } else {
        router.replace('/(tabs)' as never);
      }
    } catch (error) {
      setSubmitError(toApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderStepContent() {
    if (step === 1) {
      return <ChildInfoStep />;
    }

    if (step === 2) {
      // --- 1. Header Text Logic ---
      const nickname = (childInfo?.nickname ?? '').trim();
      // Short nicknames stay personal; longer ones use the safe fallback label.
      const headerText = 'Choose your child avatar';
      const avatarSubtitle =
        nickname.length > 0
          ? `${nickname}'s journey starts here. Build brainpower, earn points, and unlock epic looks.`
          : 'Your journey starts here. Build brainpower, earn points, and unlock epic looks.';

      return (
        <View style={[styles.section, styles.sectionFill]}>
          {nickname.length < 7  && nickname.length > 0 ? (
            <View style={styles.nicknameRow} accessibilityRole="text" accessibilityLabel={headerText}>
              <Text style={styles.sectionTitle}>{"Choose "}</Text>
              {nickname.split('').map((char, index) => (
                <NicknameChar key={index} char={char} index={index} total={nickname.length} />
              ))}
              <Text style={styles.sectionTitle}>{"'s avatar"}</Text>
            </View>
          ) : (
            <Text style={styles.sectionTitle}>{headerText}</Text>
          )}

          <Text style={styles.sectionSubtitle}>{avatarSubtitle}</Text>

          <Controller
            control={methods.control}
            name="avatar.avatarId"
            render={({ field: { value, onChange } }) => (
              <AvatarPicker
                avatars={avatars}
                selectedAvatarId={value}
                onSelect={onChange}
                style={styles.pickerList}
              />
            )}
          />
        </View>
      );
    }

    if (step === 3) {
      return <WeekScheduleStep />;
    }

    if (step === 4) {
      return <ChildRulesStep />;
    }

    return <ProfileSummaryStep onEditStep={(targetStep) => setStep((targetStep + 1) as WizardStep)} />;
  }

  const onNextPress =
    step === 5
      ? methods.handleSubmit(submit)
      : () => {
          void handleStepAdvance();
        };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardAvoid}
      >
        <View style={styles.header}>
          {showBackButton ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={handleBack}
              style={({ pressed }) => [styles.backButton, pressed ? styles.backButtonPressed : null]}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color={Colors.text} />
            </Pressable>
          ) : (
            <View style={styles.backButtonSpacer} />
          )}
          <Text style={styles.headerTitle}>
            {isEditMode ? 'Edit Child Profile' : 'Set up your child profile'}
          </Text>
        </View>

        <View style={styles.wizardBody}>
          <WizardStepIndicator step={step} totalSteps={TOTAL_STEPS} />

          <FormProvider {...methods}>
            <View style={styles.stepCard}>
              {step === 2 ? (
                <View style={[styles.stepContent, styles.stepContentFill]}>
                  {renderStepContent()}
                  {submitError ? <Text style={styles.inlineError}>{submitError}</Text> : null}
                </View>
              ) : (
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={[styles.stepContent, styles.stepContentGrow]}
                  showsVerticalScrollIndicator={false}
                  style={styles.stepScrollView}
                >
                  {renderStepContent()}
                  {submitError ? <Text style={styles.inlineError}>{submitError}</Text> : null}
                </ScrollView>
              )}
            </View>
          </FormProvider>
        </View>

      <PrimaryButton
        label={nextLabel}
        loading={isSubmitting}
        disabled={isNextDisabled}
        onPress={onNextPress}
        style={styles.nextButton}
      />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  keyboardAvoid: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 56,
    height: 56,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  backButtonSpacer: {
    width: 56,
    height: 56,
  },
  headerTitle: {
    ...Typography.title,
    color: Colors.text,
    flex: 1,
  },
  wizardBody: {
    flex: 1,
    minHeight: 0,
    gap: Spacing.lg,
  },
  stepCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: Colors.outline,
    overflow: 'hidden',
  },
  stepScrollView: {
    flex: 1,
    minHeight: 0,
  },
  stepContent: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  stepContentGrow: {
    flexGrow: 1,
  },
  stepContentFill: {
    flex: 1,
    minHeight: 0,
  },
  section: {
    gap: Spacing.md,
  },
  sectionFill: {
    flex: 1,
    minHeight: 0,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.text,
  },
  nicknameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  nicknameChar: {
    ...Typography.headline,
    color: Colors.text,
  },
  nicknameSpace: {
    minWidth: 6,
  },
  // --- 2. Paragraph Styles ---
  // Paragraph — refined typography for readability
  sectionSubtitle: {
    ...Typography.body,
    fontWeight: '400',
    lineHeight: 26,
    color: 'rgba(74, 74, 104, 0.6)',
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
    letterSpacing: 0.2,
  },
  pickerList: {
    flex: 1,
    minHeight: 0,
  },
  nextButton: {
    marginTop: Spacing.md,
  },
  inlineError: {
    ...Typography.caption,
    color: Colors.errorText,
  },
});
