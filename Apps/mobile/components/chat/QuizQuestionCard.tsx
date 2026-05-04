import { memo, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { Easing, FadeIn } from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { ChatQuizQuestion } from '@/types/chat';

interface QuizQuestionCardProps {
  question: ChatQuizQuestion;
  questionIndex: number;
  totalQuestions: number;
  disabled?: boolean;
  onAnswer: (questionId: number, answer: string) => void;
}

type OptionState = 'idle' | 'selected' | 'pending' | 'selected_correct' | 'selected_wrong' | 'revealed_correct';

function normalizeDisplayAnswer(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function getOptionState(option: string, question: ChatQuizQuestion): OptionState {
  if (!question.userAnswer) return 'idle';

  const isSelected = option === question.userAnswer;
  const isCorrectAnswer = normalizeDisplayAnswer(option) === normalizeDisplayAnswer(question.correctAnswer);

  if (question.status === 'pending' && isSelected) return 'pending';
  if (question.status === 'correct' && isSelected) return 'selected_correct';
  if (question.status === 'incorrect' && isSelected) return 'selected_wrong';
  if (question.status === 'incorrect' && isCorrectAnswer) return 'revealed_correct';
  if (isSelected) return 'selected';
  return 'idle';
}

function OptionButton({
  label,
  state,
  disabled,
  onPress,
}: {
  label: string;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
}) {
  const backgroundColor =
    state === 'selected_correct'
      ? Colors.success
      : state === 'selected_wrong'
        ? Colors.error
        : state === 'revealed_correct'
          ? Colors.success
          : state === 'selected' || state === 'pending'
            ? Colors.primaryFixed
            : Colors.surfaceContainerLow;

  const borderColor =
    state === 'selected_correct'
      ? Colors.success
      : state === 'selected_wrong'
        ? Colors.error
        : state === 'revealed_correct'
          ? Colors.success
          : state === 'selected' || state === 'pending'
            ? Colors.primary
            : Colors.transparent;

  const textColor =
    state === 'selected_correct' || state === 'selected_wrong' || state === 'revealed_correct'
      ? Colors.white
      : Colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: state !== 'idle' }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionButton,
        { backgroundColor, borderColor },
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <View style={styles.optionContent}>
        <Text style={[styles.optionText, { color: textColor }]} numberOfLines={4}>
          {label}
        </Text>
        {state === 'pending' ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : state === 'selected_correct' || state === 'revealed_correct' ? (
          <MaterialCommunityIcons name="check-circle" size={20} color={Colors.white} />
        ) : state === 'selected_wrong' ? (
          <MaterialCommunityIcons name="close-circle" size={20} color={Colors.white} />
        ) : null}
      </View>
    </Pressable>
  );
}

