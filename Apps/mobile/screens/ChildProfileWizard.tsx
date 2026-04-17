import { useEffect, useMemo, useState } from 'react';
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
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { FormTextInput } from '@/components/ui/FormTextInput';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { AvatarPicker } from '@/components/wizard/AvatarPicker';
import { SubjectInterestPicker } from '@/components/wizard/SubjectInterestPicker';
import { WizardStepIndicator } from '@/components/wizard/WizardStepIndicator';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useSubjects } from '@/hooks/useSubjects';
import type { WizardState } from '@/types/child';

const MIN_AGE = 4;
const MAX_AGE = 14;

const ageOptions = Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, index) => MIN_AGE + index);

type Direction = 'forward' | 'backward';

function isNameValid(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return false;
  }

  return /^[A-Za-z'\-\s]+$/.test(trimmed);
}

export default function ChildProfileWizard() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditMode = params.mode === 'edit';

  const {
    profile,
    avatars,
    initialWizardState,
    saveWizardState,
  } = useChildProfile();
  const { allSubjects } = useSubjects();

  const [wizard, setWizard] = useState<WizardState>(initialWizardState);
  const [direction, setDirection] = useState<Direction>('forward');
  const [nameError, setNameError] = useState<string | undefined>();
  const [isCompletingSetup, setIsCompletingSetup] = useState(false);

  useEffect(() => {
    setWizard(initialWizardState);
  }, [initialWizardState]);

  useEffect(() => {
    if (isEditMode || !isCompletingSetup) {
      return;
    }

    if (profile) {
      router.replace('/(tabs)' as never);
      setIsCompletingSetup(false);
    }
  }, [isCompletingSetup, isEditMode, profile, router]);

  const selectedSubjectNames = useMemo(
    () =>
      allSubjects
        .filter((subject) => wizard.selectedSubjectIds.includes(subject.id))
        .map((subject) => subject.title),
    [allSubjects, wizard.selectedSubjectIds]
  );

  const nextDisabled =
    isCompletingSetup ||
    (wizard.step === 1 && !isNameValid(wizard.childName)) ||
    (wizard.step === 2 && wizard.age === null) ||
    (wizard.step === 4 && wizard.selectedSubjectIds.length === 0);

  const nextLabel = wizard.step === 5 ? 'Start Learning' : 'Next';
  const showBackButton = isEditMode || wizard.step > 1;

  function moveToStep(step: WizardState['step']) {
    setWizard((current) => ({
      ...current,
      step,
    }));
  }

  function handleBack() {
    if (wizard.step > 1) {
      setDirection('backward');
      moveToStep((wizard.step - 1) as WizardState['step']);
      return;
    }

    if (isEditMode) {
      router.back();
      return;
    }

    router.replace('/(auth)/login' as never);
  }

  function handleNext() {
    if (wizard.step === 1) {
      const valid = isNameValid(wizard.childName);
      setNameError(valid ? undefined : 'Name must be at least 2 letters and contain no numbers.');
      if (!valid) {
        return;
      }
    }

    if (wizard.step === 2 && wizard.age === null) {
      return;
    }

    if (wizard.step === 4 && wizard.selectedSubjectIds.length === 0) {
      return;
    }

    if (wizard.step === 5) {
      if (isCompletingSetup) {
        return;
      }

      saveWizardState(wizard);

      if (isEditMode) {
        router.replace('/(tabs)/profile' as never);
      } else {
        setIsCompletingSetup(true);
      }

      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setDirection('forward');
    moveToStep((wizard.step + 1) as WizardState['step']);
  }

  function toggleSubject(subjectId: string) {
    setWizard((current) => {
      const exists = current.selectedSubjectIds.includes(subjectId);
      return {
        ...current,
        selectedSubjectIds: exists
          ? current.selectedSubjectIds.filter((entry) => entry !== subjectId)
          : [...current.selectedSubjectIds, subjectId],
      };
    });
  }

  const entering = direction === 'forward' ? SlideInRight.duration(300) : SlideInLeft.duration(300);
  const exiting = direction === 'forward' ? SlideOutLeft.duration(220) : SlideOutRight.duration(220);

  function renderStepContent() {
    return (
      <>
        {wizard.step === 1 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What should we call you?</Text>
            <Text style={styles.sectionSubtitle}>Pick a name your child loves to hear.</Text>
            <FormTextInput
              label="Child Name"
              placeholder="Enter child name"
              value={wizard.childName}
              onChangeText={(value) => {
                setNameError(undefined);
                setWizard((current) => ({
                  ...current,
                  childName: value,
                }));
              }}
              error={nameError}
            />
          </View>
        ) : null}

        {wizard.step === 2 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How old are you?</Text>
            <Text style={styles.sectionSubtitle}>Tap an age to personalize the lessons.</Text>
            <View style={styles.ageGrid}>
              {ageOptions.map((age) => {
                const selected = wizard.age === age;

                return (
                  <Pressable
                    key={`age-${age}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Select age ${age}`}
                    accessibilityState={{ selected }}
                    onPress={() =>
                      setWizard((current) => ({
                        ...current,
                        age,
                      }))
                    }
                    style={({ pressed }) => [
                      styles.ageButton,
                      selected ? styles.ageButtonSelected : null,
                      pressed ? styles.ageButtonPressed : null,
                    ]}
                  >
                    <Text style={[styles.ageText, selected ? styles.ageTextSelected : null]}>{age}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {wizard.step === 3 ? (
          <View style={[styles.section, styles.sectionFill]}>
            <Text style={styles.sectionTitle}>Choose your avatar</Text>
            <Text style={styles.sectionSubtitle}>This buddy appears on your dashboard.</Text>
            <AvatarPicker
              avatars={avatars}
              selectedAvatarId={wizard.avatarId}
              onSelect={(avatarId) =>
                setWizard((current) => ({
                  ...current,
                  avatarId,
                }))
              }
              style={styles.pickerList}
            />
          </View>
        ) : null}

        {wizard.step === 4 ? (
          <View style={[styles.section, styles.sectionFill]}>
            <Text style={styles.sectionTitle}>Pick your favorite subjects</Text>
            <Text style={styles.sectionSubtitle}>Select at least one subject to continue.</Text>
            <SubjectInterestPicker
              subjects={allSubjects}
              selectedSubjectIds={wizard.selectedSubjectIds}
              onToggleSubject={toggleSubject}
              style={styles.pickerList}
            />
            {wizard.selectedSubjectIds.length === 0 ? (
              <Text style={styles.inlineError}>Please choose at least one subject.</Text>
            ) : null}
          </View>
        ) : null}

        {wizard.step === 5 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>You are all set!</Text>
            <Text style={styles.sectionSubtitle}>Review and begin your learning adventure.</Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Name</Text>
                <Text style={styles.summaryValue}>{wizard.childName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Age</Text>
                <Text style={styles.summaryValue}>{wizard.age ?? '--'}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subjects</Text>
                <Text style={styles.summaryValue}>
                  {selectedSubjectNames.length > 0 ? selectedSubjectNames.join(', ') : 'None selected'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Daily Goal</Text>
                <Text style={styles.summaryValue}>{profile?.dailyGoalMinutes ?? 25} min</Text>
              </View>
            </View>
          </View>
        ) : null}
      </>
    );
  }

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
          <WizardStepIndicator step={wizard.step} totalSteps={5} />

          <Animated.View key={wizard.step} entering={entering} exiting={exiting} style={styles.stepCard}>
            {wizard.step === 3 || wizard.step === 4 ? (
              <View style={styles.stepContent}>{renderStepContent()}</View>
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                style={styles.stepScrollView}
              >
                {renderStepContent()}
              </ScrollView>
            )}
          </Animated.View>
        </View>

        <PrimaryButton
          label={nextLabel}
          loading={isCompletingSetup}
          disabled={nextDisabled}
          onPress={handleNext}
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
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    padding: Spacing.md,
  },
  stepScrollView: {
    flex: 1,
    minHeight: 0,
  },
  stepContent: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
    gap: Spacing.md,
    paddingBottom: Spacing.md,
  },
  section: {
    gap: Spacing.md,
  },
  sectionFill: {
    flex: 1,
    minHeight: 0,
  },
  pickerList: {
    flex: 1,
    minHeight: 0,
  },
  sectionTitle: {
    ...Typography.headline,
    color: Colors.text,
  },
  sectionSubtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  ageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  ageButton: {
    width: 64,
    height: 64,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ageButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  ageButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  ageText: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  ageTextSelected: {
    color: Colors.white,
  },
  inlineError: {
    ...Typography.caption,
    color: Colors.errorText,
  },
  summaryCard: {
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  summaryLabel: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
    minWidth: 78,
  },
  summaryValue: {
    ...Typography.bodyMedium,
    color: Colors.text,
    flex: 1,
    textAlign: 'right',
  },
  nextButton: {
    marginTop: Spacing.md,
  },
});
