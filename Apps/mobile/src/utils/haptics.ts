/**
 * haptics.ts
 * Thin wrapper around expo-haptics.
 * Keeps call sites clean and provides a single place to add
 * a global enabled/disabled guard when ChildRules.hapticFeedbackEnabled
 * is wired to the backend.
 *
 * Usage: triggerHaptic('wrongPassword')  — fire and forget, no await needed.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
export type HapticEvent =
  | 'wrongPassword'
  | 'wrongPinSetup'
  | 'timeLimitWarning'
  | 'timeLimitReached';
const EVENT_MAP: Record<HapticEvent, () => Promise<void>> = {
  wrongPassword:    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  wrongPinSetup:    () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  timeLimitWarning: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  timeLimitReached: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};
/**
 * @param event  - semantic event name
 * @param enabled - pass false to suppress (future: wired to ChildRules.hapticFeedbackEnabled)
 */
export function triggerHaptic(event: HapticEvent, enabled = true): void {
  if (!enabled) return;
  if (Platform.OS === 'web') return;          // silent fail on web builds
  EVENT_MAP[event]().catch(() => undefined);  // fire-and-forget, never throws
}
