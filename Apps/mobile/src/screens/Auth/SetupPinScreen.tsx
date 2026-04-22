import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { Colors, Spacing, Shadows, Typography } from '@/constants/theme';
import { toApiErrorMessage, useAuth } from '@/contexts/AuthContext';
import { setupParentPin } from '@/services/authApi';
import { PinInput, type PinInputHandle } from '@/src/components/PinInput';

const PIN_LENGTH = 4;

export default function SetupPinScreen() {
  const queryClient = useQueryClient();
  const { accessToken, markPinConfigured } = useAuth();

  const [parentPin, setParentPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isHandlingMismatch, setIsHandlingMismatch] = useState(false);

  const confirmPinRef = useRef<PinInputHandle>(null);
  const confirmShake = useRef(new Animated.Value(0)).current;

  const clearErrorIfNeeded = useCallback(() => {
    if (errorMessage) {
      setErrorMessage(null);
    }
  }, [errorMessage]);

  const focusConfirmPin = useCallback(() => {
    confirmPinRef.current?.focus();
  }, []);

  const handleParentPinChange = useCallback(
    (nextValue: string) => {
      setParentPin(nextValue);
      clearErrorIfNeeded();

      if (nextValue.length === PIN_LENGTH) {
        focusConfirmPin();
      }
    },
    [clearErrorIfNeeded, focusConfirmPin],
  );

  const handleConfirmPinChange = useCallback(
    (nextValue: string) => {
      setConfirmPin(nextValue);
      clearErrorIfNeeded();
    },
    [clearErrorIfNeeded],
  );

  const playMismatchShake = useCallback(() => {
    setIsHandlingMismatch(true);
    confirmShake.stopAnimation();
    confirmShake.setValue(0);

    Animated.sequence([
      Animated.timing(confirmShake, {
        toValue: 10,
        duration: 50,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(confirmShake, {
        toValue: -10,
        duration: 70,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(confirmShake, {
        toValue: 8,
        duration: 60,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(confirmShake, {
        toValue: -8,
        duration: 50,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(confirmShake, {
        toValue: 4,
        duration: 45,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(confirmShake, {
        toValue: -4,
        duration: 45,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(confirmShake, {
        toValue: 0,
        duration: 80,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished) {
        setIsHandlingMismatch(false);
        return;
      }

      setConfirmPin('');
      setIsHandlingMismatch(false);
      focusConfirmPin();
    });
  }, [confirmShake, focusConfirmPin]);

  const handleSubmit = useCallback(async () => {
    if (isSubmitting || isHandlingMismatch) {
      return;
    }

    if (!accessToken) {
      setErrorMessage('Session expired. Please log in again.');
      return;
    }

    if (parentPin.length !== PIN_LENGTH || confirmPin.length !== PIN_LENGTH) {
      return;
    }

    if (parentPin !== confirmPin) {
      setErrorMessage('PINs do not match — please try again.');
      playMismatchShake();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    Keyboard.dismiss();

    try {
      await setupParentPin(parentPin, accessToken);
      markPinConfigured();
      void queryClient.invalidateQueries({ queryKey: ['auth', 'current-user-summary'] });
    } catch (error) {
      setErrorMessage(toApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    accessToken,
    confirmPin,
    isHandlingMismatch,
    isSubmitting,
    markPinConfigured,
    parentPin,
    playMismatchShake,
    queryClient,
  ]);

  const submitDisabled =
    isSubmitting ||
    isHandlingMismatch ||
    parentPin.length !== PIN_LENGTH ||
    confirmPin.length !== PIN_LENGTH;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.shell}>
            <View style={styles.brandBlock}>
              <Text style={styles.brandName}>KidsMind</Text>
              <Text style={styles.brandSub}>Parental Portal</Text>
            </View>

            <View style={styles.headerBlock}>
              <Text style={styles.title}>Create your parent PIN</Text>
              <Text style={styles.subtitle}>
                You&apos;ll need this every time you access parent controls.
              </Text>
            </View>

            <View style={styles.inputsBlock}>
              <PinInput
                value={parentPin}
                onChange={handleParentPinChange}
                disabled={isSubmitting || isHandlingMismatch}
                autoFocus
                label="Enter PIN"
              />

              <Animated.View style={[styles.confirmShakeWrapper, { transform: [{ translateX: confirmShake }] }]}>
                <PinInput
                  ref={confirmPinRef}
                  value={confirmPin}
                  onChange={handleConfirmPinChange}
                  hasError={Boolean(errorMessage)}
                  disabled={isSubmitting || isHandlingMismatch}
                  label="Confirm PIN"
                />
              </Animated.View>

              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            </View>

            <PrimaryButton
              label="Set PIN"
              onPress={() => {
                void handleSubmit();
              }}
              loading={isSubmitting}
              disabled={submitDisabled}
              style={styles.cta}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xl,
  },
  shell: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    gap: Spacing.xl,
  },
  brandBlock: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  brandName: {
    ...Typography.headline,
    color: Colors.primary,
    fontFamily: 'PlusJakartaSans_800ExtraBold',
  },
  brandSub: {
    ...Typography.caption,
    color: Colors.textTertiary,
  },
  headerBlock: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    ...Typography.headline,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  inputsBlock: {
    gap: Spacing.lg,
  },
  confirmShakeWrapper: {
    width: '100%',
  },
  errorText: {
    ...Typography.caption,
    color: Colors.errorText,
    marginTop: -Spacing.sm,
  },
  cta: {
    ...Shadows.button,
  },
});