/** Hook that uses IntersectionObserver to reveal elements when they scroll into view. */

import { useRef, useState, useEffect } from 'react';
import type { ScrollRevealOptions } from '../types';
import { useReducedMotionPreference } from './useReducedMotionPreference';

/**
 * useScrollReveal — Attaches an IntersectionObserver to a ref and exposes
 * an `isVisible` flag that flips to `true` once the element enters the viewport.
 *
 * @param options - Optional thresholds, root margin, and one-shot behaviour
 * @returns ref       - Attach this to the element you want to observe
 * @returns isVisible - Whether the element is currently (or has been) visible
 */
const useScrollReveal = (options?: ScrollRevealOptions): {
  ref: React.RefObject<HTMLElement | null>;
  isVisible: boolean;
} => {
  const ref = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const isReducedMotion = useReducedMotionPreference();

  const threshold = options?.threshold ?? 0.15;
  const rootMargin = options?.rootMargin ?? '0px 0px -60px 0px';
  const once = options?.once ?? true;

  useEffect(() => {
    if (isReducedMotion) {
      return;
    }

    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isReducedMotion, threshold, rootMargin, once]);

  return { ref, isVisible: isReducedMotion || isVisible };
};

export { useScrollReveal };
