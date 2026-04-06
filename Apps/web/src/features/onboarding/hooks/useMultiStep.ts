/** Hook for navigating multi-step flows with progress tracking. */

import { useState, useCallback, useMemo } from 'react';
import type { UseMultiStepReturn } from '../types';

/**
 * useMultiStep — Multi-step flow navigation hook.
 *
 * Manages current step index, progress calculation,
 * forward/back navigation, and direct step jumping.
 *
 * @param totalSteps - Total number of steps in the flow
 * @param initialStep - Optional starting step index (default: 0)
 * @returns UseMultiStepReturn
 *
 * @example
 * const { currentStepIndex, goToNextStep, progressPercent } = useMultiStep(4);
 */
const useMultiStep = (
  totalSteps: number,
  initialStep: number = 0
): UseMultiStepReturn => {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStep);

  /** Progress as a percentage based on the current step position */
  const progressPercent = useMemo(
    () => Math.round((currentStepIndex / (totalSteps - 1)) * 100),
    [currentStepIndex, totalSteps]
  );

  const isFirstStep = currentStepIndex === 0;
  const isFinalStep = currentStepIndex === totalSteps - 1;

  /** Advance to the next step if not already on the final step */
  const goToNextStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
  }, [totalSteps]);

  /** Return to the previous step if not already on the first step */
  const goToPreviousStep = useCallback(() => {
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  /** Jump directly to a specific step, clamped to valid bounds */
  const goToStep = useCallback(
    (index: number) => {
      setCurrentStepIndex(Math.max(0, Math.min(index, totalSteps - 1)));
    },
    [totalSteps]
  );

  return {
    currentStepIndex,
    totalSteps,
    progressPercent,
    isFirstStep,
    isFinalStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
  };
};

export { useMultiStep };
