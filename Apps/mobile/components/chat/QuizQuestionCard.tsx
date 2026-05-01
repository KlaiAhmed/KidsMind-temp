import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  withSpring,
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Colors, Radii, Shadows, Spacing, Typography } from '@/constants/theme';
import type { ChatQuizQuestion } from '@/types/chat';

const XP_PER_CORRECT = 10;

interface QuizQuestionCardProps {
  question: ChatQuizQuestion;
  questionIndex: number;
  totalQuestions: number;
  onAnswer: (questionId: number, answer: string) => void;
}

function getOptionState(
  option: string,
  selectedAnswer: string | null,
  correctAnswer: string,
  isLocked: boolean,
): 'idle' | 'selected_correct' | 'selected_wrong' | 'revealed_correct' {
  if (!isLocked || !selectedAnswer) return 'idle';
  if (option === selectedAnswer && option === correctAnswer) return 'selected_correct';
  if (option === selectedAnswer && option !== correctAnswer) return 'selected_wrong';
  if (option === correctAnswer) return 'revealed_correct';
  return 'idle';
}

function OptionButton({
  label,
  state,
  disabled,
  onPress,
}: {
  label: string;
  state: ReturnType<typeof getOptionState>;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = useCallback(() => {
    if (disabled) return;

    scale.value = withSpring(0.96, { damping: 15, stiffness: 400 }, () => {
      scale.value = withSpring(1, { damping: 12, stiffness: 300 });
    });
    onPress();
  }, [disabled, onPress, scale]);

  const backgroundColor =
    state === 'selected_correct'
      ? Colors.success
      : state === 'selected_wrong'
        ? Colors.error
        : state === 'revealed_correct'
          ? Colors.success
          : Colors.surfaceContainerLowest;

  const borderColor =
    state === 'selected_correct'
      ? Colors.success
      : state === 'selected_wrong'
        ? Colors.error
        : state === 'revealed_correct'
          ? Colors.success
          : Colors.outlineVariant;

  const textColor =
    state === 'selected_correct' || state === 'selected_wrong' || state === 'revealed_correct'
      ? Colors.white
      : Colors.text;

  const iconColor = Colors.white;

  return (
    <Animated.View style={animatedStyle}>
      {/* a11y: Quiz options announce only the answer text for fast scanning. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={handlePress}
        style={[styles.optionButton, { backgroundColor, borderColor }]}
      >
        <View style={styles.optionContent}>
          <Text style={[styles.optionText, { color: textColor }]} numberOfLines={3}>
            {label}
          </Text>
          {state === 'selected_correct' ? (
            <MaterialCommunityIcons name="check-circle" size={20} color={iconColor} />
          ) : state === 'selected_wrong' ? (
            <MaterialCommunityIcons name="close-circle" size={20} color={iconColor} />
          ) : state === 'revealed_correct' ? (
            <MaterialCommunityIcons name="check-circle" size={20} color={iconColor} />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ShortAnswerSection({
  isLocked,
  isCorrect,
  selectedAnswer,
  correctAnswer,
  onSubmit,
}: {
  isLocked: boolean;
  isCorrect: boolean | undefined;
  selectedAnswer: string | null;
  correctAnswer: string;
  onSubmit: (answer: string) => void;
}) {
  const [textInput, setTextInput] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = textInput.trim();
    if (!trimmed || isLocked) return;
    onSubmit(trimmed);
  }, [textInput, isLocked, onSubmit]);

  return (
    <View style={styles.shortAnswerContainer}>
      {!isLocked ? (
        <View style={styles.shortAnswerInputRow}>
          {/* a11y: Short-answer input is labeled as an answer field. */}
          <TextInput
            style={styles.shortAnswerInput}
            placeholder="Type your answer..."
            placeholderTextColor={Colors.placeholder}
            value={textInput}
            onChangeText={setTextInput}
            editable={!isLocked}
            returnKeyType="send"
            onSubmitEditing={handleSubmit}
            accessibilityLabel="Type your answer"
          />
          {/* a11y: Submit button is the only icon-only control in short answers. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit answer"
            disabled={!textInput.trim() || isLocked}
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.shortAnswerSubmitButton,
              (!textInput.trim() || isLocked) && styles.shortAnswerSubmitDisabled,
              pressed && styles.optionPressed,
            ]}
          >
            <MaterialCommunityIcons name="send" size={18} color={Colors.white} />
          </Pressable>
        </View>
      ) : (
        <View style={styles.shortAnswerFeedback}>
          <View style={styles.shortAnswerResultRow}>
            <Text style={styles.shortAnswerLabel}>Your answer: </Text>
            <Text
              style={[
                styles.shortAnswerValue,
                isCorrect ? styles.shortAnswerCorrect : styles.shortAnswerWrong,
              ]}
            >
              {selectedAnswer}
            </Text>
            {isCorrect ? (
              <MaterialCommunityIcons name="check-circle" size={18} color={Colors.success} />
            ) : (
              <MaterialCommunityIcons name="close-circle" size={18} color={Colors.error} />
            )}
          </View>
          {!isCorrect && correctAnswer ? (
            <View style={styles.shortAnswerResultRow}>
              <Text style={styles.shortAnswerLabel}>Correct answer: </Text>
              <Text style={[styles.shortAnswerValue, styles.shortAnswerCorrect]}>
                {correctAnswer}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

function FeedbackSection({
  isCorrect,
  xpEarned,
  explanation,
}: {
  isCorrect: boolean;
  xpEarned: number;
  explanation: string;
}) {
  const scale = useSharedValue(0.97);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(180).easing(Easing.out(Easing.ease))}
      onLayout={() => {
        scale.value = withSpring(1.03, { damping: 12, stiffness: 300 }, () => {
          scale.value = withSpring(1, { damping: 15, stiffness: 200 });
        });
      }}
      style={animatedStyle}
    >
      <View
        style={[
          styles.feedbackContainer,
          isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect,
        ]}
      >
        <View style={styles.feedbackHeader}>
          <Text style={[styles.feedbackResultText, isCorrect ? styles.textCorrect : styles.textWrong]}>
            {isCorrect ? 'Correct!' : 'Not quite!'}
          </Text>
          {isCorrect ? (
            <View style={styles.xpBadge}>
              <MaterialCommunityIcons name="star" size={14} color={Colors.white} />
              <Text style={styles.xpBadgeText}>+{xpEarned} XP</Text>
            </View>
          ) : null}
        </View>
        {explanation ? <Text style={styles.explanationText}>{explanation}</Text> : null}
      </View>
    </Animated.View>
  );
}

function QuizQuestionCardComponent({
  question,
  questionIndex,
  totalQuestions,
  onAnswer,
}: QuizQuestionCardProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(question.userAnswer ?? null);
  const isLocked = question.userAnswer !== undefined || selectedAnswer !== null;

  const isCorrect = isLocked
    ? question.isCorrect ?? question.answer.trim().toLowerCase() === (selectedAnswer ?? '').trim().toLowerCase()
    : undefined;

  const xpEarned = isCorrect && isLocked ? (question.xpEarned ?? XP_PER_CORRECT) : 0;

  const handleOptionPress = useCallback(
    (option: string) => {
      if (isLocked) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setSelectedAnswer(option);
      onAnswer(question.id, option);
    },
    [isLocked, onAnswer, question.id],
  );

  const handleShortAnswer = useCallback(
    (answer: string) => {
      if (isLocked) return;

      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      setSelectedAnswer(answer);
      onAnswer(question.id, answer);
    },
    [isLocked, onAnswer, question.id],
  );

  const isShortAnswer = question.type === 'short_answer';
  const options = question.type === 'true_false'
    ? ['True', 'False']
    : question.options ?? [];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.questionCounter}>
          Question {questionIndex + 1} of {totalQuestions}
        </Text>
        <View style={styles.typePill}>
          <MaterialCommunityIcons
            name={question.type === 'mcq' ? 'format-list-bulleted' : question.type === 'true_false' ? 'toggle-switch' : 'form-textbox'}
            size={12}
            color={Colors.primary}
          />
          <Text style={styles.typePillText}>
            {question.type === 'mcq' ? 'Multiple Choice' : question.type === 'true_false' ? 'True or False' : 'Short Answer'}
          </Text>
        </View>
      </View>

      <Text style={styles.promptText}>{question.prompt}</Text>

      {isShortAnswer ? (
        <ShortAnswerSection
          isLocked={isLocked}
          isCorrect={isCorrect}
          selectedAnswer={selectedAnswer}
          correctAnswer={question.answer}
          onSubmit={handleShortAnswer}
        />
      ) : (
        <View style={styles.optionsContainer}>
          {options.map((option) => {
            const state = getOptionState(option, selectedAnswer, question.answer, isLocked);
            return (
              <OptionButton
                key={option}
                label={option}
                state={state}
                disabled={isLocked}
                onPress={() => handleOptionPress(option)}
              />
            );
          })}
        </View>
      )}

      {isLocked && isCorrect !== undefined ? (
        <FeedbackSection
          isCorrect={isCorrect}
          xpEarned={xpEarned}
          explanation={question.explanation}
        />
      ) : null}
    </View>
  );
}

export const QuizQuestionCard = memo(QuizQuestionCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: Radii.lg,
    padding: Spacing.md,
    ...Shadows.card,
    gap: Spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: 17,
    lineHeight: 24,
  },
  optionsContainer: {
    gap: Spacing.sm,
  },
  optionButton: {
    borderRadius: Radii.lg,
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
  optionPressed: {
    transform: [{ scale: 0.96 }],
  },
  shortAnswerContainer: {
    gap: Spacing.sm,
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
  },
  shortAnswerValue: {
    ...Typography.bodyMedium,
    flex: 1,
  },
  shortAnswerCorrect: {
    color: Colors.success,
  },
  shortAnswerWrong: {
    color: Colors.error,
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
  feedbackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  xpBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.success,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radii.full,
  },
  xpBadgeText: {
    ...Typography.captionMedium,
    color: Colors.white,
    fontSize: 12,
  },
  explanationText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});

const Sizing_minTapTarget = 44;
