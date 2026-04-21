import { useEffect } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LabeledToggleRow } from '@/components/ui/LabeledToggleRow';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { ChildProfileWizardFormValues } from '@/src/schemas/childProfileWizardSchema';
import { deriveBlockedSubjects, LANGUAGE_OPTIONS } from '@/src/utils/childProfileWizard';

export function ChildRulesStep() {
  const {
    control,
    formState: { errors },
    setValue,
  } = useFormContext<ChildProfileWizardFormValues>();

  const defaultLanguage = useWatch({ control, name: 'rules.defaultLanguage' });
  const blockedSubjects = useWatch({ control, name: 'rules.blockedSubjects' });
  const homeworkModeEnabled = useWatch({ control, name: 'rules.homeworkModeEnabled' });
  const voiceModeEnabled = useWatch({ control, name: 'rules.voiceModeEnabled' });
  const audioStorageEnabled = useWatch({ control, name: 'rules.audioStorageEnabled' });
  const conversationHistoryEnabled = useWatch({ control, name: 'rules.conversationHistoryEnabled' });
  const allowedSubjects = useWatch({ control, name: 'schedule.allowedSubjects' });

  useEffect(() => {
    const derivedBlockedSubjects = deriveBlockedSubjects(allowedSubjects);
    const alreadyDerived =
      blockedSubjects.length === derivedBlockedSubjects.length
      && blockedSubjects.every((subject, index) => subject === derivedBlockedSubjects[index]);

    if (alreadyDerived) {
      return;
    }

    setValue('rules.blockedSubjects', derivedBlockedSubjects, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [allowedSubjects, blockedSubjects, setValue]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Child Rules</Text>
      <Text style={styles.subtitle}>Set language and usage controls.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Default Language</Text>
        <View style={styles.chipRow}>
          {LANGUAGE_OPTIONS.map((option) => {
            const selected = option.value === defaultLanguage;
            const nextDefaultLanguage = option.value as ChildProfileWizardFormValues['rules']['defaultLanguage'];

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityLabel={`Set default language to ${option.label}`}
                accessibilityState={{ selected }}
                onPress={() => {
                  setValue('rules.defaultLanguage', nextDefaultLanguage, {
                    shouldDirty: true,
                    shouldValidate: true,
                  });
                }}
                style={({ pressed }) => [
                  styles.languageChip,
                  selected ? styles.languageChipSelected : null,
                  pressed ? styles.chipPressed : null,
                ]}
              >
                <Text style={[styles.languageChipText, selected ? styles.chipTextSelected : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {errors.rules?.defaultLanguage?.message ? (
          <Text style={styles.errorText}>{errors.rules.defaultLanguage.message}</Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <LabeledToggleRow
          label="Homework Mode"
          description="Prioritize school-style tasks and structured exercises."
          value={homeworkModeEnabled}
          onValueChange={(nextValue) => {
            setValue('rules.homeworkModeEnabled', nextValue, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          accessibilityLabel="Toggle homework mode"
        />
        <LabeledToggleRow
          label="Voice Mode"
          description="Allow voice interactions with the assistant."
          value={voiceModeEnabled}
          onValueChange={(nextValue) => {
            setValue('rules.voiceModeEnabled', nextValue, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          accessibilityLabel="Toggle voice mode"
        />
        <LabeledToggleRow
          label="Audio Storage"
          description="Store voice recordings for review and diagnostics."
          value={audioStorageEnabled}
          onValueChange={(nextValue) => {
            setValue('rules.audioStorageEnabled', nextValue, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          accessibilityLabel="Toggle audio storage"
        />
        <LabeledToggleRow
          label="Conversation History"
          description="Keep previous chat messages to improve continuity."
          value={conversationHistoryEnabled}
          onValueChange={(nextValue) => {
            setValue('rules.conversationHistoryEnabled', nextValue, {
              shouldDirty: true,
              shouldValidate: true,
            });
          }}
          accessibilityLabel="Toggle conversation history"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  title: {
    ...Typography.headline,
    color: Colors.text,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  section: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  sectionSubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chipPressed: {
    transform: [{ scale: 0.98 }],
  },
  languageChip: {
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  languageChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  languageChipText: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  safetyChip: {
    borderRadius: Radii.full,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  safetyChipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  safetyChipText: {
    ...Typography.captionMedium,
    color: Colors.text,
  },
  chipTextSelected: {
    color: Colors.white,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
  },
});
