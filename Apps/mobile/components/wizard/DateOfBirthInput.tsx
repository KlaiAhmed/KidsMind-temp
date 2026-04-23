import { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Colors, Radii, Sizing, Spacing, Typography } from '@/constants/theme';

export interface DateOfBirthValue {
  day: string;
  month: string;
  year: string;
}

interface DateOfBirthInputProps {
  value: DateOfBirthValue;
  onChange: (nextValue: DateOfBirthValue) => void;
  onValidChange: (nextDate: Date | null) => void;
  externalError?: string;
}

interface DateValidationResult {
  dayError?: string;
  monthError?: string;
  yearError?: string;
  dateError?: string;
  validDate: Date | null;
}

function sanitizeDigits(value: string, maxLength: number): string {
  return value.replace(/\D/g, '').slice(0, maxLength);
}

function validateDateParts(value: DateOfBirthValue): DateValidationResult {
  const result: DateValidationResult = { validDate: null };

  const dayValue = value.day.trim();
  const monthValue = value.month.trim();
  const yearValue = value.year.trim();

  if (dayValue.length > 0) {
    const day = parseInt(dayValue, 10);
    if (Number.isNaN(day) || day < 1 || day > 31) {
      result.dayError = 'Day must be 1–31';
    }
  }

  if (monthValue.length > 0) {
    const month = parseInt(monthValue, 10);
    if (Number.isNaN(month) || month < 1 || month > 12) {
      result.monthError = 'Month must be 1–12';
    }
  }

  if (yearValue.length > 0) {
    const year = parseInt(yearValue, 10);
    const currentYear = new Date().getFullYear();

    if (Number.isNaN(year)) {
      result.yearError = 'Enter a valid year';
    } else if (year > currentYear) {
      result.yearError = 'Year cannot be in the future';
    }
  }

  const canBuildDate =
    dayValue.length > 0 &&
    monthValue.length > 0 &&
    yearValue.length >= 4 &&
    !result.dayError &&
    !result.monthError &&
    !result.yearError;

  if (!canBuildDate) {
    return result;
  }

  const day = parseInt(dayValue, 10);
  const month = parseInt(monthValue, 10);
  const year = parseInt(yearValue, 10);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    result.dateError = "This date doesn't exist";
    return result;
  }

  const today = new Date();
  const currentDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (date.getTime() > currentDateOnly.getTime()) {
    result.dateError = 'Date of birth cannot be in the future';
    return result;
  }

  result.validDate = date;
  return result;
}

export function DateOfBirthInput({ value, onChange, onValidChange, externalError }: DateOfBirthInputProps) {
  const dayRef = useRef<TextInput>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  const [focusedField, setFocusedField] = useState<keyof DateOfBirthValue | null>(null);

  const onValidChangeRef = useRef(onValidChange);
  onValidChangeRef.current = onValidChange;

  const prevValidDateRef = useRef<Date | null>(null);
  const { day, month, year } = value;
  const validation = useMemo(
    () => validateDateParts({ day, month, year }),
    [day, month, year],
  );
  const validDateTimestamp = validation.validDate ? validation.validDate.getTime() : null;

  useEffect(() => {
    const prevTimestamp = prevValidDateRef.current ? prevValidDateRef.current.getTime() : null;

    if (prevTimestamp === validDateTimestamp) {
      return;
    }

    prevValidDateRef.current = validation.validDate;
    onValidChangeRef.current(validation.validDate);
  }, [validDateTimestamp, validation.validDate]);

  function setDatePart(part: keyof DateOfBirthValue, nextRawValue: string) {
    const maxLength = part === 'year' ? 4 : 2;
    const sanitized = sanitizeDigits(nextRawValue, maxLength);

    const nextValue: DateOfBirthValue = {
      ...value,
      [part]: sanitized,
    };

    onChange(nextValue);

    if (part === 'day' && sanitized.length === 2) {
      monthRef.current?.focus();
    }

    if (part === 'month' && sanitized.length === 2) {
      yearRef.current?.focus();
    }
  }

  function getFieldBorderColor(part: keyof DateOfBirthValue, hasError: boolean): string {
    if (hasError) return Colors.errorText;
    if (focusedField === part) return Colors.inputBorderFocused;
    return Colors.inputBorder;
  }

  const helperError =
    validation.dayError ||
    validation.monthError ||
    validation.yearError ||
    validation.dateError ||
    externalError;

  return (
    <View style={styles.wrapper} accessible accessibilityLabel="Date of birth field group">
      <Text style={styles.groupLabel}>Date of Birth</Text>
      <View style={styles.row}>
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Day</Text>
          <TextInput
            ref={dayRef}
            value={value.day}
            onChangeText={(next) => setDatePart('day', next)}
            onFocus={() => setFocusedField('day')}
            onBlur={() => setFocusedField((prev) => prev === 'day' ? null : prev)}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            returnKeyType="next"
            autoComplete="birthdate-day"
            textContentType="birthdate"
            accessibilityLabel="Day of birth"
            style={[
              styles.input,
              styles.dayInput,
              { borderColor: getFieldBorderColor('day', !!validation.dayError) },
            ]}
            placeholderTextColor={Colors.placeholder}
            selectionColor={Colors.primary}
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Month</Text>
          <TextInput
            ref={monthRef}
            value={value.month}
            onChangeText={(next) => setDatePart('month', next)}
            onFocus={() => setFocusedField('month')}
            onBlur={() => setFocusedField((prev) => prev === 'month' ? null : prev)}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={2}
            returnKeyType="next"
            autoComplete="birthdate-month"
            textContentType="birthdate"
            accessibilityLabel="Month of birth"
            style={[
              styles.input,
              styles.monthInput,
              { borderColor: getFieldBorderColor('month', !!validation.monthError) },
            ]}
            placeholderTextColor={Colors.placeholder}
            selectionColor={Colors.primary}
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Year</Text>
          <TextInput
            ref={yearRef}
            value={value.year}
            onChangeText={(next) => setDatePart('year', next)}
            onFocus={() => setFocusedField('year')}
            onBlur={() => setFocusedField((prev) => prev === 'year' ? null : prev)}
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
            returnKeyType="done"
            autoComplete="birthdate-year"
            textContentType="birthdate"
            accessibilityLabel="Year of birth"
            style={[
              styles.input,
              styles.yearInput,
              { borderColor: getFieldBorderColor('year', !!validation.yearError) },
            ]}
            placeholderTextColor={Colors.placeholder}
            selectionColor={Colors.primary}
          />
        </View>
      </View>

      {helperError ? <Text style={styles.errorText}>{helperError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: Spacing.sm,
  },
  groupLabel: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  fieldWrap: {
    gap: Spacing.xs,
  },
  fieldLabel: {
    ...Typography.captionMedium,
    color: Colors.inputLabel,
  },
  input: {
    borderWidth: 1,
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceContainerLowest,
    color: Colors.text,
    ...Typography.body,
    paddingHorizontal: Spacing.sm,
    height: Sizing.inputHeight,
    textAlign: 'center',
  },
  dayInput: {
    width: 72,
  },
  monthInput: {
    width: 88,
  },
  yearInput: {
    width: 120,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
  },
});
