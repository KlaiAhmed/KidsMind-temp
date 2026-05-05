import { z } from 'zod/v4';
import type { ChildProfile, EducationLevel, SubjectKey, WeekSchedule } from '@/types/child';
import {
  CHILD_PROFILE_MAX_AGE,
  CHILD_PROFILE_MIN_AGE,
  backendStageToEducationLevel,
  buildDefaultWeekSchedule,
  computeEndTimeFromStart,
  deriveBlockedSubjects,
  ALL_SUBJECT_VALUES,
  isChildProfileAgeInRange,
  parseTimeToMinutes,
  parseIsoDateOnly,
} from '@/src/utils/childProfileWizard';

const educationLevelValues = ['kindergarten', 'primary_school', 'secondary_school'] as const;
const subjectValues = ALL_SUBJECT_VALUES;
const scheduleModeValues = ['simple', 'advanced'] as const;
const languageCodeValues = ['ar', 'en', 'es', 'fr', 'it', 'zh'] as const;
type LanguageCode = (typeof languageCodeValues)[number];

const educationLevelSchema = z.enum(educationLevelValues);
const subjectSchema = z.enum(subjectValues);
const scheduleModeSchema = z.enum(scheduleModeValues);

const dayScheduleSchema = z.object({
  enabled: z.boolean(),
  subjects: z.array(subjectSchema),
  durationMinutes: z.number().int().positive().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
});

const weekScheduleSchema = z.object({
  monday: dayScheduleSchema,
  tuesday: dayScheduleSchema,
  wednesday: dayScheduleSchema,
  thursday: dayScheduleSchema,
  friday: dayScheduleSchema,
  saturday: dayScheduleSchema,
  sunday: dayScheduleSchema,
});

const childInfoSchema = z.object({
  // Fixed: aligned with API field 'nickname' (min_length=1).
  nickname: z.string().trim().min(1, 'Child name is required').max(64),
  dob: z.object({
    day: z.string(),
    month: z.string(),
    year: z.string(),
  }),
  birthDateIso: z.string().nullable(),
  educationLevel: educationLevelSchema.nullable(),
  derivedEducationLevel: educationLevelSchema.nullable(),
  mismatchAcknowledged: z.boolean(),
  educationManuallySet: z.boolean(),
});

const scheduleSchema = z
  .object({
    mode: scheduleModeSchema,
    allowedSubjects: z.array(subjectSchema).min(1, 'Choose at least one subject'),
    dailyLimitMinutes: z.number().int().min(30, 'Daily cap must be at least 30 minutes').max(600, 'Daily cap cannot exceed 600 minutes').nullable(),
    weekSchedule: weekScheduleSchema,
  })
  .superRefine((value, ctx) => {
    const weekdays = Object.entries(value.weekSchedule) as [
      string,
      (typeof value.weekSchedule)[keyof typeof value.weekSchedule],
    ][];
    const enabledDays = weekdays.filter(([, day]) => day.enabled);

    if (enabledDays.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['weekSchedule'],
        message: 'Enable at least one day in the weekly schedule',
      });
      return;
    }

    if (value.dailyLimitMinutes === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['dailyLimitMinutes'],
        message: 'Enter a daily cap between 30 and 600 minutes',
      });
    }

    const [referenceDayKey, referenceDay] = enabledDays[0];
    const referenceSubjects = [...referenceDay.subjects].sort().join('|');

    for (const [dayKey, day] of enabledDays) {
      if (!day.durationMinutes || day.durationMinutes <= 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'durationMinutes'],
          message: 'Enter a daily cap between 30 and 600 minutes',
        });
      }

      if (day.durationMinutes && day.durationMinutes < 30) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'durationMinutes'],
          message: 'Daily cap must be at least 30 minutes',
        });
      }

      if (day.durationMinutes && day.durationMinutes > 600) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'durationMinutes'],
          message: 'Daily cap cannot exceed 600 minutes',
        });
      }

      if (day.durationMinutes && value.dailyLimitMinutes !== null && day.durationMinutes > value.dailyLimitMinutes) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'durationMinutes'],
          message: 'Duration cannot exceed the global daily limit',
        });
      }

      if (!day.startTime) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'startTime'],
          message: 'Choose a start time for enabled days',
        });
      } else if (parseTimeToMinutes(day.startTime) === null) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'startTime'],
          message: 'Start time must be in HH:MM format',
        });
      }

      if (!day.endTime) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'endTime'],
          message: 'Choose an end time for enabled days',
        });
      } else {
        const endMinutes = parseTimeToMinutes(day.endTime);
        if (endMinutes === null) {
          ctx.addIssue({
            code: 'custom',
            path: ['weekSchedule', dayKey, 'endTime'],
            message: 'End time must be in HH:MM format',
          });
        } else if (day.startTime) {
          const startMinutes = parseTimeToMinutes(day.startTime);
          if (startMinutes !== null && endMinutes <= startMinutes) {
            ctx.addIssue({
              code: 'custom',
              path: ['weekSchedule', dayKey, 'endTime'],
              message: 'End time must be after the start time',
            });
          }
        }
      }

      if (day.subjects.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'subjects'],
          message: 'Choose at least one subject for enabled days',
        });
      }

      const invalidSubjects = day.subjects.filter(
        (subject) => !value.allowedSubjects.includes(subject),
      );

      if (invalidSubjects.length > 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['weekSchedule', dayKey, 'subjects'],
          message: 'Per-day subjects must come from the allowed subject list',
        });
      }

      if (value.mode === 'simple' && dayKey !== referenceDayKey) {
        const daySubjects = [...day.subjects].sort().join('|');
        const hasMismatch =
          day.durationMinutes !== referenceDay.durationMinutes ||
          day.startTime !== referenceDay.startTime ||
          day.endTime !== referenceDay.endTime ||
          daySubjects !== referenceSubjects;

        if (hasMismatch) {
          ctx.addIssue({
            code: 'custom',
            path: ['weekSchedule', dayKey],
            message: 'Simple mode requires one shared schedule across selected days',
          });
        }
      }
    }
  });

