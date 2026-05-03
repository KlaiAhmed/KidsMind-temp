import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { MessageActionBar } from '@/components/chat/MessageActionBar';
import { QuizQuestionCard } from '@/components/chat/QuizQuestionCard';
import { QuizSummaryCard } from '@/components/chat/QuizSummaryCard';
import { SafetyFlagBanner } from '@/components/chat/SafetyFlagBanner';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import type { ChatQuizQuestion, Message, QuizSummary } from '@/types/chat';
import type { AgeGroup } from '@/types/child';

interface MessageBubbleProps {
  message: Message;
  isTypingPlaceholder?: boolean;
  ageGroup?: AgeGroup;
  onLongPressMessage?: (text: string) => void;
  onRetryAiMessage?: (aiMessageId: string) => void;
  onQuizAnswer?: (questionId: number, answer: string) => void;
  onQuizTryAnother?: () => void;
}

function formatTimeLabel(isoDate: string): string {
  const parsedDate = new Date(isoDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return '--:--';
  }

  return parsedDate.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function MessageBubbleComponent({
  message,
  isTypingPlaceholder = false,
  ageGroup = '7-11',
  onLongPressMessage,
  onRetryAiMessage,
  onQuizAnswer,
  onQuizTryAnother,
}: MessageBubbleProps) {
  const isAiMessage = message.sender === 'ai';
  const hasSafetyFlags = message.safetyFlags.length > 0;
  const hasQuiz = Boolean(message.quiz && message.quiz.length > 0);
  const hasQuizScore = Boolean(message.quizScore);
  const isStreamingPlaceholder = message.status === 'streaming' && message.content.trim().length === 0;
  const shouldShowThinkingIndicator = isTypingPlaceholder || isStreamingPlaceholder;
  const isErrorMessage = message.status === 'error';
  const senderLabel = isAiMessage ? 'AI' : 'Child';

  const bubbleTextSizeStyle =
    ageGroup === '3-6'
      ? styles.messageTextLarge
      : ageGroup === '12-15'
        ? styles.messageTextCompact
        : styles.messageTextDefault;

  if (hasQuizScore) {
    return (
      <View style={[styles.row, styles.rowLeft]}>
        <View style={styles.aiAvatarBadge}>
          <MaterialCommunityIcons name="robot-happy-outline" size={16} color={Colors.primary} />
        </View>
        <View style={styles.quizCardWrapper}>
          <QuizSummaryCard
            summary={message.quizScore as QuizSummary}
            onTryAnother={onQuizTryAnother}
          />
          <Text style={styles.timeText}>{formatTimeLabel(message.createdAt)}</Text>
        </View>
      </View>
    );
  }

  if (hasQuiz) {
    const questions = message.quiz as ChatQuizQuestion[];
    const introText = message.content;

    return (
      <View style={[styles.row, styles.rowLeft]}>
        <View style={styles.aiAvatarBadge}>
          <MaterialCommunityIcons name="robot-happy-outline" size={16} color={Colors.primary} />
        </View>
        <View style={styles.quizCardWrapper}>
          {introText ? (
            <View style={[styles.bubble, styles.aiBubble]}>
              <Text style={[bubbleTextSizeStyle, styles.aiText]}>{introText}</Text>
              <Text style={styles.timeText}>{formatTimeLabel(message.createdAt)}</Text>
            </View>
          ) : null}
          {questions.map((question, index) => (
            <QuizQuestionCard
              key={question.id}
              question={question}
              questionIndex={index}
              totalQuestions={questions.length}
              onAnswer={onQuizAnswer ?? (() => {})}
            />
          ))}
        </View>
      </View>
    );
  }

  const showActionBar =
    isAiMessage &&
    !isErrorMessage &&
    !shouldShowThinkingIndicator &&
    !hasSafetyFlags &&
    !hasQuiz &&
    !hasQuizScore &&
    message.content.trim().length > 0;

  return (
    <View style={styles.outer}>
      <View style={[styles.row, isAiMessage ? styles.rowLeft : styles.rowRight]}>
        {isAiMessage ? (
          <View style={styles.aiAvatarBadge}>
            <MaterialCommunityIcons name="robot-happy-outline" size={16} color={Colors.primary} />
          </View>
        ) : null}

        {isErrorMessage ? (
          <View
            accessibilityRole="text"
            accessibilityLabel={`${senderLabel} had trouble answering: ${message.content}`}
            style={[styles.bubble, styles.aiBubble, styles.errorBubble]}
          >
            <View style={styles.errorRow}>
              <MaterialCommunityIcons name="wifi-alert" size={18} color={Colors.errorText} />
              <Text allowFontScaling style={[bubbleTextSizeStyle, styles.errorText]}>
                {message.content}
              </Text>
            </View>
            {onRetryAiMessage ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry response"
                onPress={() => onRetryAiMessage(message.id)}
                style={({ pressed }) => [styles.retryButton, pressed ? styles.retryButtonPressed : null]}
              >
                {/* a11y: Retry button is exposed inside failed AI messages. */}
                <MaterialCommunityIcons name="refresh" size={16} color={Colors.white} />
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            ) : null}
            <Text style={styles.timeText}>{formatTimeLabel(message.createdAt)}</Text>
          </View>
        ) : (
          <Pressable
          accessibilityRole="text"
          accessibilityLabel={
            hasSafetyFlags
              ? `${senderLabel} shared a safe learning redirection at ${formatTimeLabel(message.createdAt)}`
              : `${senderLabel} said: ${message.content} at ${formatTimeLabel(message.createdAt)}`
          }
          onLongPress={() => {
            if (!shouldShowThinkingIndicator && onLongPressMessage && message.content.trim().length > 0) {
              onLongPressMessage(message.content);
            }
          }}
          style={[styles.bubble, isAiMessage ? styles.aiBubble : styles.childBubble]}
        >
          {shouldShowThinkingIndicator ? (
            <ThinkingIndicator />
          ) : hasSafetyFlags ? (
            <SafetyFlagBanner flags={message.safetyFlags} />
          ) : (
            <Text
              allowFontScaling
              style={[bubbleTextSizeStyle, isAiMessage ? styles.aiText : styles.childText]}
            >
              {message.content}
            </Text>
          )}

          <Text style={styles.timeText}>{formatTimeLabel(message.createdAt)}</Text>
          </Pressable>
        )}
      </View>

      {showActionBar ? (
        <MessageActionBar
          messageId={message.id}
          content={message.content}
          ageGroup={ageGroup}
          onRetry={() => onRetryAiMessage?.(message.id)}
        />
      ) : null}
    </View>
  );
}

