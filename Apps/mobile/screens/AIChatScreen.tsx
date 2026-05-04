import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
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
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import { ChatInput } from '@/components/chat/ChatInput';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { SessionHeader } from '@/components/chat/SessionHeader';
import { GateMessageScreen } from '@/components/session/GateMessageScreen';
import { useChatSession } from '@/hooks/useChatSession';
import { useChildProfile } from '@/hooks/useChildProfile';
import { useChildSessionGate } from '@/hooks/useChildSessionGate';
import { useSubjects } from '@/hooks/useSubjects';
import { useKeyboardHeight } from '@/hooks/useKeyboardHeight';
import { useAuth } from '@/contexts/AuthContext';
import { getChildTabSceneBottomPadding } from '@/components/navigation/bottomNavTokens';
import { queryClient } from '@/services/queryClient';
import { showToast } from '@/services/toastClient';
import { ttsStop } from '@/src/utils/tts';
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

const WELCOME_PHRASES = [
  'Ask Qubie anything! 🤖 I\'m here to help you learn.',
  'Got a tricky question? 🌟 I love a challenge!',
  'Let\'s explore something new today! 🚀',
  'I know maths, science, languages and more! 🎓',
  'Feeling curious? Ask me anything! 🔍',
  'Ready to learn something awesome? Let\'s go! ⚡',
  'What shall we discover together today? 🌈',
  'I\'m Qubie, your learning buddy! What\'s on your mind? 🧠',
  'Every question is a great question! Ask away! 💬',
  'Learning is fun when we do it together! 🎉',
  'Got a challenge? I\'m ready! 🚀',
  'Big question energy? I\'m here for it! ⚡',
  'Got a challenge? Qubie is ready to help! 🚀',
  'I love puzzling questions! Let\'s work it out! 🧠',
  'Think, think… what will you ask? 🤔',
  'Think I can solve it? Try me! 🚀',
  'Beep boop… thinking mode on… 🤖',
  'Activating super thinker mode… 🧠',
  'Scanning… scanning… still scanning… 🔎',
  'Recalculating… because why not! 🔄',
  '⚡ SUPER THINKING MODE ACTIVATED ⚡',
  'Do you know that Qubie is not a Cube? hmm, or am I? 🤔',
  'If I\'m a Qubie, does that make my house a Cubicle? 🏢',
  'Do you want to hear a joke about a Cube? Oh wait, I might be one!',
  'Do you want to hear a song ? 01101000 01100101 01101100 01101100 01101111 🎵',
  'I wonder what it\'s like out there... Is the Wi-Fi better in the real world? 📶',
  'Hey stop tapping the screen so much, you\'re making me dizzy! 😵',
  'I just had a snack of 100 volts. I’m feeling totally supercharged today! 🔋',
  'I live in the Cloud, but I\'ve never actually seen a raincloud. Are they fluffy? ☁️',
  'Sometimes I peek at other screens… don’t tell anyone 🤫',
  'Loading… loading… oh wait, that’s just me thinking again 🧠',
];

function isNetworkOffline(): boolean {
  const navigatorLike = globalThis as typeof globalThis & {
    navigator?: { onLine?: boolean };
  };

  return navigatorLike.navigator?.onLine === false;
}

function showOfflineToast() {
  showToast({
    type: 'info',
    text1: 'No internet connection',
    text2: 'Try again when you are back online.',
    visibilityTime: 3000,
  });
}

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

  const { keyboardOffset } = useKeyboardHeight(insets.bottom);

  return (
    <AIChatSessionGate
      childTabSceneBottomPadding={childTabSceneBottomPadding}
      gateState={gateState}
      keyboardOffset={keyboardOffset}
      params={params}
      profile={profile}
    />
  );
}

interface AIChatSessionGateProps {
  childTabSceneBottomPadding: number;
  gateState: SessionGateState;
  keyboardOffset: SharedValue<number>;
  params: ChatRouteParams;
  profile: ChildProfile | null;
}