const rulesSchema = z.object({
  // Fixed: aligned with API field 'default_language' allowed codes.
  defaultLanguage: z.enum(languageCodeValues),
  blockedSubjects: z.array(subjectSchema),
  homeworkModeEnabled: z.boolean(),
  voiceModeEnabled: z.boolean(),
  audioStorageEnabled: z.boolean(),
  conversationHistoryEnabled: z.boolean(),
  contentSafetyLevel: z.enum(['strict', 'moderate']),
  timeWindowStart: z.string().nullable(),
  timeWindowEnd: z.string().nullable(),
});

export const childProfileWizardSchema = z
  .object({
    childInfo: childInfoSchema,
    avatar: z.object({
      avatarId: z.string().min(1, 'Choose an avatar'),
    }),
    schedule: scheduleSchema,
    rules: rulesSchema,
  })
  .superRefine((value, ctx) => {
    if (!value.childInfo.birthDateIso) {
      ctx.addIssue({
        code: 'custom',
        path: ['childInfo', 'birthDateIso'],
        message: 'Date of birth is required',
      });
    } else {
      const birthDate = parseIsoDateOnly(value.childInfo.birthDateIso);

      if (!birthDate) {
        ctx.addIssue({
          code: 'custom',
          path: ['childInfo', 'birthDateIso'],
          message: 'Enter a valid date of birth',
        });
      } else if (!isChildProfileAgeInRange(birthDate)) {
        ctx.addIssue({
          code: 'custom',
          path: ['childInfo', 'birthDateIso'],
          message: `Child must be between ${CHILD_PROFILE_MIN_AGE} and ${CHILD_PROFILE_MAX_AGE} years old`,
        });
      }
    }

    if (!value.childInfo.educationLevel) {
      ctx.addIssue({
        code: 'custom',
        path: ['childInfo', 'educationLevel'],
        message: 'Choose an education level',
      });
    }

    if (
      value.childInfo.educationLevel &&
      value.childInfo.derivedEducationLevel &&
      value.childInfo.educationLevel !== value.childInfo.derivedEducationLevel &&
      !value.childInfo.mismatchAcknowledged
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['childInfo', 'mismatchAcknowledged'],
        message: 'Please confirm the education-level override to continue',
      });
    }

    const overlap = value.rules.blockedSubjects.filter((subject) =>
      value.schedule.allowedSubjects.includes(subject),
    );

    if (overlap.length > 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['rules', 'blockedSubjects'],
        message: 'Blocked subjects cannot overlap with allowed subjects',
      });
    }
  });

export type ChildProfileWizardFormValues = z.infer<typeof childProfileWizardSchema>;

function extractDobParts(birthDate: string | undefined): { day: string; month: string; year: string } {
  if (!birthDate) {
    return { day: '', month: '', year: '' };
  }

  const match = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { day: '', month: '', year: '' };
  }

  return {
    year: match[1],
    month: match[2],
    day: match[3],
  };
}

function normalizeLanguageCode(value: string | null | undefined): LanguageCode {
  return languageCodeValues.includes(value as LanguageCode) ? value as LanguageCode : 'en';
}

