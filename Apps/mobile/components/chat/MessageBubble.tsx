import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { MessageActionBar } from '@/components/chat/MessageActionBar';
import { QuizQuestionCard } from '@/components/chat/QuizQuestionCard';
import { QuizSummaryCard } from '@/components/chat/QuizSummaryCard';
import { SafetyFlagBanner } from '@/components/chat/SafetyFlagBanner';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
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
    !isTypingPlaceholder &&
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

        <Pressable
          accessibilityRole="text"
          accessibilityLabel={
            hasSafetyFlags
              ? `${senderLabel} shared a safe learning redirection at ${formatTimeLabel(message.createdAt)}`
              : `${senderLabel} said: ${message.content} at ${formatTimeLabel(message.createdAt)}`
          }
          onLongPress={() => {
            if (!isTypingPlaceholder && onLongPressMessage && message.content.trim().length > 0) {
              onLongPressMessage(message.content);
            }
          }}
          style={[styles.bubble, isAiMessage ? styles.aiBubble : styles.childBubble]}
        >
          {isTypingPlaceholder ? (
            <TypingIndicator />
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

export const MessageBubble = memo(MessageBubbleComponent);

const styles = StyleSheet.create({
  outer: {
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
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
});
