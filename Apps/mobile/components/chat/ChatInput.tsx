import { memo, useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  SlideInUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { AudioWaveform } from '@/components/chat/AudioWaveform';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';
import type { AgeGroup } from '@/types/child';
import type { ChatInputSource } from '@/types/chat';

type InputMode = 'text' | 'recording' | 'quiz_text' | 'quiz_recording';
type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const MIN_CHILD_TAP_TARGET = 56;
const MAX_MESSAGE_LENGTH = 500;
const DEFAULT_METERING = -160;
const METERING_POLL_INTERVAL_MS = 70;
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

interface InputState {
  mode: InputMode;
  feedback: string | null;
  isTranscribing: boolean;
}

type InputAction =
  | { type: 'activate_quiz' }
  | { type: 'deactivate_quiz' }
  | { type: 'enter_recording' }
  | { type: 'exit_recording' }
  | { type: 'set_feedback'; message: string | null }
  | { type: 'set_transcribing'; value: boolean };

interface ChatInputProps {
  value: string;
  ageGroup: AgeGroup;
  isLoading: boolean;
  onChangeText: (text: string) => void;
  onSend: (text: string, inputSource?: ChatInputSource) => Promise<boolean | void> | boolean | void;
  onSendQuiz: (topic: string) => Promise<boolean | void> | boolean | void;
  onTranscribeAudio: (audioUri: string) => Promise<string>;
  onCancelResponse: () => void;
}

interface ControlButtonProps {
  name: IconName;
  label: string;
  active?: boolean;
  disabled?: boolean;
  solid?: boolean;
  onPress: () => void;
}

function inputReducer(state: InputState, action: InputAction): InputState {
  switch (action.type) {
    case 'activate_quiz':
      return {
        ...state,
        mode: state.mode === 'recording' || state.mode === 'quiz_recording' ? 'quiz_recording' : 'quiz_text',
        feedback: null,
      };
    case 'deactivate_quiz':
      return {
        ...state,
        mode: state.mode === 'quiz_recording' ? 'recording' : 'text',
        feedback: null,
      };
    case 'enter_recording':
      return {
        ...state,
        mode: state.mode === 'quiz_text' || state.mode === 'quiz_recording' ? 'quiz_recording' : 'recording',
        feedback: null,
      };
    case 'exit_recording':
      return {
        ...state,
        mode: state.mode === 'quiz_recording' ? 'quiz_text' : 'text',
      };
    case 'set_feedback':
      return {
        ...state,
        feedback: action.message,
      };
    case 'set_transcribing':
      return {
        ...state,
        isTranscribing: action.value,
      };
    default:
      return state;
  }
}

function isQuizMode(mode: InputMode): boolean {
  return mode === 'quiz_text' || mode === 'quiz_recording';
}

function isRecordingMode(mode: InputMode): boolean {
  return mode === 'recording' || mode === 'quiz_recording';
}

function getPlaceholder(ageGroup: AgeGroup): string {
  if (ageGroup === '3-6') {
    return 'What do you want to learn today?';
  }

  return 'Ask me anything!';
}

function ControlButton({
  name,
  label,
  active = false,
  disabled = false,
  solid = false,
  onPress,
}: ControlButtonProps) {
  const pressScale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const handlePress = useCallback(() => {
    if (disabled) {
      return;
    }

    pressScale.value = withTiming(0.94, { duration: 60, easing: Easing.out(Easing.ease) }, (finished) => {
      if (finished) {
        pressScale.value = withTiming(1, { duration: 80, easing: Easing.out(Easing.ease) });
      }
    });

    onPress();
  }, [disabled, onPress, pressScale]);

  const iconColor = disabled
    ? Colors.placeholder
    : solid
      ? Colors.white
      : active
        ? Colors.primary
        : Colors.textTertiary;

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={handlePress}
        style={({ pressed }) => [
          styles.iconButton,
          solid ? styles.iconButtonSolid : null,
          active && !solid ? styles.iconButtonActive : null,
          disabled ? styles.iconButtonDisabled : null,
          pressed && !disabled ? styles.iconButtonPressed : null,
        ]}
      >
        <MaterialCommunityIcons name={name} size={22} color={iconColor} />
      </Pressable>
    </Animated.View>
  );
}