function normalizeExistingWeekSchedule(
  weekSchedule: WeekSchedule | null | undefined,
  allowedSubjects: SubjectKey[],
  defaultTimeWindowStart: string | null,
): WeekSchedule {
  const fallback = buildDefaultWeekSchedule(allowedSubjects);

  function normalizeDay(
    day: WeekSchedule[keyof WeekSchedule] | undefined,
    fallbackDay: WeekSchedule[keyof WeekSchedule],
  ) {
    const mergedDay = day ?? fallbackDay;
    const startTime = mergedDay.startTime ?? (mergedDay.enabled ? defaultTimeWindowStart : null);
    const computedEndTime = computeEndTimeFromStart(startTime, mergedDay.durationMinutes);
    const endTime =
      mergedDay.endTime && parseTimeToMinutes(mergedDay.endTime) !== null
        ? mergedDay.endTime
        : computedEndTime;

    return {
      ...mergedDay,
      startTime,
      endTime,
    };
  }

  if (!weekSchedule) {
    return {
      monday: normalizeDay(undefined, fallback.monday),
      tuesday: normalizeDay(undefined, fallback.tuesday),
      wednesday: normalizeDay(undefined, fallback.wednesday),
      thursday: normalizeDay(undefined, fallback.thursday),
      friday: normalizeDay(undefined, fallback.friday),
      saturday: normalizeDay(undefined, fallback.saturday),
      sunday: normalizeDay(undefined, fallback.sunday),
    };
  }

  return {
    monday: normalizeDay(weekSchedule.monday, fallback.monday),
    tuesday: normalizeDay(weekSchedule.tuesday, fallback.tuesday),
    wednesday: normalizeDay(weekSchedule.wednesday, fallback.wednesday),
    thursday: normalizeDay(weekSchedule.thursday, fallback.thursday),
    friday: normalizeDay(weekSchedule.friday, fallback.friday),
    saturday: normalizeDay(weekSchedule.saturday, fallback.saturday),
    sunday: normalizeDay(weekSchedule.sunday, fallback.sunday),
  };
}

export function buildChildProfileWizardDefaultValues(
  profile: ChildProfile | null,
  defaultAvatarId: string,
): ChildProfileWizardFormValues {
  const allowedSubjects = profile?.rules?.allowedSubjects?.length
    ? profile.rules.allowedSubjects
    : profile?.subjectIds?.length
      ? profile.subjectIds
      : [];

  const weekSchedule = normalizeExistingWeekSchedule(
    profile?.rules?.weekSchedule,
    allowedSubjects,
    profile?.rules?.timeWindowStart ?? null,
  );
  const blockedSubjects = profile?.rules?.blockedSubjects?.length
    ? profile.rules.blockedSubjects
    : deriveBlockedSubjects(allowedSubjects);
  const dob = extractDobParts(profile?.birthDate);

  return {
    childInfo: {
      nickname: profile?.nickname ?? profile?.name ?? '',
      dob,
      birthDateIso: profile?.birthDate ?? null,
      educationLevel: profile ? backendStageToEducationLevel(profile.educationStage) : null,
      derivedEducationLevel: null,
      mismatchAcknowledged: false,
      educationManuallySet: false,
    },
    avatar: {
      avatarId: profile?.avatarId ?? defaultAvatarId,
    },
    schedule: {
      mode: 'simple',
      allowedSubjects,
      dailyLimitMinutes: profile ? profile.rules?.dailyLimitMinutes ?? profile.dailyGoalMinutes ?? null : null,
      weekSchedule,
    },
    rules: {
      defaultLanguage: normalizeLanguageCode(profile?.rules?.defaultLanguage ?? profile?.languages?.[0]),
      blockedSubjects,
      homeworkModeEnabled: profile?.rules?.homeworkModeEnabled ?? true,
      voiceModeEnabled: profile?.rules?.voiceModeEnabled ?? true,
      audioStorageEnabled: profile?.rules?.audioStorageEnabled ?? true,
      conversationHistoryEnabled: profile?.rules?.conversationHistoryEnabled ?? true,
      contentSafetyLevel: profile?.rules?.contentSafetyLevel ?? 'moderate',
      timeWindowStart: profile?.rules?.timeWindowStart ?? null,
      timeWindowEnd: profile?.rules?.timeWindowEnd ?? null,
    },
  };
}

export function getMismatchType(
  selected: EducationLevel | null,
  derived: EducationLevel | null,
): 'under-standard' | 'accelerated' | null {
  if (!selected || !derived) {
    return null;
  }

  const order = {
    kindergarten: 0,
    primary_school: 1,
    secondary_school: 2,
  } as const;

  if (selected === derived) {
    return null;
  }

  return order[selected] < order[derived] ? 'under-standard' : 'accelerated';
}
