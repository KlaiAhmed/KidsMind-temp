/**
 * ParentPINGate Component
 *
 * A reusable PIN verification modal for child → parent access control.
 * Features blur background, custom PIN pad with app design tokens,
 * shake animation on wrong PIN, and secure session management.
 *
 * Security-critical: This gate has NO backdrop dismiss and requires
 * explicit PIN entry or cancel action to exit.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type AnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Colors, Radii, Sizing, Spacing, Typography } from '@/constants/theme';
import { ApiClientError } from '@/services/apiClient';

const PIN_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'] as const;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 300;
const PIN_LOCKOUT_STORAGE_KEY = 'pin_lockout_until';
const PIN_LOCKOUT_MESSAGE = 'Too many attempts. Try again in 5 minutes.';
type PinDigit = (typeof PIN_DIGITS)[number];

type PinGateState = 'idle' | 'entering' | 'submitting' | 'error' | 'success';

function formatLockoutRemaining(totalSeconds: number): string {
  const boundedSeconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(boundedSeconds / 60);
  const seconds = `${boundedSeconds % 60}`.padStart(2, '0');

  return `${minutes}:${seconds}`;
}

function getPinVerificationErrorStatus(error: unknown): number | null {
  if (error instanceof ApiClientError) {
    return error.status;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }

  return null;
}

interface PinDotProps {
  index: number;
  isFilled: boolean;
  isError: boolean;
  isSuccess: boolean;
  dotOpacity: SharedValue<number>;
  successCheckmarkStyle: AnimatedStyle<ViewStyle>;
}

function PinDot({ index, isFilled, isError, isSuccess, dotOpacity, successCheckmarkStyle }: PinDotProps) {
  const dotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: dotOpacity.value,
  }));

  return (
    <Animated.View
      key={index}
      style={[
        styles.pinDot,
        isFilled && styles.pinDotFilled,
        isError && styles.pinDotError,
        dotAnimatedStyle,
      ]}
    >
      {isFilled && !isSuccess && <View style={styles.pinDotInner} />}
      {isFilled && isSuccess && index === 3 && (
        <Animated.View style={[styles.successCheckmark, successCheckmarkStyle]}>
          <MaterialCommunityIcons
            color={Colors.success}
            name="check-bold"
            size={16}
          />
        </Animated.View>
      )}
    </Animated.View>
  );
}

interface ParentPINGateProps {
  visible: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  verifyPin: (pin: string) => Promise<boolean>;
  title?: string;
  subtitle?: string;
  onBiometricSuccess?: () => void;
}

export function ParentPINGate({
  visible,
  onSuccess,
  onCancel,
  verifyPin,
  title = 'Parent Access',
  subtitle,
}: ParentPINGateProps) {
  const insets = useSafeAreaInsets();
  const [pin, setPin] = useState<string>('');
  const [gateState, setGateState] = useState<PinGateState>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [attemptCount, setAttemptCount] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState(0);
  const isLockedOut = lockoutRemainingSeconds > 0;

  const modalTranslateY = useSharedValue(300);
  const modalOpacity = useSharedValue(0);
  const shakeTranslateX = useSharedValue(0);
  const dotOpacity0 = useSharedValue(1);
  const dotOpacity1 = useSharedValue(1);
  const dotOpacity2 = useSharedValue(1);
  const dotOpacity3 = useSharedValue(1);
  const dotOpacityValues = useMemo(() => [dotOpacity0, dotOpacity1, dotOpacity2, dotOpacity3], [dotOpacity0, dotOpacity1, dotOpacity2, dotOpacity3]);
  const successScale = useSharedValue(0);

  useEffect(() => {
    let isMounted = true;

    async function hydrateLockout() {
      const storedLockoutUntil = await AsyncStorage.getItem(PIN_LOCKOUT_STORAGE_KEY).catch(() => null);
      const storedTimestamp = storedLockoutUntil ? Number.parseInt(storedLockoutUntil, 10) : Number.NaN;

      if (!isMounted) {
        return;
      }

      if (!Number.isFinite(storedTimestamp)) {
        return;
      }

      if (storedTimestamp > Date.now()) {
        // SECURITY: Persisted lockout survives app restarts and blocks PIN entry immediately.
        setLockoutUntil(storedTimestamp);
        setLockoutRemainingSeconds(Math.ceil((storedTimestamp - Date.now()) / 1000));
        setGateState('error');
        setErrorMessage(PIN_LOCKOUT_MESSAGE);
        return;
      }

      await AsyncStorage.removeItem(PIN_LOCKOUT_STORAGE_KEY).catch(() => undefined);
    }

    void hydrateLockout();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!lockoutUntil) {
      return;
    }

    const updateRemaining = () => {
      const remainingSeconds = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
      setLockoutRemainingSeconds(remainingSeconds);

      if (remainingSeconds > 0) {
        return;
      }

      setLockoutUntil(null);
      setAttemptCount(0);
      setPin('');
      setGateState('idle');
      setErrorMessage('');
      void AsyncStorage.removeItem(PIN_LOCKOUT_STORAGE_KEY).catch(() => undefined);
    };

    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [lockoutUntil]);

  useEffect(() => {
    if (visible) {
      modalTranslateY.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.cubic) });
      modalOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.cubic) });
      const timer = setTimeout(() => {}, 300);
      return () => clearTimeout(timer);
    } else {
      setPin('');
      setGateState('idle');
      setErrorMessage('');
      modalTranslateY.value = 300;
      modalOpacity.value = 0;
      shakeTranslateX.value = 0;
      dotOpacityValues.forEach((sv) => { sv.value = 1; });
      successScale.value = 0;
    }
  }, [visible, modalTranslateY, modalOpacity, shakeTranslateX, dotOpacityValues, successScale]);

  useEffect(() => {
    if (!visible) return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => backHandler.remove();
  }, [visible]);

  const triggerShake = useCallback(() => {
    shakeTranslateX.value = withSequence(
      withTiming(-10, { duration: 50, easing: Easing.out(Easing.cubic) }),
      withTiming(10, { duration: 80, easing: Easing.inOut(Easing.cubic) }),
      withTiming(-10, { duration: 80, easing: Easing.inOut(Easing.cubic) }),
      withTiming(10, { duration: 80, easing: Easing.inOut(Easing.cubic) }),
      withTiming(-10, { duration: 80, easing: Easing.inOut(Easing.cubic) }),
      withTiming(0, { duration: 50, easing: Easing.out(Easing.cubic) }),
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }, [shakeTranslateX]);

  const animateDotEntry = useCallback(
    (index: number) => {
      dotOpacityValues[index].value = withSequence(
        withTiming(0.5, { duration: 80 }),
        withTiming(1, { duration: 150 }),
      );
    },
    [dotOpacityValues],
  );

  const startLockout = useCallback(() => {
    const nextLockoutUntil = Date.now() + PIN_LOCKOUT_SECONDS * 1000;

    // SECURITY: Five failed child -> parent PIN attempts trigger a persisted timed lockout.
    setLockoutUntil(nextLockoutUntil);
    setLockoutRemainingSeconds(PIN_LOCKOUT_SECONDS);
    setAttemptCount(MAX_PIN_ATTEMPTS);
    setPin('');
    setGateState('error');
    setErrorMessage(PIN_LOCKOUT_MESSAGE);
    void AsyncStorage.setItem(PIN_LOCKOUT_STORAGE_KEY, `${nextLockoutUntil}`).catch(() => undefined);
  }, []);

  const handleDigitPress = useCallback(
    async (digit: PinDigit) => {
      if (gateState === 'submitting' || gateState === 'success' || isLockedOut) return;

      if (digit === 'backspace') {
        setPin((prev) => prev.slice(0, -1));
        setGateState('idle');
        setErrorMessage('');
        return;
      }

      if (digit === '') return;

      if (pin.length < 4) {
        const newPin = pin + digit;
        setPin(newPin);
        animateDotEntry(newPin.length - 1);

        if (newPin.length === 4) {
          setGateState('submitting');
          Keyboard.dismiss();

          try {
            const isValid = await verifyPin(newPin);

            if (isValid) {
              setAttemptCount(0);
              setLockoutUntil(null);
              setLockoutRemainingSeconds(0);
              void AsyncStorage.removeItem(PIN_LOCKOUT_STORAGE_KEY).catch(() => undefined);
              setGateState('success');
              successScale.value = withSequence(
                withTiming(1.2, { duration: 150 }),
                withTiming(1, { duration: 150 }),
              );
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
                () => undefined,
              );
              setTimeout(() => { onSuccess(); }, 400);
            } else {
              const nextAttemptCount = attemptCount + 1;

              setAttemptCount(nextAttemptCount);
              triggerShake();
              setPin('');

              if (nextAttemptCount >= MAX_PIN_ATTEMPTS) {
                startLockout();
                return;
              }

              setGateState('error');
              setErrorMessage('Incorrect PIN. Please try again.');
            }
          } catch (error) {
            const status = getPinVerificationErrorStatus(error);

            if (status === 429) {
              triggerShake();
              startLockout();
              return;
            }

            setGateState('error');
            setErrorMessage(
              status === 0 || status === 408
                ? "Couldn't verify PIN. Check your connection."
                : "Couldn't verify PIN. Please try again.",
            );
            triggerShake();
            setPin('');
          }
        }
      }
    },
    [
      animateDotEntry,
      attemptCount,
      gateState,
      isLockedOut,
      onSuccess,
      pin,
      startLockout,
      successScale,
      triggerShake,
      verifyPin,
    ],
  );

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onCancel();
  }, [onCancel]);

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: modalTranslateY.value }],
    opacity: modalOpacity.value,
  }));

  const shakeAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeTranslateX.value }],
  }));

  const successCheckmarkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: successScale.value }],
    opacity: successScale.value,
  }));

  const lockoutCountdownLabel = useMemo(
    () => formatLockoutRemaining(lockoutRemainingSeconds),
    [lockoutRemainingSeconds],
  );

  const renderKey = (digit: PinDigit, index: number) => {
    const isBackspace = digit === 'backspace';
    const isEmpty = digit === '';
    const isKeyDisabled = gateState === 'submitting' || gateState === 'success' || isLockedOut;

    if (isEmpty) {
      return <View key={`empty-${index}`} style={styles.keyButton} />;
    }

    return (
      <Pressable
        key={isBackspace ? 'backspace' : digit}
        accessibilityLabel={isBackspace ? 'Backspace' : `Digit ${digit}`}
        accessibilityRole="button"
        disabled={isKeyDisabled}
        onPress={() => handleDigitPress(digit)}
        style={({ pressed }) => [
          styles.keyButton,
          pressed && styles.keyButtonPressed,
          isKeyDisabled && styles.keyButtonDisabled,
        ]}
      >
        {/* a11y: Digit keys announce the exact keypad action to screen readers. */}
        {isBackspace ? (
          <MaterialCommunityIcons
            color={isKeyDisabled ? Colors.textTertiary : Colors.text}
            name="backspace-outline"
            size={24}
          />
        ) : (
          <Text style={styles.keyText}>{digit}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <Modal
      animationType="none"
      onRequestClose={() => {}}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <StatusBar barStyle="light-content" translucent />

      <BlurView intensity={50} style={StyleSheet.absoluteFill} tint="dark" />
      <View style={styles.overlay} />

      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <Animated.View style={[styles.modalContent, modalAnimatedStyle]}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons color={Colors.primary} name="shield-account" size={32} />
            </View>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? (
              <Text style={styles.subtitle}>{subtitle}</Text>
            ) : (
              <Text style={styles.subtitle}>Enter your PIN to access parent controls</Text>
            )}
          </View>

          <Animated.View style={[styles.pinDisplay, shakeAnimatedStyle]}>
            {Array.from({ length: 4 }).map((_, index) => (
              <PinDot
                key={index}
                index={index}
                isFilled={index < pin.length}
                isError={gateState === 'error' && pin.length === 0 && !isLockedOut}
                isSuccess={gateState === 'success'}
                dotOpacity={dotOpacityValues[index]}
                successCheckmarkStyle={successCheckmarkStyle}
              />
            ))}
          </Animated.View>

          {isLockedOut ? (
            <View style={styles.lockoutContainer}>
              <MaterialCommunityIcons color={Colors.errorText} name="account-clock-outline" size={20} />
              <View style={styles.lockoutCopy}>
                <Text style={styles.lockoutTitle}>{PIN_LOCKOUT_MESSAGE}</Text>
                <Text style={styles.lockoutCountdown}>{lockoutCountdownLabel} remaining</Text>
              </View>
            </View>
          ) : null}

          {errorMessage && gateState === 'error' && !isLockedOut && (
            <View style={styles.errorContainer}>
              <MaterialCommunityIcons color={Colors.errorText} name="alert-circle" size={16} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {gateState === 'submitting' && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color={Colors.primary} size="small" />
              <Text style={styles.loadingText}>Verifying...</Text>
            </View>
          )}

          <View style={styles.keypadContainer}>
            <View style={styles.keypadGrid}>
              {PIN_DIGITS.map((digit, index) => renderKey(digit, index))}
            </View>
          </View>

          {/* a11y: Cancel keeps the child in their current child-safe screen. */}
          <Pressable
            accessibilityLabel="Cancel and return to child space"
            accessibilityRole="button"
            disabled={gateState === 'submitting'}
            onPress={handleCancel}
            style={({ pressed }) => [styles.cancelButton, pressed && styles.cancelButtonPressed]}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 26, 46, 0.45)',
  },
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 0,
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radii.xxl,
    borderTopRightRadius: Radii.xxl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: Radii.full,
    backgroundColor: Colors.primaryFixed,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.headline,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    ...Typography.body,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  pinDisplay: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: Radii.full,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDotFilled: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryFixed,
  },
  pinDotError: {
    borderColor: Colors.error,
  },
  pinDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  successCheckmark: {
    position: 'absolute',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  errorText: {
    ...Typography.captionMedium,
    color: Colors.errorText,
  },
  lockoutContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    borderRadius: Radii.lg,
    backgroundColor: Colors.errorContainer,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.md,
  },
  lockoutCopy: {
    flexShrink: 1,
    gap: 2,
  },
  lockoutTitle: {
    ...Typography.captionMedium,
    color: Colors.errorText,
  },
  lockoutCountdown: {
    ...Typography.caption,
    color: Colors.errorText,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    height: 24,
  },
  loadingText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  keypadContainer: {
    marginBottom: Spacing.lg,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  keyButton: {
    width: Sizing.minTapTarget * 1.1,
    height: Sizing.minTapTarget * 1.1,
    minWidth: 72,
    minHeight: 56,
    borderRadius: Radii.lg,
    backgroundColor: Colors.surfaceContainerLow,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    marginVertical: 4,
  },
  keyButtonPressed: {
    backgroundColor: Colors.surfaceContainerHigh,
    transform: [{ scale: 0.96 }],
  },
  keyButtonDisabled: {
    opacity: 0.5,
  },
  keyText: {
    ...Typography.title,
    color: Colors.text,
  },
  cancelButton: {
    alignSelf: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    minHeight: Sizing.minTapTarget,
    justifyContent: 'center',
  },
  cancelButtonPressed: {
    opacity: 0.7,
  },
  cancelButtonText: {
    ...Typography.bodySemiBold,
    color: Colors.primary,
  },
});