function ChatInputComponent({
  value,
  ageGroup,
  isLoading,
  onChangeText,
  onSend,
  onSendQuiz,
  onTranscribeAudio,
  onCancelResponse,
}: ChatInputProps) {
  const [inputState, dispatch] = useReducer(inputReducer, {
    mode: 'text',
    feedback: null,
    isTranscribing: false,
  });
  const [metering, setMetering] = useState(DEFAULT_METERING);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const recorder = useAudioRecorder(RECORDING_OPTIONS, (status) => {
    if (status.hasError) {
      recorderRef.current = null;
      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
      dispatch({ type: 'exit_recording' });
      dispatch({ type: 'set_feedback', message: 'Voice recording could not start. Please try again.' });
    }
  });

  const recorderState = useAudioRecorderState(recorder, METERING_POLL_INTERVAL_MS);

  const quizActive = isQuizMode(inputState.mode);
  const recordingActive = isRecordingMode(inputState.mode);
  const busy = isLoading || inputState.isTranscribing;
  const isAiLoading = isLoading && !inputState.isTranscribing;
  const canSendText = !recordingActive && value.trim().length > 0 && !busy;
  const showSendButton = canSendText && !isAiLoading;
  const showStopButton = isAiLoading && !recordingActive;

  useEffect(() => {
    if (recorderState.isRecording && typeof recorderState.metering === 'number') {
      setMetering(recorderState.metering);
    }
  }, [recorderState.isRecording, recorderState.metering]);

  const restoreAudioMode = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
    }).catch(() => undefined);
  }, []);

  const stopActiveRecording = useCallback(async (): Promise<string | null> => {
    const activeRecorder = recorderRef.current;
    if (!activeRecorder) {
      return null;
    }

    recorderRef.current = null;

    try {
      await activeRecorder.stop();
    } catch {
      await restoreAudioMode();
      return null;
    }

    const uri = activeRecorder.uri;
    await restoreAudioMode();
    return uri;
  }, [restoreAudioMode]);

  useEffect(() => {
    return () => {
      const activeRecorder = recorderRef.current;
      recorderRef.current = null;

      if (activeRecorder) {
        void activeRecorder.stop().catch(() => undefined);
        void restoreAudioMode();
      }
    };
  }, [restoreAudioMode]);

  const beginRecording = useCallback(async () => {
    if (busy || recorderRef.current) {
      return;
    }

    dispatch({ type: 'set_feedback', message: null });
    await Haptics.selectionAsync().catch(() => undefined);

    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      dispatch({
        type: 'set_feedback',
        message: 'Microphone access is needed to use voice. Please allow microphone access in settings.',
      });
      return;
    }

    try {
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });

      await recorder.prepareToRecordAsync();
      recorder.record();
      recorderRef.current = recorder;
      setMetering(DEFAULT_METERING);
      dispatch({ type: 'enter_recording' });
    } catch {
      recorderRef.current = null;
      await restoreAudioMode();
      dispatch({ type: 'exit_recording' });
      dispatch({ type: 'set_feedback', message: 'Voice recording could not start. Please try again.' });
    }
  }, [busy, recorder, restoreAudioMode]);

  const handleCancelRecording = useCallback(async () => {
    if (inputState.isTranscribing) {
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    await stopActiveRecording();
    setMetering(DEFAULT_METERING);
    dispatch({ type: 'exit_recording' });
  }, [inputState.isTranscribing, stopActiveRecording]);

  const handleSubmitText = useCallback(async () => {
    const text = value.trim();
    if (!text || busy) {
      return;
    }

    dispatch({ type: 'set_feedback', message: null });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);

    const didSend = quizActive ? await onSendQuiz(text) : await onSend(text, 'keyboard');

    if (didSend !== false) {
      onChangeText('');
    }
  }, [busy, onChangeText, onSend, onSendQuiz, quizActive, value]);

  const handleConfirmRecording = useCallback(async () => {
    if (busy) {
      return;
    }

    const shouldSendQuiz = quizActive;
    dispatch({ type: 'set_transcribing', value: true });
    dispatch({ type: 'set_feedback', message: null });
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    const audioUri = await stopActiveRecording();
    setMetering(DEFAULT_METERING);
    dispatch({ type: 'exit_recording' });

    if (!audioUri) {
      dispatch({ type: 'set_transcribing', value: false });
      dispatch({ type: 'set_feedback', message: 'I could not save that recording. Please try again.' });
      return;
    }

    try {
      const transcript = (await onTranscribeAudio(audioUri)).trim();
      if (!transcript) {
        dispatch({ type: 'set_feedback', message: 'I could not hear words in that recording. Please try again.' });
        return;
      }

      onChangeText(transcript);

      const didSend = shouldSendQuiz
        ? await onSendQuiz(transcript)
        : await onSend(transcript, 'voice');

      if (didSend !== false) {
        onChangeText('');
      }
    } catch {
      dispatch({
        type: 'set_feedback',
        message: 'Voice transcription is unavailable right now. Please try again.',
      });
    } finally {
      dispatch({ type: 'set_transcribing', value: false });
    }
  }, [busy, onChangeText, onSend, onSendQuiz, onTranscribeAudio, quizActive, stopActiveRecording]);

  const handleActivateQuiz = useCallback(async () => {
    if (busy) {
      return;
    }

    await Haptics.selectionAsync().catch(() => undefined);
    dispatch({ type: 'activate_quiz' });
  }, [busy]);

  const handleDeactivateQuiz = useCallback(async () => {
    await Haptics.selectionAsync().catch(() => undefined);
    dispatch({ type: 'deactivate_quiz' });
  }, []);

  const handleVoiceToVoice = useCallback(async () => {
    if (busy) {
      return;
    }

    await Haptics.selectionAsync().catch(() => undefined);
    dispatch({
      type: 'set_feedback',
      message: 'Speech-to-speech is coming soon. Use the microphone button for voice.',
    });
  }, [busy]);

  return (
    <Animated.View layout={LinearTransition.duration(120)} style={styles.container}>
      {quizActive ? (
        <Animated.View
          entering={SlideInUp.duration(150).easing(Easing.out(Easing.ease)).withInitialValues({
            opacity: 0,
            transform: [{ translateY: 8 }],
          })}
          exiting={FadeOut.duration(150).easing(Easing.out(Easing.ease))}
          style={styles.quizPillShell}
        >
          <Animated.View entering={FadeIn.duration(150).easing(Easing.out(Easing.ease))} style={styles.quizPill}>
            <MaterialCommunityIcons name="comment-question-outline" size={16} color={Colors.primary} />
            <Text style={styles.quizPillText}>Quiz Mode</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exit quiz mode"
              onPress={handleDeactivateQuiz}
              style={({ pressed }) => [
                styles.quizCloseButton,
                pressed ? styles.iconButtonPressed : null,
              ]}
            >
              <MaterialCommunityIcons name="close" size={16} color={Colors.primary} />
            </Pressable>
          </Animated.View>
        </Animated.View>
      ) : null}

      <Animated.View
        layout={LinearTransition.duration(120)}
        style={styles.topRow}
      >
        {recordingActive ? (
          <Animated.View
            entering={FadeIn.duration(120).easing(Easing.out(Easing.ease))}
            style={styles.waveformSlot}
          >
            <AudioWaveform metering={metering} />
          </Animated.View>
        ) : (
          <Animated.View
            entering={FadeIn.duration(120).easing(Easing.out(Easing.ease))}
            layout={LinearTransition.duration(120)}
            style={styles.inputSlot}
          >
            <TextInput
              accessibilityLabel={quizActive ? 'Quiz topic' : 'Message to Qubie'}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
              value={value}
              onChangeText={onChangeText}
              placeholder={quizActive ? 'What should the quiz be about?' : getPlaceholder(ageGroup)}
              placeholderTextColor={Colors.placeholder}
              style={styles.input}
              returnKeyType="send"
              editable={!inputState.isTranscribing}
              onSubmitEditing={() => {
                if (canSendText) {
                  void handleSubmitText();
                }
              }}
            />
          </Animated.View>
        )}

        {showStopButton ? (
          <Animated.View
            entering={FadeIn.duration(120).easing(Easing.out(Easing.ease))}
            exiting={FadeOut.duration(120).easing(Easing.out(Easing.ease))}
            layout={LinearTransition.duration(120)}
          >
            <ControlButton
              name="stop-circle"
              label="Stop generating"
              solid
              onPress={onCancelResponse}
            />
          </Animated.View>
        ) : null}

        {recordingActive ? (
          <Animated.View
            entering={FadeIn.duration(120).easing(Easing.out(Easing.ease))}
            exiting={FadeOut.duration(120).easing(Easing.out(Easing.ease))}
            layout={LinearTransition.duration(120)}
            style={styles.recordingControls}
          >
            <ControlButton
              name="close"
              label="Cancel recording"
              disabled={inputState.isTranscribing}
              onPress={handleCancelRecording}
            />
            <ControlButton
              name="check"
              label="Use recording"
              active
              solid
              disabled={busy}
              onPress={handleConfirmRecording}
            />
          </Animated.View>
        ) : null}
      </Animated.View>

      {!recordingActive ? (
        <Animated.View
          entering={FadeIn.duration(120).easing(Easing.out(Easing.ease))}
          exiting={FadeOut.duration(100).easing(Easing.out(Easing.ease))}
          layout={LinearTransition.duration(120)}
          style={styles.bottomRow}
        >
          <ControlButton
            name="comment-question-outline"
            label={quizActive ? 'Quiz mode active' : 'Start quiz mode'}
            active={quizActive}
            disabled={busy}
            onPress={quizActive ? handleDeactivateQuiz : handleActivateQuiz}
          />

          <Animated.View style={styles.rightControls}>
            {!quizActive ? (
              <Animated.View
                entering={FadeIn.duration(120).easing(Easing.out(Easing.ease))}
                exiting={FadeOut.duration(100).easing(Easing.out(Easing.ease))}
                layout={LinearTransition.duration(120)}
                style={styles.rightControls}
              >
                <ControlButton
                  name="headphones"
                  label="Speech to speech"
                  disabled={busy}
                  onPress={handleVoiceToVoice}
                />
                <ControlButton
                  name="microphone"
                  label="Record voice"
                  disabled={busy}
                  onPress={beginRecording}
                />
              </Animated.View>
            ) : null}

            {showSendButton ? (
              <Animated.View
                entering={FadeIn.duration(120).easing(Easing.out(Easing.ease))}
                exiting={FadeOut.duration(100).easing(Easing.out(Easing.ease))}
                layout={LinearTransition.duration(120)}
              >
                <ControlButton
                  name="send"
                  label={quizActive ? 'Generate quiz' : 'Send message'}
                  active
                  solid
                  onPress={handleSubmitText}
                />
              </Animated.View>
            ) : null}
          </Animated.View>
        </Animated.View>
      ) : null}

      {inputState.feedback ? <Text style={styles.feedbackText}>{inputState.feedback}</Text> : null}

      {!recordingActive && value.length >= 400 ? (
        <Text style={styles.counterText}>{value.length}/{MAX_MESSAGE_LENGTH}</Text>
      ) : null}
    </Animated.View>
  );
}

