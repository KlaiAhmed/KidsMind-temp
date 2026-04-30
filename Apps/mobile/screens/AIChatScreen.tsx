import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { SessionHeader } from '@/components/chat/SessionHeader';
import { GateMessageScreen } from '@/components/session/GateMessageScreen';
import { useChatSession } from '@/hooks/useChatSession';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';
import { useSubjects } from '@/hooks/useSubjects';
import { useAuth } from '@/contexts/AuthContext';
import { getChildTabSceneBottomPadding } from '@/components/navigation/bottomNavTokens';
import type { ChildProfile, SessionGateState } from '@/types/child';
import type { Message } from '@/types/chat';

interface ChatRouteParams {
  subjectId?: string;
  topicId?: string;
  subjectName?: string;
}

type ChatListItem =
  | {
      id: string;
      type: 'message';
      message: Message;
    }
  | {
      id: string;
      type: 'typing';
    };

const TYPING_PLACEHOLDER_ID = 'typing-placeholder';

export default function AIChatScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams() as ChatRouteParams;
  const { profile } = useChildProfile();
  const childTabSceneBottomPadding = getChildTabSceneBottomPadding(insets.bottom);
  const { gateState } = useChildSessionGate(profile?.id ?? null, {
    weekSchedule: profile?.rules?.weekSchedule ?? null,
    todayUsageSeconds: profile?.todayUsageSeconds,
    timeZone: profile?.timezone ?? null,
  });

  if (gateState.status !== 'ACTIVE') {
    return (
      <GateMessageScreen
        gateState={gateState}
        childName={profile?.nickname ?? profile?.name ?? undefined}
        bottomPadding={childTabSceneBottomPadding}
        variant="qubie"
      />
    );
  }

  return (
    <AIChatSessionGate
      childTabSceneBottomPadding={childTabSceneBottomPadding}
      params={params}
      profile={profile}
    />
  );
}

interface AIChatSessionGateProps {
  childTabSceneBottomPadding: number;
  params: ChatRouteParams;
  profile: ChildProfile | null;
}

function AIChatSessionGate({
  childTabSceneBottomPadding,
  params,
  profile,
}: AIChatSessionGateProps) {
  const navigation = useNavigation();
  const { getSubjectById } = useSubjects();
  const { addQuizXp, refreshChildData } = useAuth();

  const resolvedSubjectName =
    params.subjectName ??
    (params.subjectId ? getSubjectById(params.subjectId)?.title : undefined);

  const dailyLimitMinutes =
    typeof profile?.rules?.dailyLimitMinutes === 'number'
      ? profile.rules.dailyLimitMinutes
      : undefined;

  const handleQuizComplete = useCallback(
    (summary: { totalXp: number }) => {
      addQuizXp(summary.totalXp);
      void refreshChildData().catch(() => undefined);
    },
    [addQuizXp, refreshChildData],
  );

  const {
    state,
    elapsedSeconds,
    minutesRemaining,
    sendMessage,
    retryMessage,
    sendQuizRequest,
    submitQuizAnswer,
    resetQuizMode,
    transcribeRecording,
    setInputText,
    clearError,
  } = useChatSession({
    childId: profile?.id ?? null,
    ageGroup: profile?.ageGroup ?? '7-11',
    gradeLevel: profile?.gradeLevel ?? 'Grade 4',
    subjectContext: {
      subjectId: params.subjectId,
      subjectName: resolvedSubjectName,
      topicId: params.topicId,
    },
    dailyLimitMinutes,
    onQuizComplete: handleQuizComplete,
  });

  const flatListRef = useRef<FlatList<ChatListItem>>(null);

  useEffect(() => {
    if (state.messages.length > 0) {
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      });
    }
  }, [state.messages.length]);

  const listData = useMemo<ChatListItem[]>(() => {
    const messageItems = [...state.messages].reverse().map((message) => ({
      id: message.id,
      type: 'message' as const,
      message,
    }));

    if (state.isAwaitingResponse) {
      return [
        {
          id: TYPING_PLACEHOLDER_ID,
          type: 'typing',
        },
        ...messageItems,
      ];
    }

    return messageItems;
  }, [state.isAwaitingResponse, state.messages]);

  const typingPlaceholderMessage = useMemo<Message>(
    () => ({
      id: TYPING_PLACEHOLDER_ID,
      sessionId: state.sessionId ?? 'pending-session',
      sender: 'ai',
      content: '',
      safetyFlags: [],
      createdAt: new Date().toISOString(),
    }),
    [state.sessionId]
  );

  const handleSend = useCallback(
    async (text: string, inputSource: 'keyboard' | 'voice' = 'keyboard') => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      await sendMessage(text, inputSource);
    },
    [sendMessage]
  );

  const handleSendQuiz = useCallback(
    async (topic: string) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      await sendQuizRequest(topic);
    },
    [sendQuizRequest]
  );

  const handleRetryAiMessage = useCallback(
    (aiMessageId: string) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      void retryMessage(aiMessageId);
    },
    [retryMessage],
  );

  const handleLongPressMessage = useCallback((content: string) => {
    void Haptics.selectionAsync().catch(() => undefined);
  }, []);

  const handleQuizAnswer = useCallback(
    (questionId: number, answer: string) => {
      submitQuizAnswer(questionId, answer);
    },
    [submitQuizAnswer],
  );

  const handleQuizTryAnother = useCallback(() => {
    resetQuizMode();
  }, [resetQuizMode]);

  const renderItem: ListRenderItem<ChatListItem> = ({ item }) => {
    if (item.type === 'typing') {
      return <MessageBubble message={typingPlaceholderMessage} isTypingPlaceholder ageGroup={profile?.ageGroup} />;
    }

    return (
      <MessageBubble
        message={item.message}
        ageGroup={profile?.ageGroup}
        onLongPressMessage={handleLongPressMessage}
        onRetryAiMessage={handleRetryAiMessage}
        onQuizAnswer={handleQuizAnswer}
        onQuizTryAnother={handleQuizTryAnother}
      />
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.container, { paddingBottom: childTabSceneBottomPadding }]}>
          <SessionHeader
            subjectName={resolvedSubjectName}
            elapsedSeconds={elapsedSeconds}
            minutesRemaining={minutesRemaining}
          />

          {state.error ? (
            <Pressable onPress={clearError} style={styles.errorBanner}>
              <MaterialCommunityIcons name="alert-circle-outline" size={18} color={Colors.errorText} />
              <Text style={styles.errorText}>{state.error}</Text>
            </Pressable>
          ) : null}

        <FlatList
          ref={flatListRef}
          data={listData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.messagesContainer}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="robot-happy-outline" size={44} color={Colors.primary} />
                <Text style={styles.emptyTitle}>Ask your first question</Text>
                <Text style={styles.emptySubtitle}>I can help with math, reading, science, and more.</Text>
              </View>
            }
          />

          <ChatInput
            value={state.inputText}
            ageGroup={profile?.ageGroup ?? '7-11'}
            isLoading={state.isAwaitingResponse || state.isLoading}
            onChangeText={setInputText}
            onSend={handleSend}
            onSendQuiz={handleSendQuiz}
            onTranscribeAudio={transcribeRecording}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  messagesContainer: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    borderRadius: Radii.md,
    backgroundColor: Colors.errorContainer,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
    flex: 1,
  },
  emptyState: {
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.bodySemiBold,
    color: Colors.text,
  },
  emptySubtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
