import { useContext } from 'react';
import { AccessibilityContext } from '../stores/AccessibilityContext';
import type { AccessibilityContextValue } from '../stores/AccessibilityContext';

const useAccessibility = (): AccessibilityContextValue => {
  const context = useContext(AccessibilityContext);

  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider.');
  }

  return context;
};

export { useAccessibility };
