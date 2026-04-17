import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors, Radii, Spacing, Typography } from '@/constants/theme';

interface WizardStepIndicatorProps {
  step: number;
  totalSteps?: number;
}

function WizardStepIndicatorComponent({
  step,
  totalSteps = 5,
}: WizardStepIndicatorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.counterText}>Step {step} of {totalSteps}</Text>
      <View style={styles.row}>
        {Array.from({ length: totalSteps }).map((_, index) => {
          const currentStep = index + 1;
          const active = currentStep <= step;

          return (
            <View
              key={`wizard-dot-${currentStep}`}
              style={[styles.dot, active ? styles.dotActive : null]}
              accessibilityLabel={`Step ${currentStep}`}
            />
          );
        })}
      </View>
    </View>
  );
}

export const WizardStepIndicator = memo(WizardStepIndicatorComponent);

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  counterText: {
    ...Typography.captionMedium,
    color: Colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  dot: {
    flex: 1,
    height: 8,
    borderRadius: Radii.full,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  dotActive: {
    backgroundColor: Colors.primary,
  },
});