export const ChatInput = memo(ChatInputComponent);

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  quizPillShell: {
    alignItems: 'flex-start',
  },
  quizPill: {
    minHeight: 32,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryFixed,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  quizPillText: {
    ...Typography.captionMedium,
    color: Colors.primary,
  },
  quizCloseButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    borderRadius: Radii.xl,
    backgroundColor: Colors.surfaceContainerLow,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.xs,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    minHeight: MIN_CHILD_TAP_TARGET,
  },
  inputSlot: {
    flex: 1,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: MIN_CHILD_TAP_TARGET - Spacing.md,
    ...Typography.body,
    color: Colors.text,
    textAlignVertical: 'center',
    paddingVertical: Spacing.sm,
  },
  waveformSlot: {
    flex: 1,
    minHeight: MIN_CHILD_TAP_TARGET - Spacing.md,
    justifyContent: 'center',
  },
  recordingControls: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: Spacing.xs,
    paddingRight: Spacing.xs,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonActive: {
    backgroundColor: Colors.primaryFixed,
  },
  iconButtonSolid: {
    backgroundColor: Colors.primary,
  },
  iconButtonDisabled: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  iconButtonPressed: {
    transform: [{ scale: 0.96 }],
  },
  feedbackText: {
    ...Typography.caption,
    color: Colors.errorText,
    paddingHorizontal: Spacing.xs,
  },
  counterText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    textAlign: 'right',
    paddingRight: Spacing.xs,
  },
});
