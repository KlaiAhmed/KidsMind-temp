import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

const PIN_LENGTH = 4;
const CURSOR_BLINK_DURATION_MS = 300;
const CURSOR_BOX_HEIGHT = 54;

export interface PinInputProps {
  value: string;
  onChange: (val: string) => void;
  hasError?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  label?: string;
}

export interface PinInputHandle {
  focus: () => void;
  blur: () => void;
}

export const PinInput = forwardRef<PinInputHandle, PinInputProps>(function PinInput(
  { value, onChange, hasError = false, disabled = false, autoFocus = false, label },
  ref,
) {
  const inputRef = useRef<TextInput>(null);
  const cursorOpacity = useRef(new Animated.Value(0)).current;
  const cursorAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const { width } = useWindowDimensions();

  const horizontalPadding = Spacing.sm;
  const gap = Spacing.md;
  const boxWidth = Math.max(
    44,
    Math.floor((width - horizontalPadding * 2 - gap * (PIN_LENGTH)) / PIN_LENGTH),
  );
  const activeBoxIndex = Math.min(value.length, PIN_LENGTH - 1);

  useImperativeHandle(ref, () => ({
    focus: () => {
      inputRef.current?.focus();
    },
    blur: () => {
      inputRef.current?.blur();
    },
  }));

  useEffect(() => {
    if (autoFocus && !disabled) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    cursorAnimation.current?.stop();

    if (!isFocused || disabled || value.length >= PIN_LENGTH) {
      cursorOpacity.stopAnimation(() => {
        cursorOpacity.setValue(0);
      });
      return;
    }

    cursorOpacity.setValue(0);

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: CURSOR_BLINK_DURATION_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: CURSOR_BLINK_DURATION_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );

    cursorAnimation.current = loop;
    loop.start();

    return () => {
      loop.stop();
    };
  }, [cursorOpacity, disabled, isFocused, value.length]);

  useEffect(() => {
    if (disabled && isFocused) {
      inputRef.current?.blur();
    }
  }, [disabled, isFocused]);

  const handleChangeText = (text: string) => {
    if (disabled) {
      return;
    }

    const normalized = text.replace(/\D/g, '').slice(0, PIN_LENGTH);
    onChange(normalized);
  };

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[styles.row, { paddingHorizontal: horizontalPadding, gap }]}> 
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChangeText}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          keyboardType="number-pad"
          maxLength={PIN_LENGTH}
          caretHidden
          secureTextEntry={false}
          editable={!disabled}
          style={styles.hiddenInput}
        />

        {Array.from({ length: PIN_LENGTH }).map((_, index) => {
          const digit = value[index];
          const isFilled = Boolean(digit);
          const isActive = isFocused && !disabled && !isFilled && index === activeBoxIndex;
          const borderColor = hasError
            ? Colors.error
            : isActive
              ? Colors.inputBorderFocused
              : isFilled
                ? Colors.outlineVariant
                : Colors.inputBorder;
          const backgroundColor = isFilled
            ? Colors.surfaceContainerLow
            : isActive
              ? Colors.surfaceContainerLowest
              : Colors.white;

          return (
            <Pressable
              key={`pin-box-${index}`}
              disabled={disabled}
              onPress={() => inputRef.current?.focus()}
              accessibilityRole="button"
              accessibilityLabel={label ? `${label} digit ${index + 1}` : `PIN digit ${index + 1}`}
              style={({ pressed }) => [
                styles.box,
                {
                  width: boxWidth,
                  height: CURSOR_BOX_HEIGHT,
                  borderColor,
                  backgroundColor,
                  borderWidth: isActive ? 2 : 1,
                  opacity: disabled ? 0.72 : pressed ? 0.96 : 1,
                },
              ]}
            >
              {isFilled ? (
                <Text style={styles.digit}>{'•'}</Text>
              ) : isActive ? (
                <Animated.View style={[styles.cursor, { opacity: cursorOpacity }]} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    gap: Spacing.xs,
  },
  label: {
    ...Typography.captionMedium,
    color: Colors.inputLabel,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
  },
  hiddenInput: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
  box: {
    borderRadius: Radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: {
    ...Typography.headline,
    fontSize: 28,
    lineHeight: 28,
    color: Colors.text,
    includeFontPadding: false,
    textAlign: 'center',
  },
  cursor: {
    width: 2,
    height: 20,
    borderRadius: Radii.full,
    backgroundColor: Colors.primary,
  },
});

export default PinInput;