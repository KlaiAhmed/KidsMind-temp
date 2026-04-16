import { useState } from 'react';
import { TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FormTextInput, type FormTextInputProps } from './FormTextInput';
import { Colors } from '@/constants/theme';

export interface PasswordInputProps extends Omit<FormTextInputProps, 'leftIcon' | 'secureTextEntry'> {
  /** Override the icon shown on the left. Defaults to "lock-outline". */
  leftIcon?: React.ReactNode;
}

export function PasswordInput({ leftIcon, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  const lockIcon = (
    <MaterialCommunityIcons
      name="lock-outline"
      size={20}
      color={Colors.placeholder}
    />
  );

  const eyeIcon = (
    <TouchableOpacity
      onPress={() => setVisible((v) => !v)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Hide password' : 'Show password'}
    >
      <MaterialCommunityIcons
        name={visible ? 'eye-off-outline' : 'eye-outline'}
        size={20}
        color={Colors.placeholder}
      />
    </TouchableOpacity>
  );

  return (
    <FormTextInput
      leftIcon={leftIcon ?? lockIcon}
      secureTextEntry={!visible}
      autoCapitalize="none"
      rightAccessory={eyeIcon}
      {...rest}
    />
  );
}
