/**
 * Migration Notes — expo-av → expo-audio
 *
 * Replaced:
 *   - `import { Audio } from 'expo-av'` → named imports from `expo-audio`
 *   - `Audio.requestPermissionsAsync()` → `requestRecordingPermissionsAsync()`
 *   - `Audio.setAudioModeAsync({allowsRecordingIOS, playsInSilentModeIOS, ...})` →
 *     `setAudioModeAsync({allowsRecording, playsInSilentMode, ...})`
 *     - `allowsRecordingIOS: true/false` → `allowsRecording: true/false`
 *     - `playsInSilentModeIOS: true` → `playsInSilentMode: true`
 *     - `shouldDuckAndroid: true` → `interruptionMode: 'duckOthers'`
 *     - `staysActiveInBackground: false` → `shouldPlayInBackground: false`
 *     - `playThroughEarpieceAndroid: false` → `shouldRouteThroughEarpiece: false`
 *   - `new Audio.Recording()` + ref → `useAudioRecorder(RecordingPresets.HIGH_QUALITY, statusListener)`
 *   - `recording.setProgressUpdateInterval(70)` → `useAudioRecorderState(recorder, 70)`
 *   - `recording.setOnRecordingStatusUpdate(cb)` → `statusListener` param + `useAudioRecorderState`
 *   - `recording.prepareToRecordAsync(opts)` → `recorder.prepareToRecordAsync()`
 *   - `recording.startAsync()` → `recorder.record()`
 *   - `recording.stopAndUnloadAsync()` → `recorder.stop()`
 *   - `recording.getURI()` → `recorder.uri`
 *   - `Audio.RecordingOptionsPresets.HIGH_QUALITY` → `RecordingPresets.HIGH_QUALITY`
 *   - Manual cleanup in useEffect unmount → automatic via `useAudioRecorder` hook
 *
 * Behavioral differences:
 *   - expo-audio's `useAudioRecorder` hook manages the recorder lifecycle (auto-release on unmount).
 *     The previous manual cleanup (setOnRecordingStatusUpdate(null), stopAndUnloadAsync) is no longer needed.
 *   - `RecordingStatus` (event-based, from statusListener) does NOT contain `metering`.
 *     Metering is only available on `RecorderState` via `useAudioRecorderState(recorder, interval)`,
 *     which polls at the specified interval (70ms). This is functionally equivalent to the previous
 *     setProgressUpdateInterval(70) + setOnRecordingStatusUpdate pattern.
 *   - `setAudioModeAsync` in expo-audio uses `Partial<AudioMode>`, so only specified properties are updated.
 *     The `interruptionMode` property replaces the separate `shouldDuckAndroid` flag.
 *   - `recorder.stop()` returns `Promise<void>` and the URI is available on `recorder.uri` afterward.
 *     The previous `recording.getURI()` was synchronous; now we read the `uri` property after `stop()` resolves.
 *   - expo-audio requires the `expo-audio` config plugin in app.json for
 *     `microphonePermission` (iOS NSMicrophoneUsageDescription). This was previously
 *     handled by expo-av's plugin. The plugin entry must be added to app.json plugins array.
 *
 * Limitations discovered:
 *   - None. All expo-av features used have direct expo-audio equivalents.
 */

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
  SlideInRight,
  SlideInUp,
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
  onSend: (text: string, inputSource?: ChatInputSource) => Promise<void> | void;
  onSendQuiz: (topic: string) => Promise<void> | void;
  onTranscribeAudio: (audioUri: string) => Promise<string>;
}

interface IconButtonProps {
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

function IconButton({ name, label, active = false, disabled = false, solid = false, onPress }: IconButtonProps) {
  const iconColor = disabled
    ? Colors.placeholder
    : solid
      ? Colors.white
      : active
        ? Colors.primary
        : Colors.textTertiary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
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
  const canSendText = !recordingActive && value.trim().length > 0 && !busy;

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
      }
    };
  }, []);

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

    if (quizActive) {
      await onSendQuiz(text);
    } else {
      await onSend(text, 'keyboard');
    }

    onChangeText('');
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

      if (shouldSendQuiz) {
        await onSendQuiz(transcript);
      } else {
        await onSend(transcript, 'voice');
      }

      onChangeText('');
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
    console.log('S2S mode');
  }, [busy]);

  return (
    <Animated.View layout={LinearTransition.duration(120)} style={styles.container}>
      {quizActive ? (
        <Animated.View
          entering={SlideInUp.duration(80).easing(Easing.out(Easing.cubic))}
          exiting={FadeOut.duration(60)}
          style={styles.quizPillShell}
        >
          <Animated.View entering={FadeIn.duration(80)} style={styles.quizPill}>
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

      {recordingActive ? (
        <Animated.View
          key="recording"
          entering={SlideInRight.duration(120).withInitialValues({
            opacity: 0,
            transform: [{ translateX: 8 }],
          })}
          exiting={FadeOut.duration(100)}
          layout={LinearTransition.duration(120)}
          style={styles.inputShell}
        >
          <Animated.View entering={FadeIn.duration(120)} style={styles.waveformSlot}>
            <AudioWaveform metering={metering} />
          </Animated.View>
          <IconButton
            name="close"
            label="Cancel recording"
            disabled={inputState.isTranscribing}
            onPress={handleCancelRecording}
          />
          <IconButton
            name="check"
            label="Use recording"
            active
            solid
            disabled={busy}
            onPress={handleConfirmRecording}
          />
        </Animated.View>
      ) : (
        <Animated.View
          key={quizActive ? 'quiz-text' : 'text'}
          entering={FadeIn.duration(120)}
          exiting={FadeOut.duration(100)}
          layout={LinearTransition.duration(120)}
          style={styles.inputShell}
        >
          <TextInput
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            value={value}
            onChangeText={onChangeText}
            placeholder={quizActive ? 'What should the quiz be about?' : getPlaceholder(ageGroup)}
            placeholderTextColor={Colors.placeholder}
            style={styles.input}
            returnKeyType="send"
            editable={!busy}
            onSubmitEditing={() => {
              if (canSendText) {
                void handleSubmitText();
              }
            }}
          />

          {!quizActive ? (
            <>
              <IconButton name="microphone" label="Record voice" disabled={busy} onPress={beginRecording} />
              <IconButton name="headphones" label="Speech to speech" disabled={busy} onPress={handleVoiceToVoice} />
              <IconButton
                name="comment-question-outline"
                label="Start quiz mode"
                disabled={busy}
                onPress={handleActivateQuiz}
              />
            </>
          ) : null}

          <IconButton
            name="send"
            label={quizActive ? 'Generate quiz' : 'Send message'}
            active={canSendText}
            solid
            disabled={!canSendText}
            onPress={handleSubmitText}
          />
        </Animated.View>
      )}

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
  inputShell: {
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
  iconButton: {
    width: 48,
    height: 48,
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