function areMessageBubblePropsEqual(previous: MessageBubbleProps, next: MessageBubbleProps) {
  if (previous.message.id !== next.message.id) return false;
  if (previous.message.content !== next.message.content) return false;
  if (previous.message.status !== next.message.status) return false;
  if (previous.isTypingPlaceholder !== next.isTypingPlaceholder) return false;
  if (previous.ageGroup !== next.ageGroup) return false;

  const hasStructuredContent =
    previous.message.quiz ||
    next.message.quiz ||
    previous.message.quizScore ||
    next.message.quizScore ||
    previous.message.safetyFlags.length > 0 ||
    next.message.safetyFlags.length > 0 ||
    previous.message.safetyFlags.length !== next.message.safetyFlags.length;

  if (hasStructuredContent) {
    return previous.message === next.message;
  }

  return (
    previous.onLongPressMessage === next.onLongPressMessage &&
    previous.onRetryAiMessage === next.onRetryAiMessage &&
    previous.onQuizAnswer === next.onQuizAnswer &&
    previous.onQuizTryAnother === next.onQuizTryAnother
  );
}

export const MessageBubble = memo(MessageBubbleComponent, areMessageBubblePropsEqual);

const styles = StyleSheet.create({
  outer: {
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  rowLeft: {
    justifyContent: 'flex-start',
    paddingRight: Spacing.xl,
  },
  rowRight: {
    justifyContent: 'flex-end',
    paddingLeft: Spacing.xl,
  },
  aiAvatarBadge: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primaryFixed,
    marginBottom: Spacing.xs,
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: Radii.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  aiBubble: {
    backgroundColor: Colors.surfaceContainer,
    opacity: 0.75,
    borderTopLeftRadius: Radii.sm,
  },
  errorBubble: {
    backgroundColor: Colors.errorContainer,
    opacity: 1,
  },
  childBubble: {
    backgroundColor: Colors.primary,
    borderTopRightRadius: Radii.sm,
  },
  messageTextDefault: {
    ...Typography.body,
  },
  messageTextLarge: {
    ...Typography.body,
    fontSize: 18,
    lineHeight: 26,
  },
  messageTextCompact: {
    ...Typography.body,
    fontSize: 15,
    lineHeight: 22,
  },
  aiText: {
    color: Colors.text,
  },
  childText: {
    color: Colors.white,
  },
  timeText: {
    ...Typography.caption,
    color: Colors.textTertiary,
    alignSelf: 'flex-end',
  },
  quizCardWrapper: {
    maxWidth: '88%',
    gap: Spacing.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  errorText: {
    color: Colors.errorText,
    flex: 1,
  },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  retryButtonPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },
  retryText: {
    ...Typography.captionMedium,
    color: Colors.white,
  },
});