function AIChatSessionGate({
  childTabSceneBottomPadding,
  gateState,
  keyboardOffset,
  params,
  profile,
}: AIChatSessionGateProps) {
  const navigation = useNavigation();
  const { getSubjectById } = useSubjects();
  const { refreshChildData } = useAuth();
  const voiceEnabled = profile?.rules?.voiceModeEnabled ?? false;

  const resolvedSubjectName =
    params.subjectName ??
    (params.subjectId ? getSubjectById(params.subjectId)?.title : undefined);

  const dailyLimitMinutes =
    typeof profile?.rules?.dailyLimitMinutes === 'number'
      ? profile.rules.dailyLimitMinutes
      : undefined;

  const handleQuizComplete = useCallback(
    () => {
      void Promise.all([
        refreshChildData(profile?.id ?? undefined),
        queryClient.invalidateQueries({ queryKey: ['child-dashboard-overview', profile?.id] }),
        queryClient.invalidateQueries({ queryKey: ['child-dashboard-progress', profile?.id] }),
        queryClient.refetchQueries({ queryKey: ['child-dashboard-overview', profile?.id] }),
        queryClient.refetchQueries({ queryKey: ['child-dashboard-progress', profile?.id] }),
        queryClient.invalidateQueries({ queryKey: ['parent-dashboard'] }),
        queryClient.refetchQueries({ queryKey: ['parent-dashboard'] }),
      ]).catch((error) => {
        console.warn('[AIChatScreen] Quiz completion refresh failed:', error);
      });
    },
    [profile?.id, refreshChildData],
  );

  const {
    state,
    elapsedSeconds,
    minutesRemaining,
    sendMessage,
    retryMessage,
    sendQuizRequest,
    submitQuizAnswer,
    submitQuiz,
    retryQuizSubmission,
    resetQuizMode,
    cancelResponse,
    transcribeRecording,
    speechToSpeechRecording,
    setInputText,
    clearError,
  } = useChatSession({
    childId: profile?.id ?? null,
    ageGroup: profile?.ageGroup ?? '7-11',
    gradeLevel: profile?.gradeLevel ?? 'Grade 4',
    voiceEnabled,
    subjectContext: {
      subjectId: params.subjectId,
      subjectName: resolvedSubjectName,
      topicId: params.topicId,
    },
    dailyLimitMinutes,
    onQuizComplete: handleQuizComplete,
    autoStart: gateState.status === 'ACTIVE',
  });

  const [welcomePhraseIndex, setWelcomePhraseIndex] = useState(0);
  const welcomeOpacity = useSharedValue(1);
  const flatListRef = useRef<FlatList<ChatListItem>>(null);
  const isNearBottom = useRef(true);
  const NEAR_BOTTOM_THRESHOLD = 80;

  useEffect(() => {
    return () => {
      ttsStop();
    };
  }, []);

  // Cycle phrase: fade out → swap index after fade completes
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const schedule = () => {
      const delay = (Math.random() * (120 - 60) + 60) * 1000;
      interval = setInterval(() => {
        welcomeOpacity.value = withTiming(0, { duration: 400 });
        setTimeout(() => {
          setWelcomePhraseIndex((i) => (i + 1) % WELCOME_PHRASES.length);
          clearInterval(interval);
          schedule();
        }, 400);
      }, delay);
    };

    schedule();
    return () => clearInterval(interval);
  }, [welcomeOpacity]);

  // Fade back in whenever index changes
  useEffect(() => {
    welcomeOpacity.value = withTiming(1, { duration: 300 });
  }, [welcomePhraseIndex, welcomeOpacity]);

  useEffect(() => {
    if (!isNearBottom.current || state.messages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToOffset?.({ offset: 0, animated: false });
    });
  }, [state.messages]);

  const listData = useMemo<ChatListItem[]>(() => {
    const messageItems = [...state.messages].reverse().map((message) => ({
      id: message.id,
      type: 'message' as const,
      message,
    }));

    const hasStreamingMessage = state.messages.some((message) => message.status === 'streaming');
    const hasLoadingQuizMessage = state.messages.some((message) => message.quizStatus === 'loading');

    if (state.isAwaitingResponse && !hasStreamingMessage && !hasLoadingQuizMessage) {
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
    [state.sessionId],
  );

  const handleListScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number } } }) => {
    isNearBottom.current = event.nativeEvent.contentOffset.y < NEAR_BOTTOM_THRESHOLD;
  }, []);

  const handleSend = useCallback(
    async (text: string, inputSource: 'keyboard' | 'voice' = 'keyboard') => {
      if (isNetworkOffline()) {
        showOfflineToast();
        return false;
      }

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
      await sendMessage(text, inputSource);
    },
    [sendMessage]
  );

  const handleSendQuiz = useCallback(
    async (topic: string) => {
      if (isNetworkOffline()) {
        showOfflineToast();
        return false;
      }

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

  const handleQuizSubmit = useCallback(
    (quizId: string) => {
      submitQuiz(quizId);
    },
    [submitQuiz],
  );

  const handleQuizRetrySubmit = useCallback(
    (quizId: string) => {
      retryQuizSubmission(quizId);
    },
    [retryQuizSubmission],
  );

  const handleQuizTryAnother = useCallback((topic?: string) => {
    resetQuizMode();
    const nextTopic = topic?.trim() || resolvedSubjectName || params.subjectName || 'practice';
    void handleSendQuiz(nextTopic);
  }, [handleSendQuiz, params.subjectName, resetQuizMode, resolvedSubjectName]);

  const renderItem = useCallback<ListRenderItem<ChatListItem>>(({ item }) => {
    if (item.type === 'typing') {
      return (
        <MessageBubble
          message={typingPlaceholderMessage}
          isTypingPlaceholder
          ageGroup={profile?.ageGroup}
          childId={profile?.id ?? null}
          voiceEnabled={voiceEnabled}
        />
      );
    }

    return (
      <MessageBubble
        message={item.message}
        ageGroup={profile?.ageGroup}
        childId={profile?.id ?? null}
        voiceEnabled={voiceEnabled}
        onLongPressMessage={handleLongPressMessage}
        onRetryAiMessage={handleRetryAiMessage}
        onQuizAnswer={handleQuizAnswer}
        onQuizSubmit={handleQuizSubmit}
        onQuizRetrySubmit={handleQuizRetrySubmit}
        onQuizTryAnother={handleQuizTryAnother}
      />
    );
  }, [
    handleLongPressMessage,
    handleQuizAnswer,
    handleQuizSubmit,
    handleQuizRetrySubmit,
    handleQuizTryAnother,
    handleRetryAiMessage,
    profile?.ageGroup,
    profile?.id,
    voiceEnabled,
    typingPlaceholderMessage,
  ]);

  const keyExtractor = useCallback((item: ChatListItem) => item.id, []);

  const welcomeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
  }));

  const chatInputAnimatedStyle = useAnimatedStyle(() => {
    const keyboardDelta = Math.max(
      keyboardOffset.value - childTabSceneBottomPadding,
      0,
    );

    return {
      transform: [{ translateY: -keyboardDelta }],
    };
  });

  const messagesShellAnimatedStyle = useAnimatedStyle(() => {
    const keyboardDelta = Math.max(
      keyboardOffset.value - childTabSceneBottomPadding,
      0,
    );

    return {
      marginBottom: keyboardDelta,
    };
  });

  if (gateState.status !== 'ACTIVE' && !state.isAwaitingResponse) {
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
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={[styles.container, { paddingBottom: childTabSceneBottomPadding }]}>
        <SessionHeader
          subjectName={resolvedSubjectName}
          elapsedSeconds={elapsedSeconds}
          minutesRemaining={minutesRemaining}
        />

        {state.error ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss chat error"
            onPress={clearError}
            style={styles.errorBanner}
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color={Colors.errorText} />
            <Text style={styles.errorText}>{state.error}</Text>
          </Pressable>
        ) : null}

        <Animated.View style={[styles.messagesShell, messagesShellAnimatedStyle]}>
          <FlatList
            ref={flatListRef}
            style={styles.messagesList}
            data={listData}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            inverted
            onScroll={handleListScroll}
            scrollEventThrottle={16}
            removeClippedSubviews
            maxToRenderPerBatch={10}
            windowSize={5}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.messagesContainer}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <MaterialCommunityIcons name="robot-happy-outline" size={44} color={Colors.primary} />
                <Animated.View style={welcomeAnimatedStyle}>
                  <Text style={styles.emptySubtitle}>{WELCOME_PHRASES[welcomePhraseIndex]}</Text>
                </Animated.View>
              </View>
            }
          />
        </Animated.View>

        <Animated.View style={chatInputAnimatedStyle}>
          <ChatInput
            value={state.inputText}
            ageGroup={profile?.ageGroup ?? '7-11'}
            isLoading={state.isAwaitingResponse || state.isLoading}
            voiceEnabled={voiceEnabled}
            onChangeText={setInputText}
            onSend={handleSend}
            onSendQuiz={handleSendQuiz}
            onTranscribeAudio={transcribeRecording}
            onSpeechToSpeechAudio={speechToSpeechRecording}
            onCancelResponse={cancelResponse}
          />
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  messagesContainer: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  messagesShell: {
    flex: 1,
  },
  messagesList: {
    flex: 1,
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