function ShortAnswerSection({
  disabled,
  isPending,
  isCorrect,
  selectedAnswer,
  correctAnswer,
  onSubmit,
}: {
  disabled: boolean;
  isPending: boolean;
  isCorrect: boolean | undefined;
  selectedAnswer: string | null;
  correctAnswer?: string;
  onSubmit: (answer: string) => void;
}) {
  const [textInput, setTextInput] = useState(selectedAnswer ?? '');

  useEffect(() => {
    setTextInput(selectedAnswer ?? '');
  }, [selectedAnswer]);

  const handleSubmit = useCallback(() => {
    const trimmed = textInput.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
  }, [textInput, disabled, onSubmit]);

  if (!disabled) {
    return (
      <View style={styles.shortAnswerInputRow}>
        <TextInput
          style={styles.shortAnswerInput}
          placeholder="Type your answer..."
          placeholderTextColor={Colors.placeholder}
          value={textInput}
          onChangeText={setTextInput}
          editable={!disabled}
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          accessibilityLabel="Type your answer"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Save answer"
          accessibilityState={{ disabled: !textInput.trim() || disabled }}
          disabled={!textInput.trim() || disabled}
          onPress={handleSubmit}
          style={({ pressed }) => [
            styles.shortAnswerSubmitButton,
            (!textInput.trim() || disabled) ? styles.shortAnswerSubmitDisabled : null,
            pressed && textInput.trim() && !disabled ? styles.buttonPressed : null,
          ]}
        >
          <MaterialCommunityIcons name="check" size={18} color={Colors.white} />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.shortAnswerFeedback}>
      <View style={styles.shortAnswerResultRow}>
        <Text style={styles.shortAnswerLabel}>Your answer</Text>
        <Text
          style={[
            styles.shortAnswerValue,
            isCorrect === true ? styles.shortAnswerCorrect : isCorrect === false ? styles.shortAnswerWrong : null,
          ]}
        >
          {selectedAnswer}
        </Text>
        {isPending ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
        {isCorrect === true ? (
          <MaterialCommunityIcons name="check-circle" size={18} color={Colors.success} />
        ) : isCorrect === false ? (
          <MaterialCommunityIcons name="close-circle" size={18} color={Colors.error} />
        ) : null}
      </View>
      {isCorrect === false && correctAnswer ? (
        <View style={styles.shortAnswerResultRow}>
          <Text style={styles.shortAnswerLabel}>Correct answer</Text>
          <Text style={[styles.shortAnswerValue, styles.shortAnswerCorrect]}>
            {correctAnswer}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function FeedbackSection({
  isCorrect,
  explanation,
}: {
  isCorrect: boolean;
  explanation: string;
}) {
  return (
    <Animated.View entering={FadeIn.duration(160).easing(Easing.out(Easing.ease))}>
      <View
        style={[
          styles.feedbackContainer,
          isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect,
        ]}
      >
        <Text style={[styles.feedbackResultText, isCorrect ? styles.textCorrect : styles.textWrong]}>
          {isCorrect ? 'Correct' : 'Not quite'}
        </Text>
        {explanation ? <Text style={styles.explanationText}>{explanation}</Text> : null}
      </View>
    </Animated.View>
  );
}

function QuizQuestionCardComponent({
  question,
  questionIndex,
  totalQuestions,
  disabled = false,
  onAnswer,
}: QuizQuestionCardProps) {
  const selectedAnswer = question.userAnswer ?? null;
  const isPending = question.status === 'pending';
  const hasServerResult = question.status === 'correct' || question.status === 'incorrect';
  const isLocked = disabled || isPending || hasServerResult;
  const isCorrect = hasServerResult ? Boolean(question.isCorrect) : undefined;

  const handleOptionPress = useCallback(
    (option: string) => {
      if (isLocked) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      onAnswer(question.id, option);
    },
    [isLocked, onAnswer, question.id],
  );

  const handleShortAnswer = useCallback(
    (answer: string) => {
      if (isLocked) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      onAnswer(question.id, answer);
    },
    [isLocked, onAnswer, question.id],
  );

  const isShortAnswer = question.type === 'short_answer';
  const options = question.type === 'true_false'
    ? ['True', 'False']
    : question.options ?? [];

  return (
    <View style={styles.questionSection}>
      <View style={styles.cardHeader}>
        <Text style={styles.questionCounter}>
          Question {questionIndex + 1}/{totalQuestions}
        </Text>
        <View style={styles.typePill}>
          <MaterialCommunityIcons
            name={question.type === 'mcq' ? 'format-list-bulleted' : question.type === 'true_false' ? 'toggle-switch' : 'form-textbox'}
            size={12}
            color={Colors.primary}
          />
          <Text style={styles.typePillText}>
            {question.type === 'mcq' ? 'Multiple choice' : question.type === 'true_false' ? 'True or false' : 'Short answer'}
          </Text>
        </View>
      </View>

      <Text style={styles.promptText}>{question.prompt}</Text>

      {isShortAnswer ? (
        <ShortAnswerSection
          disabled={isLocked}
          isPending={isPending}
          isCorrect={isCorrect}
          selectedAnswer={selectedAnswer}
          correctAnswer={question.correctAnswer}
          onSubmit={handleShortAnswer}
        />
      ) : (
        <View style={styles.optionsContainer}>
          {options.map((option) => (
            <OptionButton
              key={option}
              label={option}
              state={getOptionState(option, question)}
              disabled={isLocked}
              onPress={() => handleOptionPress(option)}
            />
          ))}
        </View>
      )}

      {isPending ? (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.pendingText}>Waiting for results</Text>
        </View>
      ) : null}

      {hasServerResult && isCorrect !== undefined ? (
        <FeedbackSection
          isCorrect={isCorrect}
          explanation={question.explanation ?? ''}
        />
      ) : null}
    </View>
  );
}

export const QuizQuestionCard = memo(QuizQuestionCardComponent);

const Sizing_minTapTarget = 44;

const styles = StyleSheet.create({
  questionSection: {
    borderRadius: Radii.md,
    backgroundColor: Colors.surfaceContainerLow,
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  questionCounter: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryFixed,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radii.full,
  },
  typePillText: {
    ...Typography.label,
    color: Colors.primary,
    fontSize: 10,
  },
  promptText: {
    ...Typography.bodySemiBold,
    color: Colors.text,
    fontSize: 16,
    lineHeight: 24,
  },
  optionsContainer: {
    gap: Spacing.sm,
  },
  optionButton: {
    borderRadius: Radii.md,
    borderWidth: 1.5,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: Sizing_minTapTarget,
    justifyContent: 'center',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  optionText: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  shortAnswerInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  shortAnswerInput: {
    flex: 1,
    ...Typography.body,
    color: Colors.text,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: 44,
  },
  shortAnswerSubmitButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortAnswerSubmitDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  shortAnswerFeedback: {
    gap: Spacing.xs,
  },
  shortAnswerResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  shortAnswerLabel: {
    ...Typography.caption,
    color: Colors.textSecondary,
    minWidth: 96,
  },
  shortAnswerValue: {
    ...Typography.bodyMedium,
    color: Colors.text,
    flex: 1,
  },
  shortAnswerCorrect: {
    color: Colors.success,
  },
  shortAnswerWrong: {
    color: Colors.error,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primaryFixed,
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  pendingText: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  feedbackContainer: {
    borderRadius: Radii.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  feedbackCorrect: {
    backgroundColor: Colors.success + '15',
  },
  feedbackIncorrect: {
    backgroundColor: Colors.errorContainer,
  },
  feedbackResultText: {
    ...Typography.bodySemiBold,
  },
  textCorrect: {
    color: Colors.success,
  },
  textWrong: {
    color: Colors.error,
  },
  explanationText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});
